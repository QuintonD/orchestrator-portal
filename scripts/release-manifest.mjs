// Assemble checksums only after source, CI artifacts and signed in-place upgrades agree.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const desktopTargets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"];
// This first companion distribution upgrades the retained pre-change signed
// alpha 1 build. It was not separately published. Update deliberately per release.
export const previousCompanionVersion = "0.1.0-alpha.1";
export const companionHarnessFiles = ["tests/phone-control/upgrade.mjs", "tests/phone-control/upgrade-evidence.mjs", "tests/phone-control/upgrade/UpgradeProbe.java"];
export const brokerFiles = ["ATTRIBUTION.md", "LICENSE", "NOTICE", "README.md", "package.json", "bin/phone-control.mjs", "src/broker.mjs", "src/client.mjs", "src/client.d.mts", "src/mcp.mjs", "src/pilot.mjs", "src/pilot.d.mts", "src/security.mjs", "src/validation.mjs", "src/response-proof.mjs", "src/task.mjs", "src/task.d.mts", "deployment/Dockerfile", "deployment/host.mjs", "deployment/guest.mjs", "deployment/protocol.mjs"].sort();
export const requiredCompanionAssertions = [
  "emulator_boot_completed", "target_is_emulator", "supported_android_version", "evidence_directory_not_reused",
  "apk_metadata_available", "embedded_release_source_identity_available", "apk_metadata_available", "embedded_release_source_identity_available", "production_application_id_retained",
  "both_companions_are_nondebuggable_releases", "dedicated_signing_identity_retained", "displayed_version_and_version_code_advance",
  "no_downgrade_or_replacement_of_candidate", "dedicated_native_forward_created", "previous_signed_version_has_live_session_before_upgrade",
  "previous_install_and_notification_setting_verified", "accessibility_setting_present_before_upgrade", "candidate_launches_with_new_version",
  "same_android_installation_and_uid_preserved", "notification_permission_preserved", "accessibility_setting_preserved",
  "old_active_authority_rejected_before_any_verifier_restart", "candidate_preserves_allowlists_pins_settings_bytes_and_defaults_disclosure_to_deny",
  "independently_read_state_snapshot_identical_after_upgrade",
];
const alpha = /^0\.1\.0-alpha\.[1-9]\d*$/;
const digest = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function releaseAssets(version, companionVersion, brokerVersion) {
  for (const value of [version, companionVersion, brokerVersion]) assert.match(value, alpha, "Distribution versions must remain alpha");
  return [...desktopTargets.map(target => `orchestrator-${version}-${target}.${target.startsWith("win32") ? "zip" : "tar.gz"}`), `orchestrator-${version}.apk`, `phone-control-${companionVersion}.apk`, `orchestrator-phone-control-${brokerVersion}.tgz`].sort();
}
export function validateInventory(entries, expected) {
  const allowed = new Set([...expected, ...expected.map(name => `${name}.sha256`), "release-manifest.json", "SHA256SUMS.txt", "SBOM.cdx.json"]);
  assert.ok(entries.every(name => allowed.has(name)), "Unknown staged files or distribution assets are forbidden");
  assert.deepEqual(entries.filter(name => expected.includes(name)).sort(), [...expected].sort(), "Exactly six desktop archives, gateway APK, companion APK and broker TGZ are required");
  assert.ok(entries.includes("SBOM.cdx.json"), "The source-bound release SBOM is required");
}
export function validateWorkflow(run, name, commit) {
  assert.equal(run.headSha, commit, "Workflow must validate the released commit");
  assert.equal(run.conclusion, "success"); assert.equal(run.workflowName, name);
  assert.equal(run.headBranch, "main"); assert.ok(["push", "workflow_dispatch"].includes(run.event));
}

