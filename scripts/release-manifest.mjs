// Assemble checksums only after matching-commit CI artifacts and the signed APK are staged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import "./release-check.mjs";

const [directory, ciRun, desktopRun, upgradeResults] = process.argv.slice(2);
assert.ok(directory && upgradeResults && /^\d+$/.test(ciRun ?? "") && /^\d+$/.test(desktopRun ?? ""), "Usage: node scripts/release-manifest.mjs <staged-assets> <CI-run-id> <desktop-run-id> <upgrade-results.json>");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain"), "", "Release from a clean committed tree");
const commit = git("rev-parse", "HEAD");
assert.equal(git("rev-parse", "origin/main"), commit, "Release the fetched main commit");
const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
const workflows = {};
for (const [name, id, workflowName] of [["ci", ciRun, "CI"], ["desktop", desktopRun, "Desktop gateway"]]) {
  const run = gh("run", "view", id, "--json", "headSha,conclusion,url,workflowName,event,headBranch");
  assert.equal(run.headSha, commit); assert.equal(run.conclusion, "success"); assert.equal(run.workflowName, workflowName);
  assert.equal(run.headBranch, "main"); assert.ok(["push", "workflow_dispatch"].includes(run.event));
  workflows[name] = run.url;
}
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const targets = ["win32-x64", "win32-arm64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"];
const expected = [...targets.map(target => `orchestrator-${version}-${target}.${target.startsWith("win32") ? "zip" : "tar.gz"}`), `orchestrator-${version}.apk`].sort();
const entries = await readdir(directory);
assert.deepEqual(entries.filter(file => /\.(apk|zip|tar\.gz)$/.test(file)).sort(), expected, "Exactly six current desktop archives and one signed APK");
const artifacts = [];
const downloaded = await mkdtemp(path.resolve("test-results/release-ci-"));
execFileSync("gh", ["run", "download", desktopRun, "--dir", downloaded], { stdio: "inherit" });
async function findFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...await findFiles(path.join(dir, entry.name)));
    else if (entry.isFile()) files.push(path.join(dir, entry.name));
  }
  return files;
}
const ciFiles = await findFiles(downloaded);
for (const name of expected) {
  const bytes = await readFile(path.join(directory, name));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!name.endsWith(".apk")) {
    assert.equal((await readFile(path.join(directory, `${name}.sha256`), "utf8")).split(" ")[0], sha256);
    const matches = ciFiles.filter(file => path.basename(file) === name);
    assert.equal(matches.length, 1, "Exactly one archive from the verified desktop workflow");
    assert.equal(createHash("sha256").update(await readFile(matches[0])).digest("hex"), sha256);
  }
  artifacts.push({ name, bytes: bytes.length, sha256 });
}
const apk = artifacts.find(item => item.name.endsWith(".apk"));
assert.equal(apk.sha256, createHash("sha256").update(await readFile("apps/android/app/build/outputs/apk/release/app-release.apk")).digest("hex"), "Stage the APK built in this checkout");
const gradle = await readFile("apps/android/app/build.gradle", "utf8");
const sdkTools = path.join(process.env.ANDROID_HOME, "build-tools", "35.0.0");
const apkPath = path.resolve(directory, apk.name);
const java = path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java");
const certificate = file => execFileSync(java, ["-jar", path.join(sdkTools, "lib/apksigner.jar"), "verify", "--print-certs", file], { encoding: "utf8" }).match(/certificate SHA-256 digest: ([a-f0-9]+)/)[1];
const signer = certificate(apkPath);
const previousApk = path.resolve("test-results/release-assets/orchestrator-0.1.0-alpha.2.apk");
assert.equal(signer, certificate(previousApk), "Preserve the published alpha signing identity");
const aapt = path.join(sdkTools, process.platform === "win32" ? "aapt2.exe" : "aapt2");
const badging = file => execFileSync(aapt, ["dump", "badging", file], { encoding: "utf8" });
const metadata = badging(apkPath);
assert.ok(metadata.includes("package: name='io.github.quintond.orchestrator'"));
assert.ok(metadata.includes(`versionName='${version}'`));
assert.ok(!metadata.includes("application-debuggable"));
const versionCode = Number(metadata.match(/versionCode='(\d+)'/)[1]);
assert.equal(versionCode, Number(gradle.match(/versionCode (\d+)/)[1]));
assert.ok(versionCode > Number(badging(previousApk).match(/versionCode='(\d+)'/)[1]));
const jar = path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "jar.exe" : "jar");
execFileSync(jar, ["xf", apkPath, "assets/release-identity.json"], { cwd: downloaded });
const identity = JSON.parse(await readFile(path.join(downloaded, "assets/release-identity.json"), "utf8"));
assert.equal(identity.commit, commit, "APK embeds the released worktree commit");
assert.equal(identity.dirty, false, "APK was built from a clean checkout");
assert.equal(identity.variant, "Release");
const upgrade = JSON.parse(await readFile(upgradeResults, "utf8"));
assert.equal(upgrade.passed, true); assert.equal(upgrade.version, version);
assert.equal(upgrade.artifacts[apk.name], apk.sha256);
const testedDesktop = artifacts.find(item => item.name.includes(`-${upgrade.target}.`));
assert.equal(upgrade.artifacts[testedDesktop.name], testedDesktop.sha256);
assert.equal(upgrade.artifacts[path.basename(previousApk)], createHash("sha256").update(await readFile(previousApk)).digest("hex"));
await writeFile(path.join(directory, "release-manifest.json"), JSON.stringify({ version, stage: "alpha", commit, workflows, android: { applicationId: "io.github.quintond.orchestrator", versionCode, signerSha256: signer }, upgrade, artifacts }, null, 2) + "\n");
const manifestHash = createHash("sha256").update(await readFile(path.join(directory, "release-manifest.json"))).digest("hex");
await writeFile(path.join(directory, "SHA256SUMS.txt"), [...artifacts.map(item => `${item.sha256}  ${item.name}`), `${manifestHash}  release-manifest.json`].join("\n") + "\n");
console.log(`PASS Complete release asset inventory for ${version} at ${commit}`);
