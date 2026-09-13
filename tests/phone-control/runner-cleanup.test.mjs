import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cleanupSteps, safeFailure, stopChild, within } from "./runner-cleanup.mjs";

test("a rejected or stalled portal close cannot skip private cleanup or leak error content", async () => {
  const attempted = [];
  const canary = "synthetic_credential_never_in_evidence";
  const results = await cleanupSteps([
    { name: "portal close", action: () => { throw Object.assign(new Error(canary), { name: canary, code: canary }); } },
    { name: "stalled cleanup", action: () => new Promise(() => {}), timeout: 20 },
    { name: "stop native", action: () => attempted.push("stop") },
    { name: "remove token", action: () => attempted.push("token") },
    { name: "remove owned forward", action: () => attempted.push("forward") },
  ]);
  assert.deepEqual(attempted, ["stop", "token", "forward"]);
  assert.deepEqual(results.map((item) => item.passed), [false, false, true, true, true]);
  assert.equal(results[1].code, "CLEANUP_TIMEOUT");
  assert.ok(!JSON.stringify(results).includes(canary));
  assert.deepEqual(safeFailure({ name: "AssertionError", code: "ERR_ASSERTION", message: canary, actual: canary }), { error: "AssertionError", code: "ERR_ASSERTION" });
});

test("runner cleanup terminates an owned child and tolerates repeat cleanup", async () => {
  const child = spawn(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  try {
    await within(() => once(child.stdout, "data"), 5000);
    await stopChild(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    await stopChild(child);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
});
