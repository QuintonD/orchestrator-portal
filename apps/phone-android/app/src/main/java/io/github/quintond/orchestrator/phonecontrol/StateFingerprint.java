// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

/** Delimiter-containing app strings cannot collide with adjacent state fields. */
final class StateFingerprint {
    private StateFingerprint() { }
    static void append(StringBuilder output, CharSequence value) throws ApiException {
        if (value == null) { output.append("|-1:"); return; }
        if (value.length() > 8192) throw new ApiException("tree_too_large", "Node content exceeds observation limits");
        output.append('|').append(value.length()).append(':').append(value);
    }
}
