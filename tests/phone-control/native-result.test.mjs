import assert from "node:assert/strict";
import test from "node:test";
import { parseNativeResult } from "./native-result.mjs";

const summary = "PASS: 36 native assertions; no token or observation content exported.";
const success = `INSTRUMENTATION_RESULT: stream=${summary}\n\nINSTRUMENTATION_CODE: -1\n`;

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
