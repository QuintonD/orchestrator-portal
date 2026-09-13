// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class PolicyTest {
    @Test public void rejectsProtectedPackagesAndCompanionVariants() {
        for (String name : new String[]{"android", "com.android.settings", "com.android.systemui", "com.vendor.permissioncontroller", "com.google.android.gms", "io.github.quintond.orchestrator.phonecontrol.debug"})
            assertTrue(name, Policy.protectedPackage(name, "io.github.quintond.orchestrator.phonecontrol"));
        assertFalse(Policy.protectedPackage("io.github.example.notes", "self"));
    }
    @Test public void packageGrammarRejectsInjectionAndUnboundedNames() {
        assertTrue(Policy.validPackage("io.github.example.notes"));
        for (String value : new String[]{"", "com", "com..app", "com.app;am start", "com.app\n", "a." + "b".repeat(201)}) assertFalse(value, Policy.validPackage(value));
    }
    @Test public void idsAreBoundedAndSafeForReceiptKeys() {
        assertTrue(Policy.validId("n_0_1-2"));
        for (String value : new String[]{"", "../foo", "a.b", "a".repeat(97), "hello world", "n\n"}) assertFalse(value, Policy.validId(value));
    }
    @Test public void rejectsStaleAndFutureObservations() {
        assertTrue(Policy.fresh(60_000, 0)); assertFalse(Policy.fresh(60_001, 0)); assertFalse(Policy.fresh(0, 1));
    }
    @Test public void boundsExcludeEdgesNanInfinityAndNegativeCoordinates() {
        assertTrue(Policy.point(0, 0, 100, 100)); assertTrue(Policy.point(99.9, 99, 100, 100));
        assertFalse(Policy.point(100, 0, 100, 100)); assertFalse(Policy.point(-1, 0, 100, 100));
        assertFalse(Policy.point(Double.NaN, 0, 100, 100)); assertFalse(Policy.point(0, Double.POSITIVE_INFINITY, 100, 100));
    }
    @Test public void gesturesCannotRunIndefinitely() { assertTrue(Policy.duration(100)); assertTrue(Policy.duration(2000)); assertFalse(Policy.duration(99)); assertFalse(Policy.duration(2001)); }
    @Test public void rawCaptureBudgetCoversTypicalPhonesButRejectsLargeOrOverflowingWindows() {
        assertTrue(Policy.capturePixels(1440, 3200)); assertTrue(Policy.capturePixels(2000, 3000));
        assertFalse(Policy.capturePixels(4096, 4096)); assertFalse(Policy.capturePixels(Integer.MAX_VALUE, Integer.MAX_VALUE));
        assertFalse(Policy.capturePixels(0, 100)); assertFalse(Policy.capturePixels(100, -1));
    }
    @Test public void touchesExcludeSystemGestureEdgesWithoutChangingObservationCoordinates() {
        assertTrue(Policy.point(0, 50, 720, 1400));
        assertFalse(Policy.touchPoint(0, 50, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(41.99, 50, 42, 0, 678, 1360));
        assertTrue(Policy.touchPoint(42, 0, 42, 0, 678, 1360));
        assertTrue(Policy.touchPoint(677.9, 1359.9, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(678, 50, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint((float) 677.999999, 50, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(360, 1360, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(Double.NaN, 50, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(50, Double.POSITIVE_INFINITY, 42, 0, 678, 1360));
        assertFalse(Policy.touchPoint(50, 50, 100, 0, 100, 100));
    }
    @Test public void tokenChecksDoNotAcceptPrefixesNullOrOversize() {
        assertTrue(Policy.tokenEquals("abc", "abc")); assertFalse(Policy.tokenEquals("abc", "ab")); assertFalse(Policy.tokenEquals(null, "abc"));
        assertFalse(Policy.tokenEquals("abc", "a".repeat(129))); assertFalse(Policy.tokenEquals("abc", "abd"));
    }
    @Test public void actionSurfaceExcludesShellAndRawKeys() {
        assertFalse(Policy.OPERATIONS.contains("shell")); assertFalse(Policy.OPERATIONS.contains("keycode"));
        assertTrue(Policy.MUTATIONS.contains("fixture.increment")); assertFalse(Policy.MUTATIONS.contains("observe"));
    }
}
