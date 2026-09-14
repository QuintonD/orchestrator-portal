import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("release-check.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replaceAll("import.meta.url", JSON.stringify(import.meta.url.replace("release-check.test.mjs", "release-check.mjs")));
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
function check(change = {}) {
  const read = (file) => change[file] ?? readFileSync(new URL(file, root), "utf8");
  const oldGateway = read("apps/android/app/build.gradle").replace(/versionCode \d+/, "versionCode 1");
  const oldPhone = read("apps/phone-android/app/build.gradle").replace(/versionCode \d+/, "versionCode 1")
    .replace(/versionName '[^']+'/, `versionName '${pkg.orchestratorRelease.previousCompanionVersion}'`);
  runInNewContext(source, {
    assert, URL, console: { log() {} },
    readFileSync: (url) => read(decodeURIComponent(url.href.slice(root.href.length))),
    execFileSync: (command, args) => {
      assert.equal(command, "git");
      if (args[0] === "tag") return `v${pkg.orchestratorRelease.previousVersion}`;
      if (args[0] === "ls-tree") return "apps/phone-android/app/build.gradle";
      assert.equal(args[0], "show");
      return args[1].includes("apps/phone-android/") ? oldPhone : oldGateway;
    },
  });
}
test("current distribution identities and published upgrade baselines agree", () => check());
for (const [name, file, before, after] of [
  ["companion report", "apps/phone-android/app/src/main/java/io/github/quintond/orchestrator/phonecontrol/PhoneService.java", /"appVersion", "[^"]+"/, '"appVersion", "0.1.0-alpha.999"'],
  ["broker MCP report", "components/phone-control/src/mcp.mjs", /serverInfo: \{ name: '[^']+', version: '[^']+'/, "serverInfo: { name: 'orchestrator-phone-control', version: '0.1.0-alpha.999'"],
  ["broker CLI report", "components/phone-control/bin/phone-control.mjs", /write\(`0\.1\.0-alpha\.\d+\\n/, "write(`0.1.0-alpha.999\\n"],
  ["companion application ID", "apps/phone-android/app/build.gradle", /applicationId '[^']+'/, "applicationId 'other.app'"],
  ["companion version code", "apps/phone-android/app/build.gradle", /versionCode \d+/, "versionCode 1"],
]) test(`release identity rejects mismatched ${name}`, () => {
  const original = readFileSync(new URL(file, root), "utf8");
  const changed = original.replace(before, after); assert.notEqual(changed, original);
  assert.throws(() => check({ [file]: changed }));
});
