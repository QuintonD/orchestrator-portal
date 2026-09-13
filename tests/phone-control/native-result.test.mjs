import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseNativeResult } from "./native-result.mjs";

const summary = "PASS: 36 native assertions; no token or observation content exported.";
const success = `INSTRUMENTATION_RESULT: stream=${summary}\n\nINSTRUMENTATION_CODE: -1\n`;

const nativeFacts = { schemaVersion: 1, check: "fixture_replay_conflict", responseKind: "result", responseCode: null };
const nativeMarker = (facts = nativeFacts) => `INSTRUMENTATION_RESULT: phone_qa_native_failure=${JSON.stringify(facts)}\n`;

test("every source-owned checkpoint projects a bounded failure, regardless of assertion count", () => {
  const java = readFileSync(new URL("../../apps/phone-android/app/src/qa/java/io/github/quintond/orchestrator/phonecontrol/NativeCheckEvidence.java", import.meta.url), "utf8");
  const checks = java.match(/enum Check \{([\s\S]*?)\n    \}/)[1].match(/[A-Z][A-Z_]+/g).map((check) => check.toLowerCase());
  assert.equal(checks.length, 39);
  for (const check of checks) {
    const facts = { ...nativeFacts, check };
    const result = parseNativeResult(nativeMarker(facts) + success, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.nativeFailure, facts);
    assert.ok(result.diagnostics.failureKinds.includes("reported_native_failure"));
  }
});

test("a native response result, known refusal and absent response are distinct", () => {
  for (const newline of ["\n", "\r\n", "\r\r\n"]) {
    const output = (nativeMarker() + success).replaceAll("\n", newline);
    const result = parseNativeResult(output, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.nativeFailure, nativeFacts);
  }
  for (const responseKind of ["none", "result", "invalid"]) {
    const facts = { ...nativeFacts, responseKind };
    assert.deepEqual(parseNativeResult(nativeMarker(facts) + success, 0).diagnostics.nativeFailure, facts);
  }
  for (const responseCode of ["replay_conflict", "deadline_expired", "stale_observation", "screenshot_internal_error", "other"]) {
    const facts = { ...nativeFacts, responseKind: "error", responseCode };
    assert.deepEqual(parseNativeResult(nativeMarker(facts) + success, 0).diagnostics.nativeFailure, facts);
  }
});

