import test from 'node:test';
import assert from 'node:assert/strict';
import { readEmulatorEvidence } from './device-evidence.mjs';
function fixture(overrides = {}) {
  const answers = { 'ro.kernel.qemu': '1', 'name': 'orchestrator-phone-control-api361-google-20260913\r\r\nOK\r\n', 'ro.build.version.sdk': '36', 'ro.build.version.sdk_full': '36.1', 'ro.build.fingerprint': 'google/sdk_phone64/emu:16/TEST/14574095:userdebug/dev-keys', ...overrides };
  return (...args) => answers[args.at(-1)];
}
test('records fractional release and exact fingerprint with Android console CRCRLF', () => {
  assert.equal(readEmulatorEvidence(fixture()).sdkFull, '36.1');
  assert.equal(readEmulatorEvidence(fixture()).sdk, 36);
});
test('older supported SDK omits missing fractional property', () => {
  assert.equal(readEmulatorEvidence(fixture({ 'ro.build.version.sdk': '34', 'ro.build.version.sdk_full': '' })).sdkFull, undefined);
});
test('rejects physical, unrelated or malformed emulator console identities', () => {
  for (const overrides of [{ 'ro.kernel.qemu': '0' }, { name: 'Error: orchestrator-phone-control-api361\nOK' }, { name: 'orchestrator-phone-control-api361\nBAD' }, { name: 'original-user-device\nOK' }]) assert.throws(() => readEmulatorEvidence(fixture(overrides)));
});
test('rejects arbitrary or unbounded build properties without including values in diagnostic', () => {
  const canary = 'private canary';
  for (const overrides of [{ 'ro.build.fingerprint': canary }, { 'ro.build.version.sdk_full': canary }, { 'ro.build.version.sdk': '33' }]) {
    assert.throws(() => readEmulatorEvidence(fixture(overrides)), (error) => !error.message.includes(canary));
  }
});
