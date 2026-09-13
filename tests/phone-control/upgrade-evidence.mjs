// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../../components/phone-control/ATTRIBUTION.md.
export function installedIdentity(value) {
  return { versionCode: Number(value.match(/versionCode=(\d+)/u)?.[1] ?? 0), versionName: value.match(/versionName=([^\s]+)/u)?.[1], userId: value.match(/(?:appId|userId)=(\d+)/u)?.[1], firstInstallTime: value.match(/firstInstallTime=([^\r\n]+)/u)?.[1]?.trim(), notificationGranted: /android\.permission\.POST_NOTIFICATIONS: granted=true/u.test(value) };
}
export function sameInstallation(before, after) {
  return Boolean(before.userId && before.firstInstallTime) && before.userId === after.userId && before.firstInstallTime === after.firstInstallTime;
}
export function verifiedSnapshot(value) {
  if (typeof value !== 'string' || value.length > 4096) return undefined;
  // Accept one exact raw result, including its phase and framework outcome.
  // Substrings, repeated records and conflicting completion codes are not proof.
  const lines = value.split(/\r?\n/u).filter((line) => line !== '');
  if (lines.length !== 4 || lines.at(-1) !== 'INSTRUMENTATION_CODE: -1') return undefined;
  const results = lines.slice(0, -1);
  if (results.filter((line) => line === 'INSTRUMENTATION_RESULT: stream=PHONE_UPGRADE_VERIFIED').length !== 1 || results.filter((line) => line === 'INSTRUMENTATION_RESULT: upgrade_phase=verify').length !== 1) return undefined;
  return results.map((line) => line.match(/^INSTRUMENTATION_RESULT: upgrade_snapshot=([a-f0-9]{64})$/u)?.[1]).find(Boolean);
}
