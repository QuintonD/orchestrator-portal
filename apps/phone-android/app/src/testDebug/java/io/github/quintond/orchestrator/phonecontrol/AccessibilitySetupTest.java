// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;

public class AccessibilitySetupTest {
    private static final String TARGET = "io.github.quintond.orchestrator.phonecontrol.debug/io.github.quintond.orchestrator.phonecontrol.PhoneService";
    private static final String OTHER = "example.other/example.other.Service";
    private static AccessibilitySetup.Reply framed(String text) {
        return new AccessibilitySetup.Reply(text + "\nPHONE_QA_COMMAND_COMPLETE:0\n", "");
    }
    // Structural fields/tail are shared by Android14/15/16QPR2 AccessibilityUserState.dump.
    private static String user(int id, String enabled, String binding, String crashed, String attributes) {
        return "User state[\n     attributes:{id=" + id + ", " + attributes + "}\n"
                + "     Bound services:{}\n     Enabled services:{" + enabled + "}\n"
                + "     Binding services:{" + binding + "}\n     Crashed services:{" + crashed + "}\n"
                + "     Client list info:{\n          Client list 1 callbacks:\n          Registered clients:{\n}]\n";
    }
    private static String dump(String enabled) {
        return "ACCESSIBILITY MANAGER (dumpsys accessibility)\n\ncurrentUserId=0\n"
                + user(0, enabled, "", "", "touchExplorationEnabled=false")
                + "Accessibility Display Listener:\n    SystemUI uid: 10099\n    1 valid display: 0\n";
    }
    private static void invalid(AccessibilitySetup.Reply reply) {
        try { AccessibilitySetup.cachedState(reply, TARGET); fail("Expected invalid acknowledgement"); }
        catch (IllegalStateException expected) { assertFalse(expected.getMessage().contains("private")); }
    }

    @Test public void cachedEnabledBindingAndCrashedSetsAreDistinctFromBoundServices() {
        for (String attributes : List.of("touchExplorationEnabled=false, installedServiceCount=2",
                "touchExplorationEnabled=false, magnificationModes={0=1}",
                "touchExplorationEnabled=false, magnificationModes={0=1}, alwaysOnMagnificationEnabled=false")) {
            String body = dump("{" + TARGET + "}").replace("touchExplorationEnabled=false", attributes);
            assertTrue(AccessibilitySetup.cachedState(framed(body), TARGET).enabled());
            assertTrue(AccessibilitySetup.cachedState(framed(dump("")), TARGET).disabled());
        }
        String body = dump("").replace("Binding services:{}", "Binding services:{{" + TARGET + "}}")
                .replace("Crashed services:{}", "Crashed services:{{" + TARGET + "}}");
        AccessibilitySetup.State state = AccessibilitySetup.cachedState(framed(body), TARGET);
        assertFalse(state.enabled()); assertTrue(state.binding()); assertTrue(state.crashed()); assertFalse(state.disabled());
    }

    @Test public void exactUserAndCanonicalComponentIdentityMatter() {
        String body = dump("{" + OTHER + "}");
        assertTrue(AccessibilitySetup.cachedState(framed(body), TARGET).disabled());
        assertTrue(AccessibilitySetup.cachedState(framed(body), "example.other/.Service").enabled());
        body = dump("").replace("User state[", user(1, "{" + TARGET + "}", "", "", "touchExplorationEnabled=false") + "User state[");
        assertTrue(AccessibilitySetup.cachedState(framed(body), TARGET).disabled());
        assertTrue(AccessibilitySetup.cachedState(framed(dump("{io.github.quintond.orchestrator.phonecontrol.debug/.PhoneService}")), TARGET).disabled());
    }

    @Test public void malformedDuplicateOrAmbiguousUserStateNeverAcknowledgesDisable() {
        String body = dump("");
        for (String changed : List.of(body.replace("currentUserId=0", "currentUserId=1"),
                body.replace("currentUserId=0", "currentUserId=0 (set for UiAutomation purposes; real user is 1)"),
                body.replace("currentUserId=0", "currentUserId=0\ncurrentUserId=0"),
                body.replace("id=0,", "id=00,"), body.replace("id=0,", "id=1,"),
                body.replace("touchExplorationEnabled=false}", "touchExplorationEnabled=false"),
                body.replace("User state[", user(0, "", "", "", "touchExplorationEnabled=false") + "User state["),
                body.replace("     Enabled services:{}\n", ""),
                body.replace("     Enabled services:{}", "     Enabled services:{}\n     Enabled services:{}"),
                body.replace("Enabled services:{}", "Enabled services:{private}"),
                body.replace("Enabled services:{}", "Enabled services:{{" + OTHER + "}, {example.other/.Service}}"),
                body.replace("}]\nAccessibility", "Accessibility"))) invalid(framed(changed));
    }

