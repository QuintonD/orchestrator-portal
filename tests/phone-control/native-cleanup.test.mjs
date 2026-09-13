import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import { createAdbTransportEvidence } from "./adb-transport-evidence.mjs";
import { parseNativeResult } from "./native-result.mjs";
import { cleanupSteps } from "./runner-cleanup.mjs";
import { requireServiceState, waitForNativeServiceRemoval, nativeRemovalFailureFacts } from "./native-force-stop.mjs";

const source = readFileSync(new URL("./native.mjs", import.meta.url), "utf8");
const cleanupBlock = source.match(/  cleanup = await cleanupSteps\(\[[\s\S]*?\n  \]\);/)[0];
const verdict = source.match(/^const passed = functionalPassed && cleanup\.every\(.*$/m)[0];
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const component = `${pkg}/io.github.quintond.orchestrator.phonecontrol.PhoneService`;
const reply = (stdout) => ({ stdout, stderr: "", status: 0, signal: null });

test("actual native stderr wiring retains safe transport facts without overriding failed instrumentation", () => {
  const child = { stderr: new EventEmitter() };
  const adbTransport = createAdbTransportEvidence();
  const hook = source.match(/^  child\.stderr\.on\("data", .*$/m)[0];
  runInNewContext(hook, { child, adbTransport });
  child.stderr.emit("data", Buffer.from("synthetic-private-output\nadb: error: device offline\n"));
  child.stderr.emit("data", Buffer.from("adb: connection closed"));
  const evidence = adbTransport.finish();
  assert.equal(evidence.markers.device_offline, 1);
  assert.equal(evidence.markers.connection_closed, 0);
  assert.equal(evidence.discardedLines, 1);
  assert.equal(evidence.incompleteLine, true);
  assert.ok(!JSON.stringify(evidence).includes("synthetic-private-output"));
  const output = "INSTRUMENTATION_RESULT: stream=PASS: 47 native assertions; no token or observation content exported.\nINSTRUMENTATION_CODE: -1\n";
  const parsed = parseNativeResult(output, 255);
  const actualVerdict = source.match(/^const functionalPassed = .*$/m)[0];
  const functionalPassed = runInNewContext(`${actualVerdict}\nfunctionalPassed`, { failure: undefined, oversizedOutput: false, parsed });
  assert.equal(functionalPassed, false);
  assert.match(source, /adbTransport: \{ \.\.\.adbTransport\.finish\(\), streamClosed: childClosed \}/);
});

test("native transport evidence distinguishes process exit from drained stderr without waiting or changing failure", () => {
  const hooks = source.match(/^  child\.stderr\.on\("data", .*$/m)[0] + "\n"
    + source.match(/^  child\.once\("close", .*$/m)[0];
  const projection = source.match(/adbTransport: (\{ \.\.\.adbTransport\.finish\(\), streamClosed: childClosed \})/)[1];
  for (const closeBeforeEvidence of [false, true]) {
    const child = new EventEmitter(); child.stderr = new EventEmitter();
    const context = { child, childClosed: false, adbTransport: createAdbTransportEvidence() };
    runInNewContext(hooks, context);
    child.emit("exit", 255);
    assert.equal(context.childClosed, false);
    if (closeBeforeEvidence) {
      child.stderr.emit("data", Buffer.from("adb: error: device offline\n")); child.emit("close", 255);
    }
    const evidence = runInNewContext(`(${projection})`, context);
    assert.equal(evidence.streamClosed, closeBeforeEvidence);
    assert.equal(evidence.markers.device_offline, closeBeforeEvidence ? 1 : 0);
    if (!closeBeforeEvidence) {
      child.stderr.emit("data", Buffer.from("adb: error: device offline\n")); child.emit("close", 255);
      assert.equal(evidence.streamClosed, false);
      assert.equal(evidence.markers.device_offline, 0);
    }
    assert.equal(parseNativeResult("", 255).passed, false);
  }
});
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
    assert, pkg, component, child, cleanupSteps, requireServiceState, nativeRemovalFailureFacts, functionalPassed,
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
    assert.equal(result.nativeStopRemoval.observed, false);
    assert.equal(result.nativeStopRemoval.reason, mode === "timeout" ? "deadline" : "query_failed");
    assert.equal(result.nativeStopRemoval.samples, mode === "timeout" ? 150 : 1);
    assert.equal(result.nativeStopRemoval.lastQuery.status, mode === "timeout" ? 0 : 1);
    if (mode === "timeout") assert.equal(result.cleanup[2].code, "ETIMEDOUT");
  }
});

test("actual native cleanup records bounded read-timeout evidence while preserving failure and remaining cleanup", async () => {
  const secret = "private query output";
  const result = await executeCleanup({ query: (count) => count === 1 ? reply(`${component}\n`)
    : { ...reply(""), status: null, signal: "SIGTERM", error: Object.assign(new Error(secret), { code: "ETIMEDOUT", path: secret }) } });
  assert.deepEqual(result.cleanup.map((item) => item.passed), [true, true, false, true, true]);
  assert.equal(result.passed, false);
  assert.equal(result.nativeStopRemoval.observed, false);
  assert.equal(result.nativeStopRemoval.samples, 1);
  assert.equal(result.nativeStopRemoval.lastQuery.errorCode, "ETIMEDOUT");
  assert.equal(result.nativeStopRemoval.lastQuery.parseValid, false);
  assert.deepEqual(result.attempted.slice(-2), expected.slice(-2));
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("only the removal observation receives the thirty-five-second outer cleanup deadline", async () => {
  const deadlines = [];
  await runInNewContext(`(async () => { let cleanup; ${cleanupBlock} })()`, {
    cleanupSteps: async (steps) => { deadlines.push(...steps.map(({ name, timeout = 18000 }) => [name, timeout])); return []; },
  });
  assert.deepEqual(deadlines, [
    ["read native accessibility before force-stop", 18000],
    ["stop native session", 18000],
    ["observe native accessibility removal", 35000],
    ["remove native private probe files", 18000],
    ["terminate owned instrumentation client", 7000],
  ]);
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

test("native startup prepares permissions and power before instrumentation without starting an accessibility bind", () => {
  const start = source.indexOf('  stage = "prepare fixture permissions";');
  const end = source.indexOf('  child.stdout.on("data"', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  runInNewContext(source.slice(start, end), {
    pkg, component, root: "synthetic-workspace", serial: "emulator-5574", stage: "", child: null,
    adb: (...args) => calls.push(["adb", ...args]),
    spawn: (command, args) => { calls.push([command, ...args]); return {}; },
  });
  assert.deepEqual(calls, [
    ["adb", "shell", "pm", "grant", pkg, "android.permission.POST_NOTIFICATIONS"],
    ["adb", "shell", "svc", "power", "stayon", "true"],
    ["adb", "shell", "input", "keyevent", "224"],
    ["adb", "shell", "wm", "dismiss-keyguard"],
    ["adb", "-s", "emulator-5574", "shell", "am", "instrument", "-w", "-r", `${pkg}.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest`],
  ]);
});
