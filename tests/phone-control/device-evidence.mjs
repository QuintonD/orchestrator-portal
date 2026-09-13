// Test-only provenance: fractional Android releases must not collapse into the same API number.
import assert from 'node:assert/strict';
export function readEmulatorEvidence(adb) {
  assert.equal(adb('shell', 'getprop', 'ro.kernel.qemu').trim(), '1', 'emulator_required');
  const lines = adb('emu', 'avd', 'name').split(/[\r\n]+/u).map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.length === 2 && lines[1] === 'OK' && /^orchestrator-phone-control(?:-[A-Za-z0-9_.-]+)?$/u.test(lines[0]), 'dedicated_avd_required');
  const sdk = Number(adb('shell', 'getprop', 'ro.build.version.sdk').trim());
  assert.ok(Number.isInteger(sdk) && sdk >= 34 && sdk <= 100, 'supported_api_required');
  const fingerprint = adb('shell', 'getprop', 'ro.build.fingerprint').trim();
  assert.ok(fingerprint.length > 0 && fingerprint.length <= 256 && /^[A-Za-z0-9_./:,+-]+$/u.test(fingerprint), 'invalid_platform_fingerprint');
  const sdkFull = adb('shell', 'getprop', 'ro.build.version.sdk_full').trim();
  assert.ok(sdkFull === '' || /^[0-9]{2,8}(?:\.[0-9]{1,3})?$/u.test(sdkFull), 'invalid_full_sdk');
  return { avd: lines[0], sdk, ...(sdkFull ? { sdkFull } : {}), fingerprint };
}
