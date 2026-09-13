import assert from "node:assert/strict";

const sha256 = /^[a-f0-9]{64}$/;
const pkg = "io.github.quintond.orchestrator";

export function installedApkPath(value) {
  // Accept this non-split APK's package-manager record only. Never pass an
  // arbitrary shell path, another app, or an archive member to adb pull.
  const lines = value.trim().split(/\r?\n/);
  assert.equal(lines.length, 1, "One installed base APK is required");
  const match = lines[0].match(/^package:(\/data\/app\/(?:[A-Za-z0-9_~+=-]+\/)?io\.github\.quintond\.orchestrator-[A-Za-z0-9_~+=-]+\/base\.apk)$/);
  assert.ok(match && match[1].length <= 512, "Unexpected installed APK path");
  return match[1];
}

export function installedReleaseIdentity(value) {
  const field = (expression, name) => {
    const matches = [...value.matchAll(expression)];
    assert.equal(matches.length, 1, `One installed ${name} is required`);
    return matches[0][1];
  };
  const identity = {
    applicationId: pkg,
    userId: field(/^\s*(?:appId|userId)=(\d+)\s*$/gm, "application UID"),
    versionCode: Number(field(/^\s*versionCode=(\d+)(?: [^\r\n]*)?$/gm, "versionCode")),
    versionName: field(/^\s*versionName=([^\s]+)\s*$/gm, "versionName"),
    firstInstallTime: field(/^\s*firstInstallTime=(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/gm, "firstInstallTime"),
  };
  assert.ok(Number.isSafeInteger(identity.versionCode) && identity.versionCode > 0);
  assert.match(identity.versionName, /^0\.1\.0-alpha\.[1-9]\d*$/);
  assert.ok(Number.isFinite(Date.parse(identity.firstInstallTime)));
  return identity;
}

export function validateReleaseRetry(prior, { serial, apkSha256, installedSha256, installation }) {
  assert.equal(prior.passed, false, "Retry evidence must describe a failed smoke run");
  assert.match(serial, /^emulator-\d+$/); assert.equal(prior.serial, serial, "Retry must use the original emulator");
  for (const digest of [prior.apkSha256, apkSha256, installedSha256]) assert.match(digest, sha256);
  assert.equal(prior.apkSha256, apkSha256, "Retry must use the original candidate APK bytes");
  assert.equal(installedSha256, apkSha256, "Installed APK must match the candidate and failed run");
  assert.equal(installation.applicationId, pkg);
  assert.ok(installation.userId && installation.firstInstallTime, "Capture the retained installation before retry");
  assert.ok(prior.stage === undefined || ["gateway-startup", "gateway-address", "private-login", "navigation-and-session", "offline-recovery"].includes(prior.stage), "Only a recorded incomplete smoke phase may be retried");
  const addressCompleted = ["private-login", "navigation-and-session", "offline-recovery"].includes(prior.stage);
  if (addressCompleted) assert.ok(prior.installationBefore, "Later phases require recorded installation identity");
  // Older smoke records contain only the APK digest. Preserve that limitation
  // explicitly; newer records also prove continuity from the failed attempt.
  for (const name of ["installationBefore", "installationAfter"]) if (prior[name] !== undefined)
    assert.deepEqual(installation, prior[name], "Retry must retain the failed attempt's installation identity");
  return { installSkipped: true, priorInstallationRecorded: prior.installationBefore !== undefined,
    installedApkSha256: installedSha256, resumedAt: addressCompleted ? "private-login" : "gateway-address" };
}
