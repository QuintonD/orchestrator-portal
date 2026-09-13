// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class CaptureDiagnosticsTest {
    @Test public void platformReasonsHaveDistinctSafeProtocolCodes() {
        assertEquals("screenshot_internal_error", CaptureDiagnostics.androidCode(1));
        assertEquals("screenshot_access_denied", CaptureDiagnostics.androidCode(2));
        assertEquals("screenshot_rate_limited", CaptureDiagnostics.androidCode(3));
        assertEquals("screenshot_invalid_display", CaptureDiagnostics.androidCode(4));
        assertEquals("screenshot_invalid_window", CaptureDiagnostics.androidCode(5));
        assertEquals("screenshot_secure_window", CaptureDiagnostics.androidCode(6));
        assertEquals("screenshot_internal_error", CaptureDiagnostics.androidCode(9999));
    }
    @Test public void arbitraryMessagesCannotBecomeCaptureDiagnostics() {
        assertFalse(CaptureDiagnostics.known("private window title"));
        assertFalse(CaptureDiagnostics.known("session_expired"));
        ApiException failure = CaptureDiagnostics.failure("private window title");
        assertEquals("screenshot_internal_error", failure.code);
        assertFalse(failure.getMessage().contains("private window title"));
        assertTrue(CaptureDiagnostics.known("screenshot_geometry_changed"));
        assertTrue(CaptureDiagnostics.known("screenshot_timeout"));
    }
}
