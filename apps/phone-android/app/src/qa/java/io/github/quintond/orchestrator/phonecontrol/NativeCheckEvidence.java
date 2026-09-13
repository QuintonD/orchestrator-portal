// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.Locale;
import java.util.Set;

/** Fixed, content-free checkpoints for the disposable native test only. */
final class NativeCheckEvidence {
    enum Check {
        INITIAL_OBSERVATION,
        OBSERVATION_AVAILABLE,
        SCREENSHOT_DEFAULT,
        SCREENSHOT_GRANT_DEFAULT,
        SCREENSHOT_DISCLOSURE_DENIED,
        SCREENSHOT_ENABLE_SESSION,
        NODE_ID,
        EDITABLE_REDACTION,
        SCREENSHOT_OBSERVE,
        SCREENSHOT_MIME,
        SCREENSHOT_RENDERED,
        ACTION_OBSERVE,
        FIXTURE_DISPATCH,
        FIXTURE_DUPLICATE,
        FIXTURE_REPLAY_CONFLICT,
        OBSERVATION_CONSUMED,
        POST_ACTION_OBSERVE,
        COUNTER_POSTCONDITION,
        EXPECTED_PACKAGE,
        EXPIRED_DEADLINE,
        INVALID_COORDINATES,
        TOUCH_BOUNDS,
        EDGE_TAP,
        EDGE_SWIPE,
        EDGE_PINCH,
        BIOMETRIC_REQUIRED,
        SECURE_ENABLE,
        SECURE_OBSERVE,
        SECURE_REDACTION,
        SECURE_DIAGNOSTIC,
        SECURE_DISABLE,
        PASSWORD_ENABLE,
        PASSWORD_DENIAL,
        PASSWORD_DISABLE,
        CALLER_SCOPE,
        COMPANION_LAUNCH,
        COMPANION_EXCLUSION,
        AUTHENTICATED_STOP,
        TOKEN_REVOKED;
    }
    private static final Set<String> CODES = Set.of(
            "screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display",
            "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout",
            "screenshot_internal_error", "screenshot_unavailable", "sensitive_window", "observation_blocked",
            "observation_expired", "consent_unavailable", "invalid_request", "forbidden", "protected_window",
            "window_unavailable", "stale_observation", "tree_too_large", "app_unavailable", "session_expired",
            "unknown_action_state", "internal_error", "replay_conflict", "deadline_expired");
    private Check check;
    private String responseKind = "none";
    private String responseCode;

    void at(Check next) {
        check = java.util.Objects.requireNonNull(next);
        responseKind = "none";
        responseCode = null;
    }

    void response(boolean resultObject, boolean errorObject, String code) {
        if (check == null) return;
        responseKind = resultObject == errorObject ? "invalid" : resultObject ? "result" : "error";
        responseCode = responseKind.equals("error") ? code != null && CODES.contains(code) ? code : "other" : null;
    }

    String facts() {
        if (check == null) return null;
        return "{\"schemaVersion\":1,\"check\":\"" + check.name().toLowerCase(Locale.ROOT)
                + "\",\"responseKind\":\"" + responseKind + "\",\"responseCode\":"
                + (responseCode == null ? "null" : "\"" + responseCode + "\"") + "}";
    }
}
