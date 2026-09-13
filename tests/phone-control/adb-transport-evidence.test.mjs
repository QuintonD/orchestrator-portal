import test from 'node:test';
import assert from 'node:assert/strict';
import { ADB_STDERR_MAX_BYTES, ADB_STDERR_MAX_LINE_BYTES, createAdbTransportEvidence } from './adb-transport-evidence.mjs';

const cases = [
  ['device_offline', 'adb: error: device offline'],
  ['device_not_found', "adb: device 'synthetic-device-123' not found"],
  ['no_devices', 'error: no devices/emulators found'],
  ['unauthorized', 'adb: device unauthorized.'],
  ['multiple_devices', 'adb: error: more than one device/emulator'],
  ['connection_closed', 'error: closed'],
  ['connection_reset', 'adb: failed to read command: Connection reset by peer'],
  ['broken_pipe', 'adb: error: Broken pipe'],
  ['protocol_fault', "adb: error: protocol fault (couldn't read status): Success"],
  ['command_read_failed', 'adb: failed to read command: Success'],
];
function evidence(text) {
  const collector = createAdbTransportEvidence(); collector.write(Buffer.from(text)); return collector.finish();
}

test('transport diagnostics export only fixed marker counts for complete recognized lines', () => {
  const result = evidence(cases.map(([, line]) => line).join('\n') + '\n');
  assert.deepEqual(result, { markers: Object.fromEntries(cases.map(([name]) => [name, 1])),
    discardedLines: 0, oversizedLines: 0, truncated: false, incompleteLine: false });
  assert.equal(result.passed, undefined);
  assert.equal(JSON.stringify(result).includes('synthetic-device-123'), false);
});

test('all byte boundaries and supported ADB line endings produce the same counts', () => {
  for (const ending of ['\n', '\r\n', '\r\r\n']) {
    const bytes = Buffer.from(cases.map(([, line]) => line).join(ending) + ending);
    const expected = evidence(bytes.toString());
    for (let split = 0; split <= bytes.length; split++) {
      const collector = createAdbTransportEvidence();
      collector.write(bytes.subarray(0, split)); collector.write(bytes.subarray(split));
      assert.deepEqual(collector.finish(), expected);
    }
    const collector = createAdbTransportEvidence();
    for (const byte of bytes) collector.write(Buffer.from([byte]));
    assert.deepEqual(collector.finish(), expected);
  }
});

test('private text, paths, identifiers and marker substrings never become output', () => {
  const privateText = 'synthetic-private-token-and-path';
  const lines = [privateText, 'C:/Users/' + privateText, 'private adb: error: device offline',
    'adb: error: device offline ' + privateText, 'adb: error: device offline.', 'device offline',
    'adb: error: connection reset by peer in ' + privateText, 'adb: error: ' + privateText,
    'adb: error: device \'C:/' + privateText + '\' not found'];
  const result = evidence(lines.join('\n') + '\n');
  assert.ok(Object.values(result.markers).every(count => count === 0));
  assert.equal(result.discardedLines, lines.length);
  assert.equal(JSON.stringify(result).includes(privateText), false);
});

test('non-ASCII, control bytes and malformed carriage returns invalidate the whole line', () => {
  for (const line of ['\u001badb: device offline', 'adb: device offline\0', 'adb: device offline\t',
    'adb: device offline\r\r\r', 'adb:\r device offline', 'adb: device offline\u2028',
    'adb: device offlin\u00e5', 'adb: device offline\u0080']) {
    const result = evidence(line + '\n');
    assert.equal(result.markers.device_offline, 0); assert.equal(result.discardedLines, 1);
  }
  const collector = createAdbTransportEvidence();
  collector.write(Buffer.from('private\u2028')); collector.write(Buffer.from('\nadb: device offline\n'));
  assert.equal(collector.finish().markers.device_offline, 1);
});

test('oversized lines cannot match their prefix or a later suffix but following lines can match', () => {
  const collector = createAdbTransportEvidence();
  collector.write(Buffer.from('adb: device offline' + 'x'.repeat(ADB_STDERR_MAX_LINE_BYTES)));
  collector.write(Buffer.from('adb: device offline\nadb: device offline\n'));
  const result = collector.finish();
  assert.equal(result.markers.device_offline, 1);
  assert.equal(result.oversizedLines, 1); assert.equal(result.truncated, true); assert.equal(result.incompleteLine, false);
});

test('total byte cap drops later markers and records a cut line without retaining private bytes', () => {
  const collector = createAdbTransportEvidence();
  const first = Buffer.from('adb: device offline\n');
  collector.write(first);
  collector.write(Buffer.alloc(ADB_STDERR_MAX_BYTES - first.length - 4, 10));
  collector.write(Buffer.from('adb: device offline\nsynthetic-private-data'.repeat(5000)));
  collector.write(Buffer.from('adb: device offline\n'));
  const result = collector.finish();
  assert.equal(result.markers.device_offline, 1); assert.equal(result.truncated, true); assert.equal(result.incompleteLine, true);
  assert.equal(JSON.stringify(result).includes('synthetic-private'), false);
  assert.equal(result.oversizedLines, 0);
});

test('exact complete byte budget is accepted but an additional byte records truncation', () => {
  const collector = createAdbTransportEvidence();
  collector.write(Buffer.alloc(ADB_STDERR_MAX_BYTES, 10));
  assert.equal(collector.snapshot().truncated, false);
  collector.write(Buffer.from('x'));
  const result = collector.finish();
  assert.equal(result.truncated, true); assert.equal(result.incompleteLine, false);
  assert.ok(Object.values(result.markers).every(count => count === 0));
});

test('unterminated output never counts as a recognized line and finish cannot be reopened', () => {
  const collector = createAdbTransportEvidence();
  collector.write(Buffer.from('adb: device offline'));
  const result = collector.finish();
  assert.equal(result.incompleteLine, true); assert.equal(result.markers.device_offline, 0);
  collector.write(Buffer.from('\nadb: device offline\n'));
  assert.deepEqual(collector.finish(), result);
});

test('snapshots are safe immutable copies and do not disturb a split line', () => {
  const collector = createAdbTransportEvidence(); collector.write(Buffer.from('adb: device '));
  const first = collector.snapshot();
  assert.equal(first.incompleteLine, true);
  assert.throws(() => { first.markers.device_offline = 99; });
  collector.write(Buffer.from('offline\n'));
  assert.equal(first.markers.device_offline, 0); assert.equal(collector.finish().markers.device_offline, 1);
});

test('unexpected chunk types stay private and cannot join two halves into a false marker', () => {
  const collector = createAdbTransportEvidence();
  collector.write(Buffer.from('adb: device ')); collector.write('synthetic-private-data');
  collector.write(Buffer.from('offline\nadb: device offline\n'));
  const result = collector.finish();
  assert.equal(result.markers.device_offline, 1); assert.equal(result.truncated, true);
  assert.equal(JSON.stringify(result).includes('synthetic-private-data'), false);
});