// npm pack emits small regular-file ustar archives. Read bytes without extracting
// attacker-controlled paths or accepting links, duplicate entries or PAX overrides.
export function unpackBrokerArchive(compressed) {
  assert.ok(compressed.length <= 8 * 1024 * 1024, "Broker archive exceeds size limit");
  const bytes = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  assert.equal(bytes.length % 512, 0, "Truncated broker TAR");
  const files = new Map(); let offset = 0; let ended = false;
  const string = value => value.toString("utf8").split("\0")[0];
  const octal = value => { const text = string(value).trim(); assert.match(text, /^[0-7]+$/, "Invalid TAR number"); return Number.parseInt(text, 8); };
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      assert.ok(bytes.length - offset >= 1024 && bytes.subarray(offset).every(byte => byte === 0), "Invalid TAR end or trailing payload"); ended = true; break;
    }
    const checksum = [...header].reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
    assert.equal(octal(header.subarray(148, 156)), checksum, "Invalid TAR checksum");
    assert.ok(header[156] === 48 || header[156] === 0, "Only regular files may ship in the broker archive");
    assert.equal(string(header.subarray(157, 257)), "", "TAR links are forbidden");
    assert.equal(string(header.subarray(345, 500)), "", "TAR prefixes are forbidden");
    assert.equal(string(header.subarray(257, 263)), "ustar", "Only npm regular-file ustar archives are supported");
    const name = string(header.subarray(0, 100));
    assert.ok(brokerFiles.some(file => `package/${file}` === name), "Unexpected broker archive path");
    assert.ok(!files.has(name.slice(8)), "Duplicate broker archive path");
    const size = octal(header.subarray(124, 136));
    assert.ok(size <= 1024 * 1024 && offset + 512 + size <= bytes.length, "Invalid broker file size");
    files.set(name.slice(8), bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(ended, "Broker TAR is missing its end marker");
  assert.deepEqual([...files.keys()].sort(), brokerFiles, "Broker archive must contain the exact source allowlist");
  return files;
}
export function validateBrokerSource(compressed, sourceFiles) {
  const files = unpackBrokerArchive(compressed);
  for (const name of brokerFiles) assert.deepEqual(files.get(name), sourceFiles.get(name), `Broker archive ${name} differs from the clean release source`);
  const pkg = JSON.parse(files.get("package.json"));
  assert.equal(pkg.name, "@orchestrator/phone-control"); assert.equal(pkg.license, "AGPL-3.0-only"); assert.match(pkg.version, alpha);
  for (const name of ["client", "pilot", "task"]) assert.deepEqual(pkg.exports[`./${name}`], { types: `./src/${name}.d.mts`, default: `./src/${name}.mjs` });
  assert.equal(pkg.exports["./isolation"], "./deployment/host.mjs");
  return brokerFiles.map(name => ({ path: name, sha256: sha256(files.get(name)) }));
}
export function parseBadging(metadata) {
  const match = metadata.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  assert.ok(match, "APK metadata is required");
  return { applicationId: match[1], versionCode: Number(match[2]), versionName: match[3], debuggable: /^application-debuggable(?:\s|$)/m.test(metadata) };
}
export function validateAndroid(candidate, baseline, expected) {
  for (const item of [candidate, baseline]) {
    assert.equal(item.applicationId, expected.applicationId); assert.equal(item.debuggable, false);
    assert.ok(Number.isSafeInteger(item.versionCode) && item.versionCode > 0); assert.match(item.versionName, alpha);
    assert.match(item.sha256, digest); assert.match(item.signerSha256, digest);
  }
  assert.equal(candidate.versionName, expected.version); assert.equal(candidate.versionCode, expected.versionCode);
  assert.equal(candidate.signerSha256, baseline.signerSha256, "Preserve the retained baseline signing identity");
  assert.ok(candidate.versionCode > baseline.versionCode, "Android versionCode must increase");
  assert.ok(Number(candidate.versionName.split(".").at(-1)) > Number(baseline.versionName.split(".").at(-1)), "Displayed alpha version must increase");
  assert.deepEqual(candidate.source, { commit: expected.commit, dirty: false, variant: "Release" }, "APK must embed this clean release commit");
}
export function validateCompanionUpgrade(proof, baseline, candidate, tooling) {
  assert.equal(proof.kind, "signed-companion-in-place-upgrade"); assert.equal(proof.status, "passed");
  // Only full harness records qualify. A resumed verifier cannot establish that
  // an old active session was rejected during the tested install transition.
  const keys = ["kind", "serial", "startedAt", "finishedAt", "baseline", "candidate", "assertions", "status", "limits", "platform", "probeSha256", "fixtureSha256", "harnessSources", "seedSnapshotSha256", "candidateSnapshotSha256", "before", "after", "seedDiagnostic", "verifierDiagnostic"];
  assert.ok(Object.keys(proof).every(key => keys.includes(key)), "Unknown or continuation upgrade evidence is not accepted");
  assert.match(proof.serial, /^emulator-\d+$/); assert.ok(Number(proof.platform?.sdk) >= 34);
  assert.ok(Number.isFinite(Date.parse(proof.startedAt)) && Date.parse(proof.finishedAt) >= Date.parse(proof.startedAt));
  assert.match(proof.probeSha256, digest); assert.match(proof.fixtureSha256, digest);
  assert.ok(tooling, "Independently inspected upgrade tooling artifacts are required");
  assert.deepEqual(tooling.harnessSources?.map(item => item.path), companionHarnessFiles, "Every upgrade harness source must be independently inspected");
  for (const item of tooling.harnessSources) assert.match(item.sha256, digest);
  assert.equal(proof.probeSha256, tooling.probeSha256, "Upgrade probe must match the retained tested artifact");
  assert.equal(proof.fixtureSha256, tooling.fixtureSha256, "Upgrade fixture must match the current build artifact");
  assert.deepEqual(proof.harnessSources, tooling.harnessSources, "Upgrade harness and probe sources must match the clean release source");
  for (const [name, actual] of [["baseline", baseline], ["candidate", candidate]]) {
    const { path: ignored, ...recorded } = proof[name];
    assert.deepEqual(recorded, actual, `Upgrade ${name} must match the independently inspected APK`);
    assert.match(recorded.source.commit, commitPattern); assert.equal(typeof recorded.source.dirty, "boolean"); assert.equal(recorded.source.variant, "Release");
  }
  assert.ok(Array.isArray(proof.assertions) && proof.assertions.every(item => item.passed === true), "Every recorded upgrade assertion must pass");
  assert.deepEqual(proof.assertions.map(item => item.name), requiredCompanionAssertions, "A complete original run in the expected order is required; continuation assertions are forbidden");
  assert.match(proof.seedSnapshotSha256, digest); assert.equal(proof.candidateSnapshotSha256, proof.seedSnapshotSha256, "Independently observed settings bytes must survive the upgrade");
  for (const [name, apk] of [["before", baseline], ["after", candidate]]) {
    assert.equal(proof[name]?.versionCode, apk.versionCode); assert.equal(proof[name]?.versionName, apk.versionName);
    assert.equal(proof[name]?.notificationGranted, true);
  }
  assert.ok(typeof proof.before.userId === "string" && /^\d+$/.test(proof.before.userId));
  assert.ok(typeof proof.before.firstInstallTime === "string" && proof.before.firstInstallTime.trim());
  assert.equal(proof.after.userId, proof.before.userId); assert.equal(proof.after.firstInstallTime, proof.before.firstInstallTime);
}

