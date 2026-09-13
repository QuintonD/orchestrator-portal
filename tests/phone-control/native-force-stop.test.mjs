import assert from "node:assert/strict";
import test from "node:test";
import { enabledServiceState, requireServiceState, waitForNativeServiceRemoval, serviceQueryFacts, nativeRemovalFailureFacts } from "./native-force-stop.mjs";

const component = "io.github.quintond.orchestrator.phonecontrol.debug/io.github.quintond.orchestrator.phonecontrol.PhoneService";
const other = "example.other/example.other.Service";
const reply = (stdout) => ({ stdout, stderr: "", status: 0, signal: null });

test("exact components and Android full/short aliases are canonicalized in colon lists", () => {
  for (const ending of ["\n", "\r\n", "\r\r\n"]) {
    assert.equal(enabledServiceState(`${component}${ending}`, component), true);
    assert.equal(enabledServiceState(`${other}:${component}${ending}`, component), true);
    assert.equal(enabledServiceState(`${other}${ending}`, component), false);
    assert.equal(enabledServiceState(`example.other/.Service${ending}`, other), true);
    assert.equal(enabledServiceState(`${other}${ending}`, "example.other/.Service"), true);
    assert.equal(enabledServiceState(`null${ending}`, component), false);
    assert.equal(enabledServiceState(ending, component), false);
    assert.equal(enabledServiceState(`null${ending}${ending}`, component), null);
    assert.equal(enabledServiceState(ending + ending, component), null);
    assert.equal(enabledServiceState(`${other}${ending}`, other + ending), null);
  }
  assert.equal(enabledServiceState("io.github.quintond.orchestrator.phonecontrol.debug/.PhoneService\n", component), false, "a class relative to the debug application ID is a different component");
  assert.equal(enabledServiceState("example.other/io.github.quintond.orchestrator.phonecontrol.PhoneService\n", component), false, "same class in another package is a different component");
});

test("missing, duplicate, malformed, injected and oversized settings replies stay unknown", () => {
  for (const value of [null, undefined, 0, Buffer.from("null\n"), "", "null", "\r", "null\n\n", "\nnull\n", " null\n", "null \n", `${component}\nextra\n`, `${component}:${component}\n`, `${other}:example.other/.Service\n`, `:${component}\n`, `${component}:\n`, `${component}::${other}\n`, "warning: missing\n", "a/b\n", `${component}\0\n`, "a".repeat(4097)]) {
    assert.equal(enabledServiceState(value, component), null);
  }
  for (const ending of ["\n", "\u2028", "\u2029"]) {
    assert.equal(enabledServiceState(`${component}\n`, component + ending), null);
    assert.equal(enabledServiceState(`${component}${ending}\n`, component), null);
  }
});

test("successful-looking stdout cannot override a failed, signalled, truncated or noisy query", () => {
  for (const result of [undefined, { ...reply("null\n"), status: null }, { ...reply("null\n"), status: 1 }, { ...reply("null\n"), signal: "SIGTERM" }, { ...reply("null\n"), error: new Error("secret") }, { ...reply("null\n"), stderr: "secret" }, reply("")]) {
    assert.throws(() => requireServiceState(result, component), { code: "ERR_ASSERTION" });
  }
});

function clockedQuery(outputs) {
  let time = 0;
  const timeouts = [];
  let reads = 0;
  return {
    options: { component, enabledBeforeStop: true, stopSucceeded: true,
      now: () => time, sleep: async (ms) => { time += ms; },
      query: (timeout) => { timeouts.push(timeout); return reply(outputs[Math.min(reads++, outputs.length - 1)]); } },
    advance: (ms) => { time += ms; }, timeouts, reads: () => reads,
  };
}

test("removing another package cannot satisfy the observed target transition", async () => {
  const fixture = clockedQuery([`${other}:${component}\n`, `${component}\n`, `${other}\n`]);
  const result = await waitForNativeServiceRemoval(fixture.options);
  assert.deepEqual(result, { observed: true, elapsedMs: 400, samples: 3 });
  assert.equal(fixture.reads(), 3);
});

test("pre-existing absence or failed stop never becomes completion evidence", async () => {
  for (const [enabledBeforeStop, stopSucceeded] of [[false, true], [null, true], [true, false], [true, null]]) {
    let reads = 0;
    await assert.rejects(waitForNativeServiceRemoval({ component, enabledBeforeStop, stopSucceeded, query: () => { reads++; return reply("null\n"); } }), { code: "ERR_ASSERTION" });
    assert.equal(reads, 0);
  }
});

test("the ten-second observation budget bounds every read and rejects late absence", async () => {
  const fixture = clockedQuery([`${component}\n`]);
  await assert.rejects(waitForNativeServiceRemoval(fixture.options), { code: "ETIMEDOUT" });
  assert.equal(fixture.reads(), 50);
  assert.ok(fixture.timeouts.every((ms) => ms > 0 && ms <= 2000));
  assert.equal(fixture.timeouts.at(-1), 200);
  const late = clockedQuery([]);
  await assert.rejects(waitForNativeServiceRemoval({ ...late.options, query: () => { late.advance(10000); return reply("null\n"); } }), { code: "ETIMEDOUT" });
});

