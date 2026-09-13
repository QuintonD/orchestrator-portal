import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { cleanupSteps } from "./runner-cleanup.mjs";

const source = readFileSync(new URL("./native.mjs", import.meta.url), "utf8");
const cleanupBlock = source.match(/  cleanup = await cleanupSteps\(\[[\s\S]*?\n  \]\);/)[0];
const verdict = source.match(/^const passed = functionalPassed && cleanup\.every\(.*$/m)[0];
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const barrier = ["shell", "am", "wait-for-broadcast-barrier", "--flush-broadcast-loopers", "--flush-application-threads"];
const expected = [
  ["shell", "am", "force-stop", pkg],
  barrier,
  ["shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop"],
  ["stop owned child"],
];

async function executeCleanup(action = () => {}) {
  const attempted = [];
  const child = {};
  const execution = runInNewContext(`(async () => {
    let cleanup;
    ${cleanupBlock}
    ${verdict}
    return { cleanup, passed };
  })()`, {
    pkg, child, cleanupSteps, functionalPassed: true,
    cleanupAdb: (...args) => { attempted.push(args); return action(args); },
    stopChild: (owned) => { assert.equal(owned, child); attempted.push(["stop owned child"]); },
  });
  return { ...(await execution), attempted };
}

test("native cleanup awaits the broadcast barrier before removing files or finishing", async () => {
  let release;
  let entered;
  const barrierEntered = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const execution = executeCleanup((args) => {
    seen.push(args);
    if (args[2] === "wait-for-broadcast-barrier") { entered(); return pending; }
  });
  await barrierEntered;
  assert.deepEqual(seen, expected.slice(0, 2));
  release();
  const result = await execution;
  assert.deepEqual(result.attempted, expected);
  assert.equal(result.passed, true);
});

for (const [command, code] of [["force-stop", "EPERM"], ["wait-for-broadcast-barrier", "EPERM"], ["wait-for-broadcast-barrier", "ETIMEDOUT"]]) {
  test(`native cleanup preserves ${command} ${code} failure and attempts remaining cleanup`, async () => {
    const canary = "private child output must never be evidence";
    const result = await executeCleanup((args) => {
      if (args[2] === command) throw Object.assign(new Error(canary), { code });
    });
    assert.deepEqual(result.attempted, expected);
    assert.equal(result.passed, false);
    assert.deepEqual(result.cleanup.map((item) => item.passed), command === "force-stop" ? [false, true, true, true] : [true, false, true, true]);
    assert.equal(result.cleanup.find((item) => !item.passed).code, code);
    assert.equal(JSON.stringify(result).includes(canary), false);
  });
}

test("native cleanup commands retain the owned serial and ten-second process timeout", () => {
  const declaration = source.match(/^const cleanupAdb = .*$/m)[0];
  const calls = [];
  runInNewContext(`${declaration}\ncleanupAdb(...barrier);`, {
    root: "synthetic-workspace", serial: "emulator-5574", barrier,
    execFileSync: (...args) => calls.push(args),
  });
  const [command, args, options] = calls[0];
  assert.equal(command, "adb");
  assert.deepEqual(Array.from(args), ["-s", "emulator-5574", ...barrier]);
  assert.equal(options.timeout, 10000);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(Array.from(options.stdio), ["ignore", "pipe", "pipe"]);
});
