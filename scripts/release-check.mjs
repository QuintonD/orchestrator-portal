import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const version = JSON.parse(read("package.json")).version;
const previousVersion = JSON.parse(read("package.json")).orchestratorRelease.previousVersion;
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
// Full release history is required when packaging; shallow PR CI still checks identities above.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
for (const tag of git("tag", "--list", "v0.1.0-alpha.*").split("\n").filter(Boolean)) {
  if (Number(tag.split(".").at(-1)) >= Number(version.split(".").at(-1))) continue;
  const previous = git("show", `${tag}:apps/android/app/build.gradle`);
  assert.ok(Number(gradle.match(/versionCode (\d+)/)[1]) > Number(previous.match(/versionCode (\d+)/)[1]), `Android must upgrade ${tag}`);
}
assert.ok(!/\bBETA\b/.test(read("apps/android/app/src/main/java/io/github/quintond/orchestrator/MainActivity.java")));
console.log(`PASS Release identity: ${version}; alpha stage, lockfile, gateway and Android agree`);
