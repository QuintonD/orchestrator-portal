// Diagnostic byte counts only. Neither parser establishes emulator readiness.
const maximum = BigInt(Number.MAX_SAFE_INTEGER);
function count(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  return typeof value === 'bigint' && value >= 0n && value <= maximum ? value : null;
}
function bytes(blockSize, blocks, available) {
  if (blockSize === null || blocks === null || available === null || blockSize <= 0n || blocks <= 0n || available > blocks) return null;
  const totalBytes = blockSize * blocks; const availableBytes = blockSize * available;
  return totalBytes <= maximum ? { totalBytes: Number(totalBytes), availableBytes: Number(availableBytes) } : null;
}

/** Accept fs.statfs results with number or bigint fields, without retaining paths. */
export function hostStorageFacts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try { return bytes(count(value.bsize), count(value.blocks), count(value.bavail)); }
  catch { return null; }
}

/** Parse exactly one Android toybox `df -k /data` report; unknown formats stay null. */
export function guestStorageFacts(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  // adb on Windows may use CRCRLF. Standalone CR and additional lines are invalid.
  const lines = value.replace(/\r\r?\n/gu, '\n').replace(/\n$/u, '').split('\n');
  if (lines.length !== 2 || !/^Filesystem[ \t]+1K-blocks[ \t]+Used[ \t]+Available[ \t]+Use%[ \t]+Mounted[ \t]+on[ \t]*$/u.test(lines[0])) return null;
  const row = /^\/dev\/block\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+[ \t]+(0|[1-9]\d{0,15})[ \t]+(0|[1-9]\d{0,15})[ \t]+(0|[1-9]\d{0,15})[ \t]+(0|[1-9]\d?|100)%[ \t]+\/data[ \t]*$/u.exec(lines[1]);
  if (!row) return null;
  const total = BigInt(row[1]); const used = BigInt(row[2]); const available = BigInt(row[3]);
  if (used + available > total) return null;
  return bytes(1024n, total, available);
}