test("unknown, injected, noncanonical and oversized native facts fail without exposing content", () => {
  const secret = "synthetic-private-window-or-token";
  const invalid = [null, [], {}, { ...nativeFacts, schemaVersion: 2 }, { ...nativeFacts, check: secret },
    { ...nativeFacts, responseKind: secret }, { ...nativeFacts, responseCode: secret }, { ...nativeFacts, private: secret },
    { ...nativeFacts, responseKind: "error", responseCode: null }, { ...nativeFacts, responseCode: "replay_conflict" },
    { ...nativeFacts, responseKind: "error", responseCode: "replay_conflict\n" },
    { ...nativeFacts, responseKind: "error", responseCode: "x".repeat(1000) }];
  const values = [...invalid.map(JSON.stringify), "not-json", JSON.stringify(nativeFacts).replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1"), JSON.stringify(nativeFacts) + " "];
  for (const value of values) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_native_failure=${value}\n${success}`, 0);
    assert.equal(result.passed, false);
    assert.equal(result.diagnostics.nativeFailure, undefined);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test("missing separator, duplicates and post-terminal native markers cannot supply authoritative facts", () => {
  for (const output of [
    "INSTRUMENTATION_RESULT: phone_qa_native_failure\n" + success,
    "INSTRUMENTATION_RESULT: phone_qa_native_failure_suffix=private\n" + success,
    " " + nativeMarker() + success,
    nativeMarker().replace("\n", "\u2028\n") + success,
    nativeMarker().replace("\n", "\u2029\n") + success,
    nativeMarker() + nativeMarker() + success,
    nativeMarker() + nativeMarker({ ...nativeFacts, check: "fixture_dispatch" }) + success,
    nativeMarker().repeat(100) + success,
    success + nativeMarker(),
  ]) {
    const result = parseNativeResult(output, 0);
    assert.equal(result.passed, false);
    assert.equal(result.diagnostics.nativeFailure, undefined);
  }
  const incidental = parseNativeResult("Untrusted prefix " + nativeMarker() + success, 0);
  assert.equal(incidental.passed, true);
  assert.equal(incidental.diagnostics.nativeFailure, undefined);
});

test("replay check wiring derives a guaranteed conflict from the original request and keeps its id", () => {
  const java = readFileSync(new URL("../../apps/phone-android/app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/SmokeTest.java", import.meta.url), "utf8");
  assert.match(java, /nativeCheck\.at\(NativeCheckEvidence\.Check\.FIXTURE_REPLAY_CONFLICT\);\s+JSONObject conflict = new JSONObject\(mutation\.toString\(\)\); conflict\.put\("deadlineAt", NativeReplayFixture\.conflictingDeadline\(mutation\.getLong\("deadlineAt"\)\)\);\s+require\(error\(call\("fixture\.increment", conflict, id\)\)\.equals\("replay_conflict"\)/);
  assert.doesNotMatch(java, /conflict\.put\("deadlineAt", System\.currentTimeMillis\(\)/);
});

test("exact terminal success survives incidental Android FAIL/Exception diagnostics", () => {
  const result = parseNativeResult(`OS diagnostic: Exception while trying a fallback; FAIL marker in an unrelated message\r\n${success}`, 0);
  assert.equal(result.passed, true);
  assert.deepEqual(result.checks, [summary]);
  assert.deepEqual(result.diagnostics.instrumentationCodes, [-1]);
  assert.equal(parseNativeResult(`INSTRUMENTATION_RESULT: stream=\r\n${summary}\r\nINSTRUMENTATION_CODE: -1\r\n`, 0).passed, true);
});

test("framework and exact SmokeTest failures override a success summary without exposing messages", () => {
  const secret = "synthetic_private_error_content";
  for (const failure of [
    `INSTRUMENTATION_FAILED: ${secret}\n`,
    `INSTRUMENTATION_RESULT: shortMsg=${secret}\n`,
    `INSTRUMENTATION_STATUS: Error=${secret}\n`,
    `INSTRUMENTATION_STATUS_CODE: -2\n`,
    `INSTRUMENTATION_RESULT: stream=FAIL after 3 assertions: AssertionError: ${secret}\n`,
  ]) {
    const result = parseNativeResult(failure + success, 0);
    assert.equal(result.passed, false);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test("missing, failed, duplicate or malformed terminal markers cannot pass", () => {
  for (const text of [success.replace("-1", "0"), success.replace("INSTRUMENTATION_CODE: -1", ""), success + "INSTRUMENTATION_CODE: -1\n", success.replace("-1", "-10"), success.replace("-1", "-1 trailing")]) {
    assert.equal(parseNativeResult(text, 0).passed, false);
  }
  for (const code of [null, undefined, 1, 137]) assert.equal(parseNativeResult(success, code).passed, false);
});

test("failed assertions reveal only counts, an allowlisted class and known protocol codes", () => {
  const result = parseNativeResult("INSTRUMENTATION_RESULT: stream=FAIL after 24 assertions: AssertionError: observe: screenshot_rate_limited: private-secret\nINSTRUMENTATION_CODE: 0\n", 0);
  assert.equal(result.passed, false);
  assert.deepEqual(result.diagnostics.assertionFailures, [{ afterAssertions: 24, errorClass: "AssertionError", recognizedCodes: ["screenshot_rate_limited"] }]);
  assert.ok(!JSON.stringify(result).includes("private-secret"));
});

test("a summary must be in the result stream before the framework terminal", () => {
  for (const text of [
    `${summary}\nINSTRUMENTATION_CODE: -1\n`,
    `INSTRUMENTATION_STATUS: stream=${summary}\nINSTRUMENTATION_CODE: -1\n`,
    `INSTRUMENTATION_CODE: -1\nINSTRUMENTATION_RESULT: stream=${summary}\n`,
    success.replace(summary, `${summary}\n${summary}`),
    success.replace("36 native", "0 native"),
  ]) assert.equal(parseNativeResult(text, 0).passed, false);
});

test("state differences expose only the fixed category and no window details", () => {
  const fixed = parseNativeResult("INSTRUMENTATION_RESULT: stream=FAIL after 2 assertions: AssertionError: stale_observation stateDifference=tree_content private-window-value\nINSTRUMENTATION_CODE: 0\n", 0);
  assert.equal(fixed.diagnostics.assertionFailures[0].stateDifference, "tree_content");
  assert.equal(fixed.passed, false);
  assert.ok(!JSON.stringify(fixed).includes("private-window-value"));
  const unknown = parseNativeResult("INSTRUMENTATION_RESULT: stream=FAIL after 2 assertions: AssertionError: stateDifference=private_window_value\nINSTRUMENTATION_CODE: 0\n", 0);
  assert.equal(unknown.diagnostics.assertionFailures[0].stateDifference, undefined);
});

test("failure stages identify only fixed harness phases and cannot turn a failure into success", () => {
  for (const stage of ["configuration", "accessibility_automation", "accessibility_setup", "accessibility_disable", "accessibility_enable", "accessibility_connect", "session_setup", "describe", "fixture_launch", "initial_observation", "native_assertions", "document_probe", "biometric_probe", "host_probe"]) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_failure_stage=${stage}\n${success}`, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.failureStages, [stage]);
    assert.ok(result.diagnostics.failureKinds.includes("reported_failure_stage"));
  }
});

