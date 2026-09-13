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
