import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import releasePackage from "../package.json" with { type: "json" };
import brokerPackage from "../components/phone-control/package.json" with { type: "json" };
import { brokerFiles, companionHarnessFiles, gatewayHarnessFiles, desktopTargets, releaseAssets, validateInventory, validateWorkflow, unpackBrokerArchive, validateBrokerSource, parseBadging, validateAndroid, validateGatewayUpgrade, requiredGatewayChecks, validateCompanionUpgrade, requiredCompanionAssertions } from "./release-manifest.mjs";

const commit = "a".repeat(40);
const expected = { applicationId: "io.github.quintond.orchestrator.phonecontrol", version: "0.1.0-alpha.2", versionCode: 2, commit };
const baseline = { applicationId: expected.applicationId, versionCode: 1, versionName: "0.1.0-alpha.1", sha256: "b".repeat(64), signerSha256: "c".repeat(64), debuggable: false, source: { commit: "d".repeat(40), dirty: true, variant: "Release" } };
const candidate = { ...baseline, versionCode: 2, versionName: expected.version, sha256: "e".repeat(64), source: { commit, dirty: false, variant: "Release" } };
const inventory = releaseAssets("0.1.0-alpha.7", expected.version, "0.1.0-alpha.1");
const tooling = { probeSha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", fixtureSha256: "0000000000000000000000000000000000000000000000000000000000000000", harnessSources: companionHarnessFiles.map(path => ({ path, sha256: "2222222222222222222222222222222222222222222222222222222222222222" })) };
function proof() {
  return { kind: "signed-companion-in-place-upgrade", status: "passed", serial: "emulator-5556", startedAt: "2026-09-13T01:00:00Z", finishedAt: "2026-09-13T01:05:00Z", baseline: { ...structuredClone(baseline), path: "retained.apk" }, candidate: { ...structuredClone(candidate), path: "fresh.apk" }, harnessSources: structuredClone(tooling.harnessSources), platform: { sdk: "36" }, probeSha256: "f".repeat(64), fixtureSha256: "0".repeat(64), seedSnapshotSha256: "1".repeat(64), candidateSnapshotSha256: "1".repeat(64), assertions: requiredCompanionAssertions.map(name => ({ name, passed: true })), before: { versionCode: 1, versionName: baseline.versionName, userId: "10123", firstInstallTime: "2026-09-13 01:00:00", notificationGranted: true }, after: { versionCode: 2, versionName: candidate.versionName, userId: "10123", firstInstallTime: "2026-09-13 01:00:00", notificationGranted: true }, limits: ["Emulator evidence; retained pre-change baseline is not a published companion release."] };
}
const sourceFiles = new Map(await Promise.all(brokerFiles.map(async name => [name, await readFile(new URL(`../components/phone-control/${name}`, import.meta.url))])));
test("current release inventory follows each distribution's source version", async () => {
  const gradle = await readFile(new URL("../apps/phone-android/app/build.gradle", import.meta.url), "utf8");
  const companionVersion = gradle.match(/versionName '([^']+)'/)[1];
  const current = releaseAssets(releasePackage.version, companionVersion, brokerPackage.version);
  assert.equal(current.length, 9);
  assert.ok(current.includes(`orchestrator-${releasePackage.version}.apk`));
  assert.ok(current.includes(`phone-control-${companionVersion}.apk`));
  assert.ok(current.includes(`orchestrator-phone-control-${brokerPackage.version}.tgz`));
  for (const target of desktopTargets) assert.ok(current.includes(`orchestrator-${releasePackage.version}-${target}.${target.startsWith("win32") ? "zip" : "tar.gz"}`));
  const { previousCompanionVersion } = await import("./release-manifest.mjs");
  assert.equal(previousCompanionVersion, releasePackage.orchestratorRelease.previousCompanionVersion);
});
function tar(entries = [...sourceFiles], { type = "0", rename = name => `package/${name}`, duplicate = false, trailing = false } = {}) {
  const parts = [];
  for (const [index, [name, bytes]] of entries.entries()) {
    const header = Buffer.alloc(512);
    const put = (value, offset, length) => header.write(value, offset, length, "ascii");
    put(rename(name, index), 0, 100); put("0000644\0", 100, 8); put("0001750\0", 108, 8); put("0001750\0", 116, 8);
    put(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124, 12); put("00000000000\0", 136, 12);
    header.fill(32, 148, 156); put(index === 0 ? type : "0", 156, 1); put("ustar\0", 257, 6); put("00", 263, 2);
    const checksum = [...header].reduce((sum, value) => sum + value, 0); put(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
    if (duplicate && index === 0) parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024)); if (trailing) parts.push(Buffer.alloc(512, 1));
  return gzipSync(Buffer.concat(parts));
}

