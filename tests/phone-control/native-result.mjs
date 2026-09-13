// Project only known framework markers and the SmokeTest summary, never raw output.
export function parseNativeResult(output, exitCode) {
  const terminalCodes = [];
  const statusCodes = [];
  const assertionCounts = [];
  const assertionFailures = [];
  const failureStages = [];
  const failureCauses = [];
  const setupFailures = [];
  let nativeFailure;
  let nativeFailureSeen = false;
  const safeStages = new Set(["configuration", "accessibility_automation", "accessibility_setup", "accessibility_disable", "accessibility_enable", "accessibility_connect", "session_setup", "describe", "fixture_launch", "initial_observation", "native_assertions", "document_probe", "biometric_probe", "host_probe"]);
  const safeClasses = new Set(["AssertionError", "SetupFailure", "ExceptionInInitializerError", "PatternSyntaxException", "IllegalStateException", "JSONException", "ApiException", "IOException", "SocketTimeoutException", "InterruptedException", "NullPointerException", "IllegalArgumentException", "RuntimeException", "SecurityException", "Exception", "Error"]);
  const safeCodes = ["screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error", "screenshot_unavailable", "sensitive_window", "observation_blocked", "observation_expired", "consent_unavailable", "invalid_request", "forbidden"];
  const nativeChecks = new Set(["initial_observation", "observation_available", "screenshot_default", "screenshot_grant_default", "screenshot_disclosure_denied", "screenshot_enable_session", "node_id", "editable_redaction", "screenshot_observe", "screenshot_mime", "screenshot_rendered", "action_observe", "fixture_dispatch", "fixture_duplicate", "fixture_replay_conflict", "observation_consumed", "post_action_observe", "counter_postcondition", "expected_package", "expired_deadline", "invalid_coordinates", "touch_bounds", "edge_tap", "edge_swipe", "edge_pinch", "biometric_required", "secure_enable", "secure_observe", "secure_redaction", "secure_diagnostic", "secure_disable", "password_enable", "password_denial", "password_disable", "caller_scope", "companion_launch", "companion_exclusion", "authenticated_stop", "token_revoked"]);
  const failureKinds = new Set();
  safeCodes.push("protected_window", "window_unavailable", "stale_observation", "tree_too_large", "app_unavailable", "session_expired", "unknown_action_state", "internal_error", "replay_conflict", "deadline_expired");
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
    const nativeLine = raw.replace(/\r$/, "");
    const native = /^INSTRUMENTATION_RESULT: phone_qa_native_failure=(.*)$/.exec(nativeLine);
    if (line.startsWith("INSTRUMENTATION_RESULT: phone_qa_native_failure")) {
      failureKinds.add("reported_native_failure");
      // An ambiguous duplicate invalidates the diagnostic; the failure remains latched.
      if (nativeFailureSeen) nativeFailure = undefined;
      else if (native && native[0] === nativeLine && native[1].length <= 512 && !terminalSeen) {
        try {
          const facts = JSON.parse(native[1]);
          if (facts !== null && typeof facts === "object" && !Array.isArray(facts)
            && Object.keys(facts).length === 4
            && ["schemaVersion", "check", "responseKind", "responseCode"].every((key) => Object.hasOwn(facts, key))
            && JSON.stringify(facts) === native[1] && facts.schemaVersion === 1 && nativeChecks.has(facts.check)
            && ["none", "result", "error", "invalid"].includes(facts.responseKind)
            && (facts.responseKind === "error" ? facts.responseCode === "other" || safeCodes.includes(facts.responseCode) : facts.responseCode === null)) {
            nativeFailure = facts;
          }
        } catch { /* No arbitrary response code, message or incomplete JSON is exported. */ }
      }
      nativeFailureSeen = true;
    }
    const setup = /^INSTRUMENTATION_RESULT: phone_qa_setup_failure=(.*)$/.exec(line);
    if (setup) {
      failureKinds.add("reported_setup_failure");
      if (setup[1].length <= 1024 && setupFailures.length < 4) {
        try {
          const facts = JSON.parse(setup[1]);
          const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
          const state = facts?.lastState;
          if (exactKeys(facts, ["schemaVersion", "point", "kind", "elapsedMs", "samples", "lastState", "shellPhase"])
            && JSON.stringify(facts) === setup[1]
            && facts.schemaVersion === 1
            && ["disable_write", "cached_read", "cached_parse", "disable_ack_wait", "enable_write", "connect_wait"].includes(facts.point)
            && ["timeout", "invalid", "io", "interrupted", "other"].includes(facts.kind)
            && (facts.shellPhase === null || ["open", "write", "drain"].includes(facts.shellPhase))
            && Number.isSafeInteger(facts.elapsedMs) && facts.elapsedMs >= 0 && facts.elapsedMs <= 180_000
            && Number.isSafeInteger(facts.samples) && facts.samples >= 0 && facts.samples <= 200
            && (facts.samples === 0 ? state === null : exactKeys(state, ["enabled", "binding", "crashed", "connected"])
              && Object.values(state).every((value) => typeof value === "boolean"))) {
            setupFailures.push(facts);
          }
        } catch { /* Invalid diagnostics remain failures without exporting their contents. */ }
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
      ...(setupFailures.length ? { setupFailures } : {}),
      ...(nativeFailure ? { nativeFailure } : {}),
      failureKinds: [...failureKinds],
    },
  };
}
