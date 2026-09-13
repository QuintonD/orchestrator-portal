// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static android.accessibilityservice.AccessibilityService.*;
import java.util.Set;

/** Fixed protocol reasons only; never forwards exception messages or window content. */
final class CaptureDiagnostics {
    private static final Set<String> CODES = Set.of("screenshot_rate_limited", "screenshot_secure_window",
            "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied",
            "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error");
    private CaptureDiagnostics() { }
    static String androidCode(int code) {
        return switch (code) {
            case ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT -> "screenshot_rate_limited";
            case ERROR_TAKE_SCREENSHOT_SECURE_WINDOW -> "screenshot_secure_window";
            case ERROR_TAKE_SCREENSHOT_INVALID_WINDOW -> "screenshot_invalid_window";
            case ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY -> "screenshot_invalid_display";
            case ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS -> "screenshot_access_denied";
            default -> "screenshot_internal_error";
        };
    }
    static boolean known(String code) { return CODES.contains(code); }
    static ApiException failure(String code) {
        return new ApiException(known(code) ? code : "screenshot_internal_error", "Window capture failed; tree and pixels withheld, no action authorized");
    }
    static ApiException failure(String code, CaptureCoordinator.Ticket ticket, long now) {
        if (ticket == null) return failure(code);
        return new ApiException(known(code) ? code : "screenshot_internal_error", "Window capture failed; tree and pixels withheld, no action authorized",
                Json.object("captureStage", ticket.stage, "captureElapsedMs", Math.max(0, Math.min(60_000, now - ticket.started))));
    }
}