test("release inventory includes all nine independently versioned distributions", () => {
  assert.equal(inventory.length, 9); assert.equal(desktopTargets.length, 6);
  assert.ok(inventory.includes("phone-control-0.1.0-alpha.2.apk")); assert.ok(inventory.includes("orchestrator-phone-control-0.1.0-alpha.1.tgz"));
  validateInventory([...inventory, ...inventory.map(name => `${name}.sha256`), "release-manifest.json", "SHA256SUMS.txt", "SBOM.cdx.json"], inventory);
  assert.throws(() => validateInventory(inventory, inventory), /SBOM is required/);
  for (const extra of ["unexpected.exe", "old.tgz", "notes.txt", "keys.pem", "folder", "../release-manifest.json"]) assert.throws(() => validateInventory([...inventory, extra], inventory));
  assert.throws(() => validateInventory(inventory.filter(name => !name.endsWith(".tgz")), inventory));
  assert.throws(() => validateInventory([...inventory, inventory[0]], inventory));
  assert.throws(() => releaseAssets("0.2.0-beta.1", expected.version, "0.1.0-alpha.1"));
});
test("release requires successful same-main-commit runs of each exact workflow", () => {
  const run = { headSha: commit, conclusion: "success", workflowName: "Phone Control", headBranch: "main", event: "push" };
  validateWorkflow(run, "Phone Control", commit);
  for (const change of [{ headSha: "b".repeat(40) }, { conclusion: "failure" }, { workflowName: "CI" }, { headBranch: "feature" }, { event: "pull_request" }]) assert.throws(() => validateWorkflow({ ...run, ...change }, "Phone Control", commit));
});
test("broker archive includes exact typed SDK, deployment and legal source bytes", () => {
  const bytes = tar(); const decoded = unpackBrokerArchive(bytes); assert.equal(decoded.size, 21);
  const hashes = validateBrokerSource(bytes, sourceFiles); assert.equal(hashes.length, brokerFiles.length);
  for (const file of ["LICENSE", "NOTICE", "ATTRIBUTION.md", "src/task.d.mts", "deployment/Dockerfile"]) assert.ok(hashes.some(item => item.path === file && /^[a-f0-9]{64}$/.test(item.sha256)));
});
test("broker archive rejects stale or tampered runtime, legal and type declaration bytes", () => {
  for (const file of ["src/broker.mjs", "LICENSE", "src/client.d.mts", "deployment/host.mjs", "package.json"]) {
    const changed = new Map(sourceFiles); changed.set(file, Buffer.concat([changed.get(file), Buffer.from("\nchanged")]));
    assert.throws(() => validateBrokerSource(tar([...changed]), sourceFiles), /differs from the clean release source/);
  }
});
for (const [name, options] of [["symlink", { type: "2" }], ["hardlink", { type: "1" }], ["PAX metadata", { type: "x" }], ["traversal", { rename: (name, index) => index ? `package/${name}` : "package/../../owner.key" }], ["duplicate path", { duplicate: true }], ["trailing payload", { trailing: true }]]) {
  test(`broker archive rejects ${name} without extracting files`, () => assert.throws(() => unpackBrokerArchive(tar(undefined, options))));
}
test("broker archive rejects missing or extra files and malformed compressed data", () => {
  assert.throws(() => unpackBrokerArchive(tar([...sourceFiles].slice(1))));
  assert.throws(() => unpackBrokerArchive(tar([...sourceFiles, ["state.json", Buffer.from("{}")]])));
  assert.throws(() => unpackBrokerArchive(Buffer.from("not gzip")));
  assert.throws(() => unpackBrokerArchive(Buffer.alloc(8 * 1024 * 1024 + 1)), /size limit/);
});
test("APK metadata recognizes production identity and explicit debuggability", () => {
  assert.deepEqual(parseBadging("package: name='example' versionCode='2' versionName='0.1.0-alpha.2'\napplication-debuggable\n"), { applicationId: "example", versionCode: 2, versionName: "0.1.0-alpha.2", debuggable: true });
  assert.throws(() => parseBadging("unparseable"));
});
test("APK gate binds clean source, application, increasing versions and retained signer", () => {
  validateAndroid(candidate, baseline, expected);
  for (const change of [{ sha256: "bad" }, { debuggable: true }, { applicationId: `${expected.applicationId}.debug` }, { versionName: "0.1.0-alpha.1" }, { versionCode: 1 }, { signerSha256: "f".repeat(64) }, { source: { ...candidate.source, dirty: true } }, { source: { ...candidate.source, commit: "0".repeat(40) } }, { source: { ...candidate.source, variant: "Debug" } }]) assert.throws(() => validateAndroid({ ...candidate, ...change }, baseline, expected));
  assert.throws(() => validateAndroid(candidate, { ...baseline, versionCode: 2 }, expected));
  assert.throws(() => validateAndroid(candidate, { ...baseline, debuggable: true }, expected));
});
const gatewayOptions = {
  version: "0.1.0-alpha.7", previousVersion: "0.1.0-alpha.6",
  artifacts: { "orchestrator-0.1.0-alpha.7.apk": "1".repeat(64), "orchestrator-0.1.0-alpha.7-win32-x64.zip": "2".repeat(64), "orchestrator-0.1.0-alpha.6.apk": "3".repeat(64), "orchestrator-0.1.0-alpha.6-win32-x64.zip": "4".repeat(64) },
  harnessSources: gatewayHarnessFiles.map(path => ({ path, sha256: "5".repeat(64) })),
};
function gatewayProof() {
  return { ...structuredClone(gatewayOptions), target: "win32-x64", serial: "emulator-5586", passed: true,
    checks: requiredGatewayChecks(gatewayOptions.previousVersion), recordPreservation: { preservedRecords: 8, migratedCompass: true, refreshedReports: 1 } };
}
test("complete gateway proof binds eleven actual harness checks, records and all four artifacts", async () => {
  const harness = await readFile(new URL("../tests/release-upgrade.mjs", import.meta.url), "utf8");
  const literal = harness.match(/evidence\.checks = (\[[^\r\n]+\]);/)[1];
  const actual = JSON.parse(JSON.stringify(runInNewContext(literal, { previousVersion: gatewayOptions.previousVersion })));
  assert.equal(actual.length, 11); assert.deepEqual(requiredGatewayChecks(gatewayOptions.previousVersion), actual);
  assert.deepEqual(gatewayHarnessFiles, ["tests/release-upgrade.mjs", "tests/release-upgrade-records.mjs", "tests/android/native.mjs"]);
  validateGatewayUpgrade(gatewayProof(), gatewayOptions);
  const unchanged = gatewayProof(); unchanged.recordPreservation = { preservedRecords: 8, migratedCompass: false, refreshedReports: 0 };
  validateGatewayUpgrade(unchanged, gatewayOptions);
  const midnightRefresh = gatewayProof(); midnightRefresh.recordPreservation.refreshedReports = 2;
  validateGatewayUpgrade(midnightRefresh, gatewayOptions);
});
for (const [name, mutate] of [
  ["incomplete claimed success", value => { delete value.checks; delete value.recordPreservation; }],
  ["failed outcome", value => { value.passed = false; }],
  ["nonboolean outcome", value => { value.passed = "true"; }],
  ["cleanup error", value => { value.cleanupError = "unconfirmed"; }],
  ["unknown evidence field", value => { value.continuation = {}; }],
  ["physical target", value => { value.serial = "physical-example"; }],
  ["unknown desktop target", value => { value.target = "../other"; }],
  ["wrong version", value => { value.version = "0.1.0-alpha.6"; }],
  ["wrong baseline version", value => { value.previousVersion = "0.1.0-alpha.5"; }],
  ["missing check", value => { value.checks.pop(); }],
  ["duplicated check", value => { value.checks.push(value.checks[0]); }],
  ["reordered checks", value => { value.checks.reverse(); }],
  ["substituted check", value => { value.checks[0] = "claimed complete"; }],
  ["missing records", value => { delete value.recordPreservation; }],
  ["empty retained records", value => { value.recordPreservation.preservedRecords = 0; }],
  ["coerced record count", value => { value.recordPreservation.preservedRecords = "8"; }],
  ["fractional record count", value => { value.recordPreservation.preservedRecords = 1.5; }],
  ["unknown record field", value => { value.recordPreservation.extra = true; }],
  ["coerced migration flag", value => { value.recordPreservation.migratedCompass = 1; }],
  ["migration without refresh", value => { value.recordPreservation.refreshedReports = 0; }],
  ["unbounded refresh", value => { value.recordPreservation.refreshedReports = 3; }],
  ["coerced refresh count", value => { value.recordPreservation.refreshedReports = "1"; }],
  ["negative refresh count", value => { value.recordPreservation.refreshedReports = -1; }],
  ["missing source binding", value => { delete value.harnessSources; }],
  ["changed harness source", value => { value.harnessSources[0].sha256 = "6".repeat(64); }],
  ["changed native helper source", value => { value.harnessSources[2].sha256 = "6".repeat(64); }],
  ["missing native helper", value => { value.harnessSources.pop(); }],
  ["unknown source binding", value => { value.harnessSources.push({ path: "other.mjs", sha256: "6".repeat(64) }); }],
  ["extra artifact", value => { value.artifacts["other.zip"] = "6".repeat(64); }],
]) test(`gateway proof rejects ${name}`, () => { const value = gatewayProof(); mutate(value); assert.throws(() => validateGatewayUpgrade(value, gatewayOptions)); });
for (const name of Object.keys(gatewayOptions.artifacts)) test(`gateway proof rejects missing or substituted ${name}`, () => {
  const changed = gatewayProof(); changed.artifacts[name] = "6".repeat(64);
  assert.throws(() => validateGatewayUpgrade(changed, gatewayOptions));
  delete changed.artifacts[name]; assert.throws(() => validateGatewayUpgrade(changed, gatewayOptions));
});
test("gateway proof requires independently supplied complete artifact and source identities", () => {
  const options = structuredClone(gatewayOptions); delete options.artifacts["orchestrator-0.1.0-alpha.6-win32-x64.zip"];
  assert.throws(() => validateGatewayUpgrade(gatewayProof(), options));
  options.artifacts = gatewayOptions.artifacts; options.harnessSources[0].sha256 = "invalid";
  assert.throws(() => validateGatewayUpgrade(gatewayProof(), options));
});
test("gateway harness refuses changed input bytes or helper sources before recording success", async () => {
  const source = await readFile(new URL("../tests/release-upgrade.mjs", import.meta.url), "utf8");
  // Exercise the actual input-binding code with synthetic reads, without loading
  // the harness's emulator, browser, signing or application operations.
  const capture = source.slice(source.indexOf("const sha = "), source.indexOf("const sums = "));
  const verify = source.slice(source.indexOf("  assert.deepEqual(await snapshotArtifacts()"), source.indexOf("  evidence.passed = true;"));
  assert.ok(capture.includes("const initialArtifacts")); assert.ok(verify.includes("evidence.artifacts = initialArtifacts"));
  const paths = { previousArchive: "old.zip", nextArchive: "new.zip", previousApk: "old.apk", nextApk: "new.apk" };
  const names = [...Object.values(paths), ...gatewayHarnessFiles];
  for (const changed of [undefined, ...names]) {
    const files = new Map(names.map(name => [name, Buffer.from(`synthetic ${name}`)]));
    const evidence = {};
    const result = runInNewContext(`(async () => { ${capture}\n await mutate(); ${verify}\n })()`, {
      ...paths, version: gatewayOptions.version, path: { basename: name => name }, createHash, assert, evidence,
      readFile: async name => { assert.ok(files.has(name)); return files.get(name); },
      mutate: async () => { if (changed) files.set(changed, Buffer.from("changed bytes")); },
    });
    if (changed) { await assert.rejects(result, /changed during QA/); assert.equal(evidence.artifacts, undefined); }
    else { await result; assert.equal(Object.keys(evidence.artifacts).length, 4); }
  }
});

