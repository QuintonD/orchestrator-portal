// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import java.util.List;
import org.junit.Test;

public class ActionRevalidationTest {
    private static final ActionRevalidation.Bounds BOUNDS = new ActionRevalidation.Bounds(0, 24, 720, 1400);
    private static final ActionRevalidation.Bounds WINDOW = new ActionRevalidation.Bounds(0, 0, 720, 1440);
    private static final ActionRevalidation.Bounds TOUCH = new ActionRevalidation.Bounds(24, 0, 696, 1360);
    private static final ActionRevalidation.State ORIGINAL = state("com.example.editor", "signer-a:version-1", 7, BOUNDS, WINDOW, TOUCH, "before", 10);
    private static final List<String> OTHER_METHODS = List.of("app.launch", "fixture.increment", "tap", "longPress", "swipe", "pinch", "node.click", "node.scroll", "type", "stop", "observe", "describe", "apps.list");

    private static ActionRevalidation.State state(String name, String identity, int window, ActionRevalidation.Bounds bounds,
                                                  ActionRevalidation.Bounds windowBounds, ActionRevalidation.Bounds touchBounds, String digest, long epoch) {
        return new ActionRevalidation.State(name, identity, window, bounds, windowBounds, touchBounds, digest, epoch);
    }
    private static ActionRevalidation.State content(String digest, long epoch) {
        return state(ORIGINAL.packageName(), ORIGINAL.identity(), ORIGINAL.windowId(), BOUNDS, WINDOW, TOUCH, digest, epoch);
    }
    private static boolean home(ActionRevalidation.State current) {
        return ActionRevalidation.afterConsent(ORIGINAL, current, "key", "home");
    }
    private static void rejectsEveryAction(ActionRevalidation.State current, String difference) {
        assertEquals(difference, ActionRevalidation.difference(ORIGINAL, current));
        assertFalse(ActionRevalidation.beforeConsent(ORIGINAL, current)); assertFalse(home(current));
        assertFalse(ActionRevalidation.afterConsent(ORIGINAL, current, "key", "back"));
        for (String method : OTHER_METHODS) assertFalse(method, ActionRevalidation.afterConsent(ORIGINAL, current, method, "home"));
    }

    @Test public void unchangedContextAndContentRetainExistingComparisonBehavior() {
        assertTrue(ActionRevalidation.beforeConsent(ORIGINAL, ORIGINAL)); assertTrue(home(ORIGINAL));
        assertTrue(ActionRevalidation.afterConsent(ORIGINAL, ORIGINAL, "key", "back"));
        for (String method : OTHER_METHODS) assertTrue(method, ActionRevalidation.afterConsent(ORIGINAL, ORIGINAL, method, ""));
    }
    @Test public void homeRequiresTheFullOriginalFingerprintBeforeConsent() {
        for (ActionRevalidation.State changed : List.of(content("changed", 10), content("before", 11), content("changed", 11)))
            assertFalse(ActionRevalidation.beforeConsent(ORIGINAL, changed));
    }
    @Test public void onlyExactHomePermitsAnyTreeChangeAfterConsent() {
        for (ActionRevalidation.State changed : List.of(content("changed", 10), content("changed", 11), content("arbitrary app-provided content", 900))) {
            assertTrue(home(changed));
            assertFalse(ActionRevalidation.afterConsent(ORIGINAL, changed, "key", "back"));
            for (String method : OTHER_METHODS) assertFalse(method, ActionRevalidation.afterConsent(ORIGINAL, changed, method, "home"));
        }
    }
    @Test public void actionNamesAndKeysCannotSelectAnUnvalidatedRelaxation() {
        ActionRevalidation.State changed = content("changed", 11);
        for (String method : new String[]{null, "", "Key", "key.home", "home", "key ", "key\u0000"})
            assertFalse(ActionRevalidation.afterConsent(ORIGINAL, changed, method, "home"));
        for (String key : new String[]{null, "", "Home", "back", "home ", "home\u0000", "GLOBAL_ACTION_HOME"})
            assertFalse(ActionRevalidation.afterConsent(ORIGINAL, changed, "key", key));
    }
    @Test public void focusContentEventToleranceDoesNotExpandTreeToleranceForOtherActions() {
        ActionRevalidation.State event = content("before", 11);
        assertFalse(ActionRevalidation.beforeConsent(ORIGINAL, event)); assertTrue(home(event));
        assertTrue(ActionRevalidation.afterConsent(ORIGINAL, event, "key", "back"));
        for (String method : OTHER_METHODS) assertTrue(method, ActionRevalidation.afterConsent(ORIGINAL, event, method, ""));
    }
    @Test public void packageSignerAndVersionChangesTakePrecedenceOverTreeChanges() {
        rejectsEveryAction(state("com.example.other", ORIGINAL.identity(), 7, BOUNDS, WINDOW, TOUCH, "changed", 11), "package");
        rejectsEveryAction(state(ORIGINAL.packageName(), "signer-b:version-1", 7, BOUNDS, WINDOW, TOUCH, "changed", 11), "app identity");
        rejectsEveryAction(state(ORIGINAL.packageName(), "signer-a:version-2", 7, BOUNDS, WINDOW, TOUCH, "changed", 11), "app identity");
    }
    @Test public void anotherWindowOfTheSameAppIsNeverAccepted() {
        rejectsEveryAction(state(ORIGINAL.packageName(), ORIGINAL.identity(), 8, BOUNDS, WINDOW, TOUCH, "changed", 11), "window identity");
    }
    @Test public void everyCapturedWindowAndTouchBoundaryIsComparedExactly() {
        for (ActionRevalidation.Bounds original : List.of(BOUNDS, WINDOW, TOUCH)) {
            List<ActionRevalidation.Bounds> changed = List.of(
                    new ActionRevalidation.Bounds(original.left() + 1, original.top(), original.right(), original.bottom()),
                    new ActionRevalidation.Bounds(original.left(), original.top() + 1, original.right(), original.bottom()),
                    new ActionRevalidation.Bounds(original.left(), original.top(), original.right() - 1, original.bottom()),
                    new ActionRevalidation.Bounds(original.left(), original.top(), original.right(), original.bottom() - 1));
            for (ActionRevalidation.Bounds bounds : changed)
                rejectsEveryAction(state(ORIGINAL.packageName(), ORIGINAL.identity(), 7,
                        original == BOUNDS ? bounds : BOUNDS, original == WINDOW ? bounds : WINDOW,
                        original == TOUCH ? bounds : TOUCH, "changed", 11), "window geometry");
        }
    }
    @Test public void oldObservationRemainsDistinctAfterAnAcceptedHomeComparison() {
        ActionRevalidation.State changed = content("changed", 11); assertTrue(home(changed));
        assertEquals("before", ORIGINAL.digest()); assertEquals(10, ORIGINAL.contentEpoch());
        assertFalse(ActionRevalidation.beforeConsent(ORIGINAL, changed));
        assertFalse(ActionRevalidation.afterConsent(ORIGINAL, changed, "node.click", ""));
    }
}
