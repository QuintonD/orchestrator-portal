// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class StateFingerprintTest {
    private String pair(CharSequence first, CharSequence second) throws ApiException {
        StringBuilder out = new StringBuilder(); StateFingerprint.append(out, first); StateFingerprint.append(out, second); return out.toString();
    }
    @Test public void appControlledDelimitersCannotHideChangedIdentity() throws Exception {
        assertNotEquals(pair("a|b", "c"), pair("a", "b|c"));
        assertNotEquals(pair("a\n|1:b", "c"), pair("a", "b\n|1:c"));
    }
    @Test public void nullEmptyAndLiteralNullAreDistinct() throws Exception {
        assertNotEquals(pair(null, "x"), pair("", "x"));
        assertNotEquals(pair(null, "x"), pair("null", "x"));
    }
    @Test public void unboundedIdentityIsRejectedBeforeAccumulation() throws Exception {
        StringBuilder out = new StringBuilder();
        try { StateFingerprint.append(out, "x".repeat(8193)); fail("Unbounded state accepted"); }
        catch (ApiException expected) { assertEquals("tree_too_large", expected.code); assertEquals(0, out.length()); }
        StateFingerprint.append(out, "x".repeat(8192)); assertTrue(out.length() < 8210);
    }
}
