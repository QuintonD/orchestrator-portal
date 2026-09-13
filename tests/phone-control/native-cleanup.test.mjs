import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { cleanupSteps } from "./runner-cleanup.mjs";
import { requireServiceState, waitForNativeServiceRemoval } from "./native-force-stop.mjs";

const source = readFileSync(new URL("./native.mjs", import.meta.url), "utf8");
const cleanupBlock = source.match(/  cleanup = await cleanupSteps\(\[[\s\S]*?\n  \]\);/)[0];
const verdict = source.match(/^const passed = functionalPassed && cleanup\.every\(.*$/m)[0];
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const component = `${pkg}/io.github.quintond.orchestrator.phonecontrol.PhoneService`;
const reply = (stdout) => ({ stdout, stderr: "", status: 0, signal: null });
const expected = [
  ["read enabled services"],
  ["shell", "am", "force-stop", pkg],
  ["read enabled services"],
  ["shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop"],
  ["stop owned child"],
];

async function executeCleanup({ action = () => {}, query = (count) => reply(count === 1 ? `${component}\n` : "null\n"), functionalPassed = true } = {}) {
  const attempted = [];
  const child = {};
  let reads = 0;
  let clock = 0;
  const execution = runInNewContext(`(async () => {
    let cleanup;
    let nativeServiceEnabledBeforeStop = null;
    let nativeForceStopSucceeded = false;
    let nativeStopRemoval = null;
    ${cleanupBlock}
    ${verdict}
    return { cleanup, passed, nativeServiceEnabledBeforeStop, nativeForceStopSucceeded, nativeStopRemoval };
  })()`, {
    assert, pkg, component, child, cleanupSteps, requireServiceState, functionalPassed,
    waitForNativeServiceRemoval: (options) => waitForNativeServiceRemoval({ ...options, now: () => clock, sleep: async (ms) => { clock += ms; } }),
    readNativeSetting: (timeout) => { attempted.push(["read enabled services"]); assert.ok(timeout > 0 && timeout <= 2000); return query(++reads); },
    cleanupAdb: (...args) => { attempted.push(args); return action(args); },
    stopChild: (owned) => { assert.equal(owned, child); attempted.push(["stop owned child"]); },
  });
  return { ...(await execution), attempted };
}

test("native cleanup awaits observed service removal before files and child cleanup", async () => {
  let release;
  let entered;
  const readEntered = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const actions = [];
  const execution = executeCleanup({ action: (args) => actions.push(args), query: (count) => {
    if (count === 1) return reply(`${component}\n`);
    entered(); return pending;
  } });
  await readEntered;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(actions, [expected[1]]);
  release(reply("null\n"));
  const result = await execution;
  assert.deepEqual(result.attempted, expected);
  assert.equal(result.passed, true);
  assert.equal(result.nativeServiceEnabledBeforeStop, true);
  assert.equal(result.nativeForceStopSucceeded, true);
  assert.equal(result.nativeStopRemoval.observed, true);
});

test("an absent, missing, malformed or failed pre-state never skips force-stop or passes cleanup", async () => {
  const canary = "private child output must never be evidence";
  for (const initial of [reply("null\n"), reply(""), reply(`${canary}\n`), { ...reply(`${component}\n`), status: 1 }, { ...reply(`${component}\n`), error: new Error(canary) }]) {
    const result = await executeCleanup({ query: () => initial });
    assert.deepEqual(result.attempted, [expected[0], expected[1], ...expected.slice(3)]);
    assert.deepEqual(result.cleanup.map((item) => item.passed), [false, true, false, true, true]);
    assert.equal(result.passed, false);
    assert.equal(result.nativeStopRemoval, null);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});

test("failed force-stop cannot pass from later service absence and remaining cleanup still runs", async () => {
  const result = await executeCleanup({ action: (args) => {
    if (args[2] === "force-stop") throw Object.assign(new Error("private output"), { code: "EPERM" });
  } });
  assert.deepEqual(result.attempted, [expected[0], expected[1], ...expected.slice(3)]);
  assert.deepEqual(result.cleanup.map((item) => item.passed), [true, false, false, true, true]);
  assert.equal(result.passed, false);
  assert.equal(result.nativeForceStopSucceeded, false);
  assert.equal(result.nativeStopRemoval, null);
});

test("removal query failures and deadline preserve failure while files and child are cleaned", async () => {
  for (const mode of ["query_failure", "timeout"]) {
    const result = await executeCleanup({ query: (count) => count === 1 || mode === "timeout"
      ? reply(`${component}\n`) : { ...reply("null\n"), status: 1 } });
    assert.deepEqual(result.cleanup.map((item) => item.passed), [true, true, false, true, true]);
    assert.deepEqual(result.attempted.slice(-2), expected.slice(-2));
    assert.equal(result.passed, false);
    assert.equal(result.nativeStopRemoval, null);
    if (mode === "timeout") assert.equal(result.cleanup[2].code, "ETIMEDOUT");
  }
});

test("successful cleanup cannot erase an earlier native functional failure", async () => {
  const result = await executeCleanup({ functionalPassed: false });
  assert.ok(result.cleanup.every((item) => item.passed));
  assert.equal(result.passed, false);
});

test("native commands retain exact owned serial, bounded read output and process timeouts", () => {
  const calls = [];
  const declarations = ["cleanupAdb", "readNativeSetting"].map((name) => source.match(new RegExp(`^const ${name} = .*$`, "m"))[0]).join("\n");
  runInNewContext(`${declarations}\ncleanupAdb("shell", "am", "force-stop", pkg);\nreadNativeSetting(173);`, {
    root: "synthetic-workspace", serial: "emulator-5574", pkg,
    execFileSync: (...args) => calls.push(args), spawnSync: (...args) => calls.push(args),
  });
  for (const [command, args, options] of calls) {
    assert.equal(command, "adb");
    assert.deepEqual(Array.from(args).slice(0, 2), ["-s", "emulator-5574"]);
    assert.equal(options.windowsHide, true);
    assert.deepEqual(Array.from(options.stdio), ["ignore", "pipe", "pipe"]);
  }
  assert.equal(calls[0][2].timeout, 10000);
  assert.deepEqual(Array.from(calls[1][1]), ["-s", "emulator-5574", "shell", "settings", "get", "secure", "enabled_accessibility_services"]);
  assert.equal(calls[1][2].timeout, 173);
  assert.equal(calls[1][2].maxBuffer, 4096);
});
