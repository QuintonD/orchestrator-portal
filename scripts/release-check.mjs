import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const releasePackage = JSON.parse(read("package.json"));
const { version, orchestratorRelease: { previousVersion, previousCompanionVersion } } = releasePackage;
assert.match(previousVersion, /^0\.1\.0-alpha\.[1-9]\d*$/);
assert.ok(Number(previousVersion.split(".").at(-1)) < Number(version.split(".").at(-1)), "Upgrade baseline must precede this release");
assert.match(version, /^0\.1\.0-alpha\.[1-9]\d*$/, "An explicit owner decision is required before changing release stage");
const lock = JSON.parse(read("package-lock.json"));
assert.equal(lock.version, version);
assert.equal(lock.packages[""].version, version);
assert.equal(read("apps/server/src/server.ts").match(/const version = "([^"]+)"/)[1], version);
const gradle = read("apps/android/app/build.gradle");
assert.equal(gradle.match(/versionName '([^']+)'/)[1], version);
assert.equal(gradle.match(/applicationId '([^']+)'/)[1], "io.github.quintond.orchestrator");
assert.ok(Number(gradle.match(/versionCode (\d+)/)[1]) >= 5);
const companionGradle = read("apps/phone-android/app/build.gradle");
const companionVersion = companionGradle.match(/versionName '([^']+)'/)[1];
const companionCode = Number(companionGradle.match(/versionCode (\d+)/)[1]);
assert.match(companionVersion, /^0\.1\.0-alpha\.[1-9]\d*$/);
assert.match(previousCompanionVersion, /^0\.1\.0-alpha\.[1-9]\d*$/);
assert.ok(Number(previousCompanionVersion.split(".").at(-1)) < Number(companionVersion.split(".").at(-1)), "Companion upgrade baseline must precede this release");
assert.equal(companionGradle.match(/applicationId '([^']+)'/)[1], "io.github.quintond.orchestrator.phonecontrol");
assert.ok(companionCode > 0);
assert.equal(read("apps/phone-android/app/src/main/java/io/github/quintond/orchestrator/phonecontrol/PhoneService.java").match(/"appVersion", "([^"]+)"/)[1], companionVersion);
const brokerVersion = JSON.parse(read("components/phone-control/package.json")).version;
assert.match(brokerVersion, /^0\.1\.0-alpha\.[1-9]\d*$/);
assert.equal(read("components/phone-control/src/mcp.mjs").match(/serverInfo: \{ name: '[^']+', version: '([^']+)'/)[1], brokerVersion);
assert.equal(read("components/phone-control/bin/phone-control.mjs").match(/if \(values\.version\).*?write\(`([^\\]+)\\n/)[1], brokerVersion);
// Full release history is required when packaging; shallow PR CI still checks identities above.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
for (const tag of git("tag", "--list", "v0.1.0-alpha.*").split("\n").filter(Boolean)) {
  if (Number(tag.split(".").at(-1)) >= Number(version.split(".").at(-1))) continue;
  const previous = git("show", `${tag}:apps/android/app/build.gradle`);
  assert.ok(Number(gradle.match(/versionCode (\d+)/)[1]) > Number(previous.match(/versionCode (\d+)/)[1]), `Android must upgrade ${tag}`);
  if (git("ls-tree", "--name-only", tag, "apps/phone-android/app/build.gradle")) {
    const priorCompanion = git("show", `${tag}:apps/phone-android/app/build.gradle`);
    assert.ok(companionCode > Number(priorCompanion.match(/versionCode (\d+)/)[1]), `Companion must upgrade ${tag}`);
    if (tag === `v${previousVersion}`) assert.equal(priorCompanion.match(/versionName '([^']+)'/)[1], previousCompanionVersion, "Companion baseline must match the previous published application release");
  }
}
assert.ok(!/\bBETA\b/.test(read("apps/android/app/src/main/java/io/github/quintond/orchestrator/MainActivity.java")));
console.log(`PASS Release identity: ${version}; companion ${companionVersion}; broker ${brokerVersion}; alpha stage, source versions and upgrade baselines agree`);