test("full in-place companion upgrade accepts exact inspected clean candidate and retained baseline", () => validateCompanionUpgrade(proof(), baseline, candidate, tooling));
for (const [name, mutate] of [
  ["failed run", value => { value.status = "failed"; }],
  ["missing assertion", value => { value.assertions = value.assertions.slice(1); }],
  ["false assertion", value => { value.assertions[0].passed = false; }],
  ["nonboolean assertion", value => { value.assertions[0].passed = "true"; }],
  ["stale candidate digest", value => { value.candidate.sha256 = "9".repeat(64); }],
  ["other candidate source", value => { value.candidate.source.commit = "9".repeat(40); }],
  ["substituted baseline", value => { value.baseline.sha256 = "9".repeat(64); }],
  ["missing settings snapshot", value => { delete value.seedSnapshotSha256; }],
  ["changed settings snapshot", value => { value.candidateSnapshotSha256 = "9".repeat(64); }],
  ["different UID", value => { value.after.userId = "10124"; }],
  ["empty original install identity", value => { value.before.firstInstallTime = ""; value.after.firstInstallTime = ""; }],
  ["reinstalled app", value => { value.after.firstInstallTime = "2026-09-13 01:05:00"; }],
  ["lost notification permission", value => { value.after.notificationGranted = false; }],
  ["wrong running version", value => { value.after.versionName = baseline.versionName; }],
  ["continuation record", value => { value.continuation = { passed: true }; }],
  ["continuation assertions without flag", value => { value.assertions.push({ name: "continuation_is_only_postupgrade_verifier_completion", passed: true }); }],
  ["duplicated assertion", value => { value.assertions.push(value.assertions[0]); }],
  ["reordered assertions", value => { value.assertions.reverse(); }],
  ["other probe artifact", value => { value.probeSha256 = "3".repeat(64); }],
  ["other fixture artifact", value => { value.fixtureSha256 = "3".repeat(64); }],
  ["missing harness source binding", value => { delete value.harnessSources; }],
  ["changed probe source", value => { value.harnessSources[2].sha256 = "3".repeat(64); }],
  ["physical-device substitution", value => { value.serial = "physical123"; }],
]) test(`companion proof rejects ${name}`, () => { const value = proof(); mutate(value); assert.throws(() => validateCompanionUpgrade(value, baseline, candidate, tooling)); });
