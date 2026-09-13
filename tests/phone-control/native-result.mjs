// Project only known framework markers and the SmokeTest summary, never raw output.
export function parseNativeResult(output, exitCode) {
  const terminalCodes = [];
  const statusCodes = [];
  const assertionCounts = [];
  const assertionFailures = [];
  const failureStages = [];
  const failureCauses = [];
  const safeStages = new Set(["configuration", "accessibility_automation", "accessibility_setup", "accessibility_disable", "accessibility_enable", "accessibility_connect", "session_setup", "describe", "fixture_launch", "initial_observation", "native_assertions", "document_probe", "biometric_probe", "host_probe"]);
  const safeClasses = new Set(["AssertionError", "SetupFailure", "ExceptionInInitializerError", "PatternSyntaxException", "IllegalStateException", "JSONException", "ApiException", "IOException", "SocketTimeoutException", "InterruptedException", "NullPointerException", "IllegalArgumentException", "RuntimeException", "SecurityException", "Exception", "Error"]);
  const safeCodes = ["screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error", "screenshot_unavailable", "sensitive_window", "observation_blocked", "observation_expired", "consent_unavailable", "invalid_request", "forbidden"];
  const failureKinds = new Set();
  safeCodes.push("protected_window", "window_unavailable", "stale_observation", "tree_too_large", "app_unavailable", "session_expired", "unknown_action_state", "internal_error");
  let resultStream = false;
  let terminalSeen = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const terminal = /^INSTRUMENTATION_CODE: (-?\d+)$/.exec(line);
    const status = /^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/.exec(line);
    if (terminal) {
      terminalCodes.push(Number(terminal[1])); terminalSeen = true; resultStream = false;
      continue;
    }
    if (status) {
      statusCodes.push(Number(status[1])); resultStream = false;
      continue;
    }
    if (/^(?:Error: )?INSTRUMENTATION_(?:FAILED|ABORTED):/.test(line)
      || /^INSTRUMENTATION_(?:RESULT|STATUS): (?:shortMsg|Error)=/.test(line)) failureKinds.add("framework_failure");
    const stage = /^INSTRUMENTATION_RESULT: phone_qa_failure_stage=(.*)$/.exec(line);
    if (stage) {
      failureKinds.add("reported_failure_stage");
      if (safeStages.has(stage[1]) && failureStages.length < 32) failureStages.push(stage[1]);
    }
    const cause = /^INSTRUMENTATION_RESULT: phone_qa_failure_cause=(.*)$/.exec(line);
    if (cause) {
      failureKinds.add("reported_failure_cause");
      const pattern = /^PatternSyntaxException:(-1|0|[1-9]\d{0,4})$/.exec(cause[1]);
      if (pattern && Number(pattern[1]) <= 65_536 && failureCauses.length < 4) {
        failureCauses.push({ errorClass: "PatternSyntaxException", patternIndex: Number(pattern[1]) });
      }
    }
    const stream = /^INSTRUMENTATION_RESULT: stream=(.*)$/.exec(line);
    if (stream) resultStream = !terminalSeen;
    else if (/^INSTRUMENTATION_/.test(line)) resultStream = false;
    const content = stream ? stream[1].trim() : line;
    if (resultStream) {
      const summary = /^PASS: ([1-9]\d{0,5}) native assertions; no token or observation content exported\.$/.exec(content);
      if (summary) assertionCounts.push(Number(summary[1]));
      const failed = /^FAIL after (\d{1,6}) assertions: ([A-Za-z]+):?(.*)$/.exec(content);
      if (failed) {
        failureKinds.add("assertion_failure");
        const stateDifference = /\bstateDifference=(package|app_identity|window_identity|window_geometry|tree_content|content_event|none)\b/.exec(failed[3])?.[1];
        assertionFailures.push({ afterAssertions: Number(failed[1]), errorClass: safeClasses.has(failed[2]) ? failed[2] : "Error", recognizedCodes: safeCodes.filter((code) => new RegExp(`\\b${code}\\b`).test(failed[3])), ...(stateDifference ? { stateDifference } : {}) });
      } else if (/^FAIL after \d+ assertions:/.test(content)) failureKinds.add("assertion_failure");
    }
  }
  if (exitCode !== 0) failureKinds.add("adb_exit");
  if (terminalCodes.length !== 1 || terminalCodes[0] !== -1) failureKinds.add("terminal_status");
  if (statusCodes.some((code) => ![0, 1].includes(code))) failureKinds.add("test_status");
  if (assertionCounts.length !== 1) failureKinds.add("assertion_summary");
  return {
    passed: failureKinds.size === 0,
    checks: assertionCounts.length === 1 ? [`PASS: ${assertionCounts[0]} native assertions; no token or observation content exported.`] : [],
    diagnostics: {
      adbExitCode: Number.isSafeInteger(exitCode) ? exitCode : null,
      instrumentationCodes: terminalCodes.filter(Number.isSafeInteger).slice(0, 32),
      statusCodes: statusCodes.filter(Number.isSafeInteger).slice(0, 32),
      assertionCounts: assertionCounts.slice(0, 32),
      assertionFailures: assertionFailures.slice(0, 32),
      failureStages,
      ...(failureCauses.length ? { failureCauses } : {}),
      failureKinds: [...failureKinds],
    },
  };
}