test("malformed observations and query errors stop immediately without read retries or output leakage", async () => {
  for (const value of ["", "null\n\n", "private fixture state\n"]) {
    const fixture = clockedQuery([value, "null\n"]);
    await assert.rejects(waitForNativeServiceRemoval(fixture.options), (error) => error.code === "ERR_ASSERTION" && !error.message.includes("private fixture state"));
    assert.equal(fixture.reads(), 1);
  }
  const fixture = clockedQuery([]);
  await assert.rejects(waitForNativeServiceRemoval({ ...fixture.options, query: () => { throw Object.assign(new Error("query failed"), { code: "ETIMEDOUT" }); } }), { code: "ETIMEDOUT" });
});

test("query facts distinguish process failure from syntactically valid absence without retaining output", () => {
  const secret = "private settings or process path";
  const facts = serviceQueryFacts({ ...reply("null\n"), status: null, signal: "SIGTERM", error: Object.assign(new Error(secret), { code: "ETIMEDOUT", path: secret }) }, component);
  assert.deepEqual(facts, { status: null, signal: "SIGTERM", signalPresent: true, errorPresent: true, errorCode: "ETIMEDOUT", stderrEmpty: true,
    stdoutBytes: 5, commandSucceeded: false, parseValid: true, enabled: false });
  const unknown = serviceQueryFacts({ stdout: secret.repeat(1000), stderr: secret, status: 1e99, signal: secret, error: { code: secret } }, component);
  assert.equal(unknown.status, null); assert.equal(unknown.signal, null); assert.equal(unknown.signalPresent, true);
  assert.equal(unknown.errorCode, null); assert.equal(unknown.errorPresent, true); assert.equal(unknown.stderrEmpty, false);
  assert.equal(unknown.stdoutBytes, 4097); assert.equal(unknown.parseValid, false); assert.equal(unknown.enabled, null);
  assert.ok(!JSON.stringify([facts, unknown]).includes(secret));
  assert.equal(serviceQueryFacts(reply(""), component).stdoutBytes, 0);
  assert.equal(serviceQueryFacts({}, component).stdoutBytes, null);
  assert.equal(serviceQueryFacts({}, component).stderrEmpty, null);
  assert.equal(serviceQueryFacts({ ...reply("null\n"), status: "0" }, component).status, null);
});

test("failed read and invalid reply retain exact bounded attempt facts and still stop immediately", async () => {
  for (const mode of ["timeout", "invalid_reply"]) {
    const fixture = clockedQuery([]); let attempts = 0;
    await assert.rejects(waitForNativeServiceRemoval({ ...fixture.options, query: () => {
      attempts++; fixture.advance(2000);
      return mode === "timeout" ? { ...reply(""), status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } } : reply("");
    } }), (error) => {
      assert.equal(error.code, "ERR_ASSERTION");
      const facts = nativeRemovalFailureFacts(error);
      assert.equal(facts.observed, false); assert.equal(facts.elapsedMs, 2000); assert.equal(facts.samples, 1);
      assert.equal(facts.reason, mode === "timeout" ? "query_failed" : "invalid_reply");
      assert.equal(facts.lastQuery.errorCode, mode === "timeout" ? "ETIMEDOUT" : null);
      assert.equal(facts.lastQuery.commandSucceeded, mode !== "timeout");
      assert.equal(facts.lastQuery.parseValid, false);
      return true;
    });
    assert.equal(attempts, 1);
  }
});

test("thrown query diagnostics cannot inject evidence and preserve the original error identity", async () => {
  const secret = "private process details";
  const original = Object.assign(new Error(secret), { code: "EACCES", removalFacts: { secret } });
  assert.equal(nativeRemovalFailureFacts(original), null);
  const fixture = clockedQuery([]);
  await assert.rejects(waitForNativeServiceRemoval({ ...fixture.options, query: () => { throw original; } }), (error) => {
    assert.equal(error, original);
    const facts = nativeRemovalFailureFacts(error);
    assert.equal(facts.reason, "query_threw"); assert.equal(facts.samples, 1);
    assert.equal(facts.lastQuery.errorCode, "EACCES"); assert.equal(facts.lastQuery.errorPresent, true);
    assert.ok(!JSON.stringify(facts).includes(secret)); return true;
  });
  assert.equal(nativeRemovalFailureFacts({ removalFacts: { secret } }), null);
});

test("aggregate timeout retains last query facts without turning late absence into completion", async () => {
  const fixture = clockedQuery([]);
  await assert.rejects(waitForNativeServiceRemoval({ ...fixture.options, query: () => { fixture.advance(10000); return reply("null\n"); } }), (error) => {
    assert.equal(error.code, "ETIMEDOUT");
    const facts = nativeRemovalFailureFacts(error);
    assert.equal(facts.reason, "deadline"); assert.equal(facts.observed, false);
    assert.equal(facts.elapsedMs, 10000); assert.equal(facts.samples, 1);
    assert.equal(facts.lastQuery.enabled, false); assert.equal(facts.lastQuery.commandSucceeded, true);
    return true;
  });
});
