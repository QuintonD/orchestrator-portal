// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class NativeCheckEvidenceTest {
    @Test public void eachCheckpointHasAStableContentFreeName() {
        NativeCheckEvidence facts = new NativeCheckEvidence();
        assertNull(facts.facts());
        for (NativeCheckEvidence.Check check : NativeCheckEvidence.Check.values()) {
            facts.at(check);
            assertEquals("{\"schemaVersion\":1,\"check\":\"" + check.name().toLowerCase(java.util.Locale.ROOT)
                    + "\",\"responseKind\":\"none\",\"responseCode\":null}", facts.facts());
        }
    }

    @Test public void theNewCheckpointCannotInheritAPreviousResponse() {
        NativeCheckEvidence facts = new NativeCheckEvidence();
        facts.at(NativeCheckEvidence.Check.FIXTURE_DISPATCH);
        facts.response(false, true, "stale_observation");
        assertTrue(facts.facts().contains("\"responseCode\":\"stale_observation\""));
        facts.at(NativeCheckEvidence.Check.FIXTURE_DUPLICATE);
        assertTrue(facts.facts().contains("\"responseKind\":\"none\",\"responseCode\":null"));
        assertFalse(facts.facts().contains("stale_observation"));
    }

    @Test public void aCorrectCachedResultAndAConflictErrorStayDistinct() {
        NativeCheckEvidence facts = new NativeCheckEvidence();
        facts.at(NativeCheckEvidence.Check.FIXTURE_REPLAY_CONFLICT);
        facts.response(true, false, null);
        assertTrue(facts.facts().contains("\"responseKind\":\"result\",\"responseCode\":null"));
        facts.response(false, true, "replay_conflict");
        assertTrue(facts.facts().contains("\"responseKind\":\"error\",\"responseCode\":\"replay_conflict\""));
    }

    @Test public void unknownInjectedAndMissingCodesNeverEscape() {
        for (String code : new String[] { null, "", "synthetic-private-token", "replay_conflict\nprivate", "\"},\"private\":true", "x".repeat(100_000) }) {
            NativeCheckEvidence facts = new NativeCheckEvidence();
            facts.at(NativeCheckEvidence.Check.FIXTURE_DISPATCH);
            facts.response(false, true, code);
            assertEquals("{\"schemaVersion\":1,\"check\":\"fixture_dispatch\",\"responseKind\":\"error\",\"responseCode\":\"other\"}", facts.facts());
        }
    }

    @Test public void malformedResponseShapesAndNonNativeCallsCarryNoPayload() {
        NativeCheckEvidence facts = new NativeCheckEvidence();
        facts.response(false, true, "private");
        assertNull(facts.facts());
        facts.at(NativeCheckEvidence.Check.FIXTURE_DISPATCH);
        for (boolean present : new boolean[] { false, true }) {
            facts.response(present, present, "private");
            assertTrue(facts.facts().contains("\"responseKind\":\"invalid\",\"responseCode\":null"));
            assertFalse(facts.facts().contains("private"));
        }
    }
}