    @Test public void commandCompletionAndCompleteDumpTailAreMandatory() {
        String body = dump("");
        invalid(new AccessibilitySetup.Reply(body, ""));
        invalid(new AccessibilitySetup.Reply(body + "\nPHONE_QA_COMMAND_COMPLETE:1\n", ""));
        invalid(new AccessibilitySetup.Reply(body + "\nPHONE_QA_COMMAND_COMPLETE:0\nPHONE_QA_COMMAND_COMPLETE:0\n", ""));
        invalid(new AccessibilitySetup.Reply(framed(body).stdout(), "private stderr"));
        invalid(framed(body.substring(0, body.indexOf("Accessibility Display Listener:"))));
        invalid(framed(body + "trailing output\n"));
        invalid(framed(body.replace("1 valid display: 0", "2 valid displays: 0")));
        invalid(framed(body.replace("1 valid display: 0", "2 valid displays: 0, 0")));
        invalid(framed(body + "x".repeat(AccessibilitySetup.MAX_BYTES)));
        for (String error : List.of("*** SERVICE 'accessibility' DUMP TIMEOUT (2000ms) EXPIRED ***",
                "Security exception: private", "Exception occurred while dumping:", "Permission Denial: private")) {
            invalid(framed(body.replace("currentUserId=0", error + "\ncurrentUserId=0")));
        }
        assertTrue(AccessibilitySetup.cachedState(new AccessibilitySetup.Reply(framed(body).stdout().replace("\n", "\r\r\n"), ""), TARGET).disabled());
    }

    @Test public void shellScriptAcceptsOnlyReviewedCommandsAndDoesNotNeedQuotedArgv() {
        String script = AccessibilitySetup.script("dumpsys -t 2 accessibility");
        assertTrue(script.startsWith("dumpsys -t 2 accessibility\n"));
        assertTrue(script.contains("phone_qa_command_status=$?\n"));
        assertTrue(script.contains("PHONE_QA_COMMAND_COMPLETE:%s"));
        for (String command : List.of("dumpsys accessibility; echo private", "settings put secure enabled_accessibility_services " + TARGET + ";id", "settings put secure enabled_accessibility_services $(id)")) {
            try { AccessibilitySetup.script(command); fail("Unreviewed shell command"); } catch (IllegalStateException expected) { /* Fixed failure only. */ }
        }
    }

    @Test public void delayedCachedDisableIsAcknowledgedBeforeSingleEnable() throws Exception {
        List<String> commands = new ArrayList<>(); long[] clock = {0}; int[] dumps = {0}; boolean[] connected = {false};
        AccessibilitySetup.prepare(TARGET, (command, timeout) -> {
            commands.add(command); assertTrue(timeout > 0 && timeout <= 2000);
            if (command.startsWith("dumpsys")) return framed(dump(++dumps[0] < 3 ? "{" + TARGET + "}" : ""));
            if (command.endsWith(" " + TARGET)) assertEquals(3, dumps[0]);
            if (command.equals("settings put secure accessibility_enabled 1")) connected[0] = true;
            return framed("");
        }, () -> connected[0], () -> clock[0], ms -> clock[0] += ms);
        assertEquals(200, clock[0]);
        assertEquals(1, commands.stream().filter(x -> x.endsWith(" " + TARGET)).count());
    }

    @Test public void missingCachedAcknowledgementOrOldInstanceCannotEnableOrExtendBudget() {
        for (boolean oldInstance : List.of(false, true)) {
            long[] clock = {0}; int[] enables = {0};
            try {
                AccessibilitySetup.prepare(TARGET, (command, timeout) -> {
                    if (command.endsWith(" " + TARGET)) enables[0]++;
                    return command.startsWith("dumpsys") ? framed(dump(oldInstance ? "" : "{" + TARGET + "}")) : framed("");
                }, () -> oldInstance, () -> clock[0], ms -> clock[0] += ms);
                fail("Missing manager acknowledgement");
            } catch (AccessibilitySetup.SetupFailure expected) { assertEquals("accessibility_disable", expected.stage); }
            assertEquals(0, enables[0]); assertEquals(20_000, clock[0]);
        }
    }

    @Test public void enableAndConnectUseRemainingAggregateBudgetAndSafeFailureStage() {
        long[] clock = {0};
        try {
            AccessibilitySetup.prepare(TARGET, (command, timeout) -> {
                assertTrue(timeout > 0 && timeout <= 2000);
                clock[0] += 1500;
                return command.startsWith("dumpsys") ? framed(dump("")) : framed("");
            }, () -> false, () -> clock[0], ms -> clock[0] += ms);
            fail("Missing connection");
        } catch (AccessibilitySetup.SetupFailure expected) { assertEquals("accessibility_connect", expected.stage); }
        assertEquals(20_000, clock[0]);
        for (String stage : List.of("accessibility_disable", "accessibility_enable")) {
            try {
                AccessibilitySetup.prepare(TARGET, (command, timeout) -> {
                    if (stage.equals("accessibility_disable") || command.endsWith(" " + TARGET)) throw new java.io.IOException("private output");
                    return command.startsWith("dumpsys") ? framed(dump("")) : framed("");
                }, () -> false, () -> 0, ms -> {});
                fail("Query failure");
            } catch (AccessibilitySetup.SetupFailure expected) { assertEquals(stage, expected.stage); assertFalse(expected.toString().contains("private")); }
        }
    }
}
