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

/** Parse one Android `stat -f -c %S:%b:%a /data` record, without mount names. */
export function guestStorageFacts(value) {
  if (typeof value !== 'string' || value.length > 128) return null;
  // Remove at most one line ending; Android's Windows transport can use CRCRLF.
  const record = value.replace(/\r\r?\n$|\n$/u, '');
  if (/[\r\n]/u.test(record)) return null;
  const fields = /^(0|[1-9]\d{0,15}):(0|[1-9]\d{0,15}):(0|[1-9]\d{0,15})$/u.exec(record);
  return fields && fields[0] === record ? bytes(BigInt(fields[1]), BigInt(fields[2]), BigInt(fields[3])) : null;
}