test("cached accessibility setup failures expose the fixed stage and class without shell content", () => {
  const secret = "synthetic-private-shell-reply";
  for (const stage of ["accessibility_disable", "accessibility_enable", "accessibility_connect"]) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_failure_stage=${stage}\nINSTRUMENTATION_RESULT: stream=FAIL after 0 assertions: SetupFailure: ${secret}\nINSTRUMENTATION_CODE: 0\n`, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.failureStages, [stage]);
    assert.deepEqual(result.diagnostics.assertionFailures, [{ afterAssertions: 0, errorClass: "SetupFailure", recognizedCodes: [] }]);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test("unknown, injected and excessive stage diagnostics never export private text", () => {
  const secret = "synthetic-private-window-or-token";
  for (const stage of [secret, `fixture_launch ${secret}`, `fixture_launch=${secret}`, `accessibility_disable_${secret}`, `accessibility_connect ${secret}`, ""]) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_failure_stage=${stage}\n${success}`, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.failureStages, []);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  const incidental = parseNativeResult(`Untrusted prefix INSTRUMENTATION_RESULT: phone_qa_failure_stage=fixture_launch\n${success}`, 0);
  assert.equal(incidental.passed, true);
  assert.deepEqual(incidental.diagnostics.failureStages, []);
  const repeated = parseNativeResult(`${"INSTRUMENTATION_RESULT: phone_qa_failure_stage=fixture_launch\n".repeat(100)}${success}`, 0);
  assert.equal(repeated.passed, false);
  assert.equal(repeated.diagnostics.failureStages.length, 32);
});

