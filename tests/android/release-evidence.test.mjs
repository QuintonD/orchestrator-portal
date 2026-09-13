import test from "node:test";
import assert from "node:assert/strict";
import { installedApkPath, installedReleaseIdentity, validateReleaseRetry } from "./release-evidence.mjs";

const dump = "    appId=10229\n    versionCode=9 minSdk=26 targetSdk=36\n    versionName=0.1.0-alpha.7\n      firstInstallTime=2026-09-13 10:11:37\n";
const installation = installedReleaseIdentity(dump);
const digest = "a".repeat(64);
const prior = { serial: "emulator-5588", passed: false, apkSha256: digest };
const current = { serial: "emulator-5588", apkSha256: digest, installedSha256: digest, installation };

test("installed APK path permits only one exact gateway base APK", () => {
  for (const prefix of ["/data/app/~~a_bc-X==/", "/data/app/"])
    assert.equal(installedApkPath(`package:${prefix}io.github.quintond.orchestrator-ABC_1==/base.apk\r\n`), `${prefix}io.github.quintond.orchestrator-ABC_1==/base.apk`);
  for (const value of ["package:/data/local/tmp/base.apk", "package:/data/app/io.github.quintond.orchestrator.debug-abc/base.apk", "package:/data/app/io.github.other-abc/base.apk", "package:/data/app/../io.github.quintond.orchestrator-abc/base.apk", "package:/data/app/io.github.quintond.orchestrator-abc/../../base.apk", "package:/data/app/io.github.quintond.orchestrator-abc/base.apk\npackage:/data/app/io.github.quintond.orchestrator-abc/split.apk", "error: package:/data/app/io.github.quintond.orchestrator-abc/base.apk", "package:/data/app/io.github.quintond.orchestrator-abc/base.apk extra", "package:C:\\owner\\base.apk"])
    assert.throws(() => installedApkPath(value));
});
test("installation identity requires unique complete UID, version and first installation records", () => {
  assert.deepEqual(installedReleaseIdentity(dump.replace("appId=", "userId=")), installation);
  for (const value of [dump.replace("appId=10229", ""), dump + "appId=10230\n", dump.replace("versionCode=9", "versionCode=0"), dump.replace("alpha.7", "beta.7"), dump.replace("firstInstallTime=2026-09-13 10:11:37", "firstInstallTime=unknown"), dump + "versionName=0.1.0-alpha.6\n"])
    assert.throws(() => installedReleaseIdentity(value));
});
test("linked retry accepts matching actual APK bytes and records legacy identity limits", () => {
  assert.deepEqual(validateReleaseRetry(prior, current), { installSkipped: true, priorInstallationRecorded: false, installedApkSha256: digest, resumedAt: "gateway-address" });
  assert.deepEqual(validateReleaseRetry({ ...prior, installationBefore: installation, installationAfter: installation }, current), { installSkipped: true, priorInstallationRecorded: true, installedApkSha256: digest, resumedAt: "gateway-address" });
});
test("passed, foreign-device, changed-candidate and different-installed-APK evidence cannot authorize retry", () => {
  for (const change of [{ passed: true }, { passed: "false" }, { serial: "emulator-5576" }, { apkSha256: "b".repeat(64) }, { apkSha256: "invalid" }])
    assert.throws(() => validateReleaseRetry({ ...prior, ...change }, current));
  for (const change of [{ apkSha256: "b".repeat(64) }, { installedSha256: "b".repeat(64) }, { serial: "physical-device" }])
    assert.throws(() => validateReleaseRetry(prior, { ...current, ...change }));
});
test("retry cannot conceal a reinstall, UID change, or changed version from earlier captured identity", () => {
  for (const field of ["installationBefore", "installationAfter"]) for (const change of [{ firstInstallTime: "2026-09-13 10:12:00" }, { userId: "10230" }, { versionCode: 8 }, { versionName: "0.1.0-alpha.6" }])
    assert.throws(() => validateReleaseRetry({ ...prior, [field]: { ...installation, ...change } }, current));
});
test("later incomplete phases repeat authentication only with recorded installation identity", () => {
  for (const stage of ["private-login", "navigation-and-session", "offline-recovery"]) {
    assert.equal(validateReleaseRetry({ ...prior, stage, installationBefore: installation }, current).resumedAt, "private-login");
    assert.throws(() => validateReleaseRetry({ ...prior, stage }, current), /recorded installation identity/);
  }
  for (const stage of ["complete", "unknown", null])
    assert.throws(() => validateReleaseRetry({ ...prior, stage }, current), /incomplete smoke phase/);
});
