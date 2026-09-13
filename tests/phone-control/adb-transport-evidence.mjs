// Test-only stderr counts. These facts never authorize retries or qualify success.
export const ADB_STDERR_MAX_BYTES = 16 * 1024;
export const ADB_STDERR_MAX_LINE_BYTES = 1024;

const prefix = '(?:adb: (?:error: )?|error: )';
const patterns = [
  ['device_offline', 'device offline'],
  ['device_not_found', "device '[A-Za-z0-9_.:-]{1,128}' not found"],
  ['no_devices', 'no devices/emulators found'],
  ['unauthorized', 'device unauthorized\\.?'],
  ['multiple_devices', 'more than one device/emulator'],
  ['connection_closed', '(?:closed|connection closed)'],
  ['connection_reset', '(?:failed to read command: )?Connection reset by peer'],
  ['broken_pipe', '(?:failed to read command: )?Broken pipe'],
  ['protocol_fault', "protocol fault \\(couldn't read status\\)(?:: (?:Success|Connection reset by peer|Broken pipe))?"],
  ['command_read_failed', 'failed to read command: (?:Success|No error|EOF|unexpected EOF)'],
].map(([name, body]) => [name, new RegExp('^' + prefix + body + '$', 'u')]);

export function createAdbTransportEvidence() {
  const markers = Object.fromEntries(patterns.map(([name]) => [name, 0]));
  const line = Buffer.alloc(ADB_STDERR_MAX_LINE_BYTES);
  let processed = 0, length = 0, discardedLines = 0, oversizedLines = 0;
  let skipping = false, invalid = false, truncated = false, incompleteLine = false, finished = false;
  function clearLine() { line.fill(0, 0, length); length = 0; invalid = false; }
  function completeLine() {
    if (!skipping) {
      let end = length;
      // ADB can add one carriage return to an existing CRLF on Windows.
      if (end && line[end - 1] === 13) end--;
      if (end && line[end - 1] === 13) end--;
      const text = line.subarray(0, end).toString('ascii');
      const match = !invalid && patterns.find(([, pattern]) => pattern.test(text));
      if (match) markers[match[0]]++;
      else if (length) discardedLines++;
    }
    clearLine(); skipping = false;
  }
  function write(chunk) {
    if (finished) return;
    if (!Buffer.isBuffer(chunk)) { truncated = true; skipping = true; clearLine(); return; }
    const take = Math.min(chunk.length, ADB_STDERR_MAX_BYTES - processed);
    for (let i = 0; i < take; i++) {
      const byte = chunk[i];
      if (byte === 10) { completeLine(); continue; }
      if (skipping) continue;
      if (length === ADB_STDERR_MAX_LINE_BYTES) {
        oversizedLines++; truncated = true; skipping = true; clearLine(); continue;
      }
      if (byte !== 13 && (byte < 32 || byte > 126)) invalid = true;
      line[length++] = byte;
    }
    processed += take;
    if (take !== chunk.length) {
      truncated = true; incompleteLine ||= length > 0 || skipping; clearLine(); skipping = false;
    }
  }
  function snapshot() {
    return Object.freeze({ markers: Object.freeze({ ...markers }), discardedLines, oversizedLines, truncated,
      incompleteLine: incompleteLine || length > 0 || skipping });
  }
  function finish() {
    incompleteLine ||= length > 0 || skipping;
    clearLine(); skipping = false; finished = true;
    return snapshot();
  }
  return Object.freeze({ write, snapshot, finish });
}
