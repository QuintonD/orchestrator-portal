// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

/** Comparison only. Live capture, privacy, session, consent and deadline checks remain mandatory. */
final class ActionRevalidation {
    private ActionRevalidation() { }
    record Bounds(int left, int top, int right, int bottom) { }
    record State(String packageName, String identity, int windowId, Bounds bounds,
                 Bounds windowBounds, Bounds touchBounds, String digest, long contentEpoch) { }

    static String difference(State before, State after) {
        if (!before.packageName().equals(after.packageName())) return "package";
        if (!before.identity().equals(after.identity())) return "app identity";
        if (before.windowId() != after.windowId()) return "window identity";
        if (!before.bounds().equals(after.bounds()) || !before.windowBounds().equals(after.windowBounds())
                || !before.touchBounds().equals(after.touchBounds())) return "window geometry";
        if (!before.digest().equals(after.digest())) return "tree content";
        if (before.contentEpoch() != after.contentEpoch()) return "content event";
        return "none";
    }

    static boolean beforeConsent(State before, State after) {
        return difference(before, after).equals("none");
    }

    static boolean afterConsent(State before, State after, String method, String key) {
        String difference = difference(before, after);
        if (difference.equals("none") || difference.equals("content event")) return true;
        // Only validated Home addresses the system navigation effect rather than app content.
        // Any tree change is permitted here; its cause cannot be attributed to app autosave.
        return difference.equals("tree content") && "key".equals(method) && "home".equals(key);
    }
}
