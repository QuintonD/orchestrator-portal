// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../../components/phone-control/ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installedIdentity, sameInstallation, verifiedSnapshot } from './upgrade-evidence.mjs';

test('Android 16 appId and older userId records produce the same required installation identity', () => {
  const record = '    appId=10227\n    versionCode=2 minSdk=34 targetSdk=36\n    versionName=0.1.0-alpha.2\n      firstInstallTime=2026-09-13 09:40:38\n      android.permission.POST_NOTIFICATIONS: granted=true';
  const parsed = installedIdentity(record); assert.equal(parsed.userId, '10227'); assert.equal(parsed.versionCode, 2); assert.equal(parsed.notificationGranted, true);
  assert.equal(sameInstallation(parsed, installedIdentity(record.replace('appId=', 'userId='))), true);
});
test('missing IDs, changed IDs and reinstall timestamps never count as preserved installation', () => {
  assert.equal(sameInstallation({}, {}), false);
  assert.equal(sameInstallation({ firstInstallTime: 'same' }, { firstInstallTime: 'same' }), false);
  const before = { userId: '10227', firstInstallTime: '2026-09-13 09:40:38' };
  assert.equal(sameInstallation(before, { ...before, userId: '10228' }), false);
  assert.equal(sameInstallation(before, { ...before, firstInstallTime: '2026-09-13 10:00:00' }), false);
});
test('formatted instrumentation success without its raw snapshot is insufficient upgrade evidence', () => {
  assert.equal(verifiedSnapshot('PHONE_UPGRADE_VERIFIED\n'), undefined);
  const raw = `INSTRUMENTATION_RESULT: stream=PHONE_UPGRADE_VERIFIED\n\nINSTRUMENTATION_RESULT: upgrade_phase=verify\nINSTRUMENTATION_RESULT: upgrade_snapshot=${'a'.repeat(64)}\nINSTRUMENTATION_CODE: -1\n`;
  assert.equal(verifiedSnapshot(raw), 'a'.repeat(64));
  assert.equal(verifiedSnapshot(raw.replace('CODE: -1', 'CODE: 0')), undefined);
  assert.equal(verifiedSnapshot(raw.replace('a'.repeat(64), 'a'.repeat(63))), undefined);
  for (const invalid of [raw + 'INSTRUMENTATION_CODE: 0\n', raw + 'INSTRUMENTATION_CODE: -1\n', raw.replace('stream=PHONE', 'stream=FAILED PHONE'), raw.replace('upgrade_phase=verify', 'upgrade_phase=seed'), raw.replace('INSTRUMENTATION_RESULT: upgrade_phase=verify\n', ''), raw.replaceAll('INSTRUMENTATION_', 'prefix INSTRUMENTATION_'), raw + 'PHONE_UPGRADE_FAILED\n', raw.replace('upgrade_phase=verify', 'upgrade_snapshot=' + 'b'.repeat(64))]) assert.equal(verifiedSnapshot(invalid), undefined);
  assert.equal(verifiedSnapshot(raw.replaceAll('\n', '\r\n')), 'a'.repeat(64));
});
