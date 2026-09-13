// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class NativeReplayFixtureTest {
    @Test public void exactOneSecondElapsedCannotTurnTheConflictIntoAnIdenticalReplay() {
        long started = 1_789_324_472_998L;
        long original = started + 30_000;
        // The former wall-clock formula collides precisely at this elapsed time.
        assertEquals(original, started + 1000 + 29_000);
        assertNotEquals(original, NativeReplayFixture.conflictingDeadline(original));
    }

    @Test(expected = ArithmeticException.class) public void impossibleUnderflowFailsInsteadOfWrapping() {
        NativeReplayFixture.conflictingDeadline(Long.MIN_VALUE);
    }
}