test("initializer failures preserve only the fixed nested pattern class and bounded index", () => {
  const secret = "synthetic-private-pattern-or-message";
  for (const index of [-1, 0, 53, 65536]) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_failure_stage=accessibility_setup\nINSTRUMENTATION_RESULT: phone_qa_failure_cause=PatternSyntaxException:${index}\nINSTRUMENTATION_RESULT: stream=FAIL after 0 assertions: ExceptionInInitializerError: ${secret}\nINSTRUMENTATION_CODE: 0\n`, 0);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.failureCauses, [{ errorClass: "PatternSyntaxException", patternIndex: index }]);
    assert.equal(result.diagnostics.assertionFailures[0].errorClass, "ExceptionInInitializerError");
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  for (const value of [secret, `PatternSyntaxException:53 ${secret}`, "PatternSyntaxException:01", "PatternSyntaxException:-2", "PatternSyntaxException:65537", "PatternSyntaxException:9999999999999999999999999", "OtherClass:53", "PatternSyntaxException:"]) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_failure_cause=${value}\n${success}`, 0);
    assert.equal(result.passed, false);
    assert.equal(result.diagnostics.failureCauses, undefined);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  const repeated = parseNativeResult(`${"INSTRUMENTATION_RESULT: phone_qa_failure_cause=PatternSyntaxException:53\n".repeat(100)}${success}`, 0);
  assert.equal(repeated.passed, false);
  assert.equal(repeated.diagnostics.failureCauses.length, 4);
});

test("setup diagnostics admit only fixed points, kinds, bounded timing and complete boolean snapshots", () => {
  const base = { schemaVersion: 1, point: "disable_ack_wait", kind: "timeout", elapsedMs: 20000, samples: 200, lastState: { enabled: false, binding: false, crashed: true, connected: false }, shellPhase: null };
  const parse = (facts) => parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_setup_failure=${JSON.stringify(facts)}\n${success}`, 0);
  for (const point of ["disable_write", "cached_read", "cached_parse", "disable_ack_wait", "enable_write", "connect_wait"]) {
    const facts = { ...base, point };
    const result = parse(facts);
    assert.equal(result.passed, false);
    assert.deepEqual(result.diagnostics.setupFailures, [facts]);
  }
  for (const kind of ["timeout", "invalid", "io", "interrupted", "other"]) for (const shellPhase of [null, "open", "write", "drain"]) {
    const facts = { ...base, kind, shellPhase, samples: 0, lastState: null, elapsedMs: 0 };
    assert.deepEqual(parse(facts).diagnostics.setupFailures, [facts]);
  }
  assert.deepEqual(parse({ ...base, elapsedMs: 180000 }).diagnostics.setupFailures, [{ ...base, elapsedMs: 180000 }]);
});

test("malformed, ambiguous, oversized or private setup facts never escape redaction or hide failure", () => {
  const secret = "synthetic-private-dump-or-error";
  const base = { schemaVersion: 1, point: "cached_parse", kind: "invalid", elapsedMs: 200, samples: 0, lastState: null, shellPhase: null };
  const invalid = [null, [], {}, { ...base, schemaVersion: 2 }, { ...base, point: secret }, { ...base, kind: secret }, { ...base, shellPhase: secret },
    { ...base, elapsedMs: -1 }, { ...base, elapsedMs: 180001 }, { ...base, elapsedMs: 0.5 }, { ...base, elapsedMs: "200" },
    { ...base, samples: -1 }, { ...base, samples: 201 }, { ...base, samples: 1 }, { ...base, [secret]: true },
    { ...base, samples: 1, lastState: { enabled: false, binding: false, crashed: false, connected: secret } },
    { ...base, samples: 1, lastState: { enabled: false, binding: false, crashed: false } },
    { ...base, lastState: { enabled: false, binding: false, crashed: false, connected: false } }];
  const raw = [...invalid.map((value) => JSON.stringify(value)), `${JSON.stringify(base).slice(0, -1)},"samples":0}`, JSON.stringify({ ...base, point: secret.repeat(100) }), "not-json"];
  for (const value of raw) {
    const result = parseNativeResult(`INSTRUMENTATION_RESULT: phone_qa_setup_failure=${value}\n${success}`, 0);
    assert.equal(result.passed, false);
    assert.equal(result.diagnostics.setupFailures, undefined);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  const repeated = parseNativeResult(`${`INSTRUMENTATION_RESULT: phone_qa_setup_failure=${JSON.stringify(base)}\n`.repeat(100)}${success}`, 0);
  assert.equal(repeated.passed, false); assert.equal(repeated.diagnostics.setupFailures.length, 4);
});