export async function main(args = process.argv.slice(2)) {
  const [directory, ciRun, desktopRun, upgradeResults, phoneRun, companionUpgradeResults] = args;
  assert.ok(args.length === 6 && directory && upgradeResults && companionUpgradeResults && [ciRun, desktopRun, phoneRun].every(id => /^\d+$/.test(id ?? "")), "Usage: node scripts/release-manifest.mjs <staged-assets> <CI-run-id> <desktop-run-id> <gateway-upgrade-results.json> <phone-control-run-id> <companion-upgrade-results.json>");
  await import("./release-check.mjs");
  const git = (...values) => execFileSync("git", values, { encoding: "utf8" }).trim();
  assert.equal(git("status", "--porcelain"), "", "Release from a clean committed tree");
  const commit = git("rev-parse", "HEAD");
  assert.equal(git("rev-parse", "origin/main"), commit, "Release the fetched main commit");
  const workflows = {};
  for (const [name, id, workflowName] of [["ci", ciRun, "CI"], ["desktop", desktopRun, "Desktop gateway"], ["phoneControl", phoneRun, "Phone Control"]]) {
    const run = JSON.parse(execFileSync("gh", ["run", "view", id, "--json", "headSha,conclusion,url,workflowName,event,headBranch"], { encoding: "utf8" }));
    validateWorkflow(run, workflowName, commit); workflows[name] = run.url;
  }
  const releasePackage = JSON.parse(await readFile("package.json", "utf8"));
  const { version, orchestratorRelease: { previousVersion } } = releasePackage;
  const phoneGradle = await readFile("apps/phone-android/app/build.gradle", "utf8");
  const companionVersion = phoneGradle.match(/versionName '([^']+)'/)[1];
  const brokerPackage = JSON.parse(await readFile("components/phone-control/package.json", "utf8"));
  const expected = releaseAssets(version, companionVersion, brokerPackage.version);
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.every(entry => entry.isFile() && !entry.isSymbolicLink()), "Staged assets must be regular files");
  validateInventory(entries.map(entry => entry.name), expected);
  await mkdir("test-results", { recursive: true });
  const downloaded = await mkdtemp(path.resolve("test-results/release-ci-"));
  const desktopDownload = path.join(downloaded, "desktop"); const phoneDownload = path.join(downloaded, "phone");
  await mkdir(desktopDownload); await mkdir(phoneDownload);
  execFileSync("gh", ["run", "download", desktopRun, "--dir", desktopDownload], { stdio: "inherit" });
  execFileSync("gh", ["run", "download", phoneRun, "--pattern", "phone-control-package-qa-*", "--dir", phoneDownload], { stdio: "inherit" });
  async function findFiles(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "Workflow artifact links are forbidden");
      if (entry.isDirectory()) files.push(...await findFiles(path.join(dir, entry.name)));
      else if (entry.isFile()) files.push(path.join(dir, entry.name));
    }
    return files;
  }
  const ciFiles = await findFiles(desktopDownload); const phoneFiles = await findFiles(phoneDownload);
  const artifacts = [];
  for (const name of expected) {
    const bytes = await readFile(path.join(directory, name)); const hash = sha256(bytes);
    const desktop = name.endsWith(".zip") || name.endsWith(".tar.gz");
    if (desktop || entries.some(entry => entry.name === `${name}.sha256`)) assert.equal((await readFile(path.join(directory, `${name}.sha256`), "utf8")).trim().split(/\s+/)[0], hash, "Staged checksum mismatch");
    if (desktop) {
      const matches = ciFiles.filter(file => path.basename(file) === name);
      assert.equal(matches.length, 1, "Exactly one archive from the verified desktop workflow");
      assert.equal(sha256(await readFile(matches[0])), hash, "Desktop bytes must match verified CI");
    }
    artifacts.push({ name, bytes: bytes.length, sha256: hash });
  }
  const apk = artifacts.find(item => item.name === `orchestrator-${version}.apk`);
  const companion = artifacts.find(item => item.name === `phone-control-${companionVersion}.apk`);
  const broker = artifacts.find(item => item.name.endsWith(".tgz"));
  for (const [artifact, project] of [[apk, "android"], [companion, "phone-android"]]) assert.equal(artifact.sha256, sha256(await readFile(`apps/${project}/app/build/outputs/apk/release/app-release.apk`)), "Stage the APK freshly built in this checkout");
  const sources = new Map(await Promise.all(brokerFiles.map(async name => [name, await readFile(path.join("components/phone-control", name))])));
  const brokerSource = validateBrokerSource(await readFile(path.join(directory, broker.name)), sources);
  const brokerMatches = [];
  for (const file of phoneFiles.filter(file => path.basename(file) === broker.name)) if (sha256(await readFile(file)) === broker.sha256) brokerMatches.push(file);
  assert.ok(brokerMatches.length > 0, "Broker archive must be byte-identical to package QA in the verified Phone Control workflow");
  for (const file of brokerMatches) {
    const checked = JSON.parse(await readFile(path.join(path.dirname(file), "verification.json"), "utf8"));
    assert.equal(checked.passed, true); assert.equal(checked.archive, broker.name); assert.equal(checked.sha256, broker.sha256);
  }
  const sbomBytes = await readFile(path.join(directory, "SBOM.cdx.json"));
  const sbomDocument = JSON.parse(sbomBytes);
  const { validateReleaseSbom, validateReleaseSbomSource } = await import("./release-sbom.mjs");
  await validateReleaseSbom(sbomDocument, { commit, artifacts, brokerSource });
  await validateReleaseSbomSource(sbomDocument, { commit, artifacts, brokerSource });
  const sbom = { name: "SBOM.cdx.json", bytes: sbomBytes.length, sha256: sha256(sbomBytes) };
  assert.ok(process.env.ANDROID_HOME && process.env.JAVA_HOME, "ANDROID_HOME and JAVA_HOME are required");
  const sdkTools = path.join(process.env.ANDROID_HOME, "build-tools", "35.0.0");
  const executable = name => process.platform === "win32" ? `${name}.exe` : name;
  const java = path.join(process.env.JAVA_HOME, "bin", executable("java"));
  const jar = path.join(process.env.JAVA_HOME, "bin", executable("jar"));
  async function inspectApk(file, sourceRequired = true) {
    const metadata = parseBadging(execFileSync(path.join(sdkTools, executable("aapt2")), ["dump", "badging", file], { encoding: "utf8" }));
    const signatures = execFileSync(java, ["-jar", path.join(sdkTools, "lib/apksigner.jar"), "verify", "--print-certs", file], { encoding: "utf8" });
    const certificates = [...signatures.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$/gm)];
    assert.equal(certificates.length, 1, "Exactly one APK signing identity is required");
    const result = { sha256: sha256(await readFile(file)), ...metadata, signerSha256: certificates[0][1] };
    if (sourceRequired) {
      const extract = await mkdtemp(path.join(downloaded, "identity-"));
      const listing = execFileSync(jar, ["tf", file], { encoding: "utf8" }).split(/\r?\n/);
      assert.equal(listing.filter(name => name === "assets/release-identity.json").length, 1, "Exactly one embedded source identity is required");
      execFileSync(jar, ["xf", file, "assets/release-identity.json"], { cwd: extract });
      result.source = JSON.parse(await readFile(path.join(extract, "assets/release-identity.json"), "utf8"));
    }
    return result;
  }
  const apkPath = path.resolve(directory, apk.name);
  const previousApk = path.resolve(`test-results/release-assets/orchestrator-${previousVersion}.apk`);
  const currentAndroid = await inspectApk(apkPath); const priorAndroid = await inspectApk(previousApk, false);
  const gradle = await readFile("apps/android/app/build.gradle", "utf8");
  validateAndroid(currentAndroid, priorAndroid, { applicationId: "io.github.quintond.orchestrator", version, versionCode: Number(gradle.match(/versionCode (\d+)/)[1]), commit });
  assert.equal(priorAndroid.versionName, previousVersion);
  const previousPhoneApk = path.resolve(`test-results/release-assets/phone-control-${previousCompanionVersion}.apk`);
  const currentPhone = await inspectApk(path.resolve(directory, companion.name)); const priorPhone = await inspectApk(previousPhoneApk);
  validateAndroid(currentPhone, priorPhone, { applicationId: "io.github.quintond.orchestrator.phonecontrol", version: companionVersion, versionCode: Number(phoneGradle.match(/versionCode (\d+)/)[1]), commit });
  assert.equal(priorPhone.versionName, previousCompanionVersion);
  const upgrade = JSON.parse(await readFile(upgradeResults, "utf8"));
  assert.equal(upgrade.passed, true); assert.equal(upgrade.version, version); assert.equal(upgrade.previousVersion, previousVersion);
  assert.equal(upgrade.artifacts[apk.name], apk.sha256);
  const testedDesktop = artifacts.find(item => desktopTargets.includes(upgrade.target) && item.name.includes(`-${upgrade.target}.`));
  assert.ok(testedDesktop, "Upgrade must identify a current native desktop artifact");
  assert.equal(upgrade.artifacts[testedDesktop.name], testedDesktop.sha256);
  assert.equal(upgrade.artifacts[path.basename(previousApk)], priorAndroid.sha256);
  const companionProofBytes = await readFile(companionUpgradeResults);
  const companionUpgrade = JSON.parse(companionProofBytes);
  const tooling = {
    probeSha256: sha256(await readFile(path.resolve(path.dirname(companionUpgradeResults), "probe/upgrade-probe.apk"))),
    fixtureSha256: sha256(await readFile("apps/phone-android/fixture/build/outputs/apk/debug/fixture-debug.apk")),
    harnessSources: await Promise.all(companionHarnessFiles.map(async name => ({ path: name, sha256: sha256(await readFile(name)) }))),
  };
  validateCompanionUpgrade(companionUpgrade, priorPhone, currentPhone, tooling);
  const { serial, startedAt, finishedAt, platform, before, after, assertions, limits, seedSnapshotSha256, candidateSnapshotSha256, probeSha256, fixtureSha256 } = companionUpgrade;
  const manifest = { version, stage: "alpha", commit, workflows, sbom, android: { applicationId: currentAndroid.applicationId, versionCode: currentAndroid.versionCode, signerSha256: currentAndroid.signerSha256 }, upgrade,
    phoneControl: { companion: currentPhone, baseline: priorPhone, broker: { version: brokerPackage.version, sha256: broker.sha256, sourceFiles: brokerSource }, upgrade: { kind: companionUpgrade.kind, status: "passed", evidenceSha256: sha256(companionProofBytes), serial, startedAt, finishedAt, platform, before, after, assertions, limits, seedSnapshotSha256, candidateSnapshotSha256, probeSha256, fixtureSha256, harnessSources: tooling.harnessSources } }, artifacts };
  assert.equal(git("status", "--porcelain"), "", "Release source changed during verification");
  assert.equal(git("rev-parse", "HEAD"), commit, "Release commit changed during verification");
  assert.equal(git("rev-parse", "origin/main"), commit, "Fetched main changed during verification");
  await writeFile(path.join(directory, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const manifestHash = sha256(await readFile(path.join(directory, "release-manifest.json")));
  await writeFile(path.join(directory, "SHA256SUMS.txt"), [...artifacts.map(item => `${item.sha256}  ${item.name}`), `${sbom.sha256}  ${sbom.name}`, `${manifestHash}  release-manifest.json`].join("\n") + "\n");
  console.log(`PASS Complete release asset inventory for ${version} at ${commit}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
