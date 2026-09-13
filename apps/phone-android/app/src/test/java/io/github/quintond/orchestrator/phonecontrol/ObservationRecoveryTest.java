// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class ObservationRecoveryTest {
    record View(int id, String app, int window, String identity, int revision) { }
    interface Step { void run() throws Exception; }
    static final class Harness implements ObservationRecovery.Work<View, byte[]> {
        long now;
        int reads;
        int captures;
        int verified;
        int targetChecks;
        final CaptureCoordinator coordinator = new CaptureCoordinator();
        final List<View> views = new ArrayList<>(List.of(view(1, 0), view(2, 1), view(3, 1)));
        final List<Step> readsBefore = new ArrayList<>();
        final List<Step> capturesBefore = new ArrayList<>();
        final List<Exception> failures = new ArrayList<>();
        boolean active = true;
        boolean lateOldSuccess;
        CaptureCoordinator.Ticket old;
        View verifiedBefore;
        View verifiedAfter;
        static View view(int id, int revision) { return new View(id, "synthetic.app", 7, "signer1", revision); }
        void requireActive() throws Exception { if (!active) throw new Exception("session_expired"); }
        @Override public View read(ObservationRecovery.Deadline deadline) throws Exception {
            int index = reads++;
            if (index < readsBefore.size() && readsBefore.get(index) != null) readsBefore.get(index).run();
            deadline.check(); requireActive();
            return views.get(index);
        }
        @Override public byte[] capture(View before, ObservationRecovery.Deadline deadline) throws Exception {
            int index = captures++;
            requireActive(); deadline.check();
            CaptureCoordinator.Ticket ticket = coordinator.begin(now);
            assertNotNull(ticket); assertTrue(ticket.requested());
            if (index > 0 && lateOldSuccess) {
                // A late old result must be disposed, never encoded into the new
                // observation or used to settle its independent coordinator slot.
                assertFalse(coordinator.encoding(old));
                assertSame(ticket, coordinator.current());
            }
            if (index < capturesBefore.size() && capturesBefore.get(index) != null) capturesBefore.get(index).run();
            if (index < failures.size() && failures.get(index) != null) {
                Exception failure = failures.get(index);
                coordinator.frameworkFailure(ticket, 1, failure);
                old = ticket;
                assertTrue(ticket.recoveryEligible()); assertNull(coordinator.current());
                throw new ObservationRecovery.RetryableCaptureFailure(failure, now - ticket.started);
            }
            requireActive(); deadline.check();
            assertTrue(coordinator.encoding(ticket));
            coordinator.encode(ticket, () -> new byte[] { (byte) before.id() });
            return ticket.result.join();
        }
        @Override public void sameTarget(View first, View next) throws Exception {
            targetChecks++;
            if (!first.app().equals(next.app()) || first.window() != next.window() || !first.identity().equals(next.identity()))
                throw new Exception("stale_observation");
        }
        @Override public void verify(View before, View after) throws Exception {
            verified++; requireActive(); verifiedBefore = before; verifiedAfter = after;
            if (before.revision() != after.revision()) throw new Exception("stale_observation");
        }
        ObservationRecovery recovery(int sdk) { return new ObservationRecovery(sdk, () -> now); }
        void firstFrameworkFailure() {
            failures.add(new Exception("screenshot_internal_error"));
            capturesBefore.add(() -> now += 5000);
        }
    }

    @Test public void settledFailureOn14And15UsesOnlyTheFreshSecondObservation() throws Exception {
        for (int sdk : new int[] { 34, 35 }) {
            Harness h = new Harness(); h.firstFrameworkFailure(); h.lateOldSuccess = true;
            ObservationRecovery recovery = h.recovery(sdk);
            var result = recovery.run(h);
            assertEquals(2, result.observation().id());
            assertArrayEquals(new byte[] { 2 }, result.pixels());
            assertEquals(3, h.reads); assertEquals(2, h.captures); assertEquals(1, h.targetChecks);
            assertEquals(2, h.verifiedBefore.id()); assertEquals(3, h.verifiedAfter.id());
            assertEquals(5000, recovery.facts().initialElapsedMs());
            assertEquals(5000, recovery.facts().totalElapsedMs()); assertNull(h.coordinator.current());
        }
    }
    @Test public void otherSdkVersionsNeverAttemptRecovery() {
        for (int sdk : new int[] { 33, 36, 37 }) {
            Harness h = new Harness(); h.firstFrameworkFailure();
            ObservationRecovery recovery = h.recovery(sdk);
            assertSame(h.failures.get(0), assertThrows(Exception.class, () -> recovery.run(h)));
            assertEquals(1, h.reads); assertEquals(1, h.captures); assertNull(recovery.facts());
        }
    }
    @Test public void genericErrorWithTheSameCodeDoesNotGrantRetry() {
        Harness h = new Harness(); Exception failure = new Exception("screenshot_internal_error");
        h.capturesBefore.add(() -> { throw failure; });
        ObservationRecovery recovery = h.recovery(35);
        assertSame(failure, assertThrows(Exception.class, () -> recovery.run(h)));
        assertEquals(1, h.reads); assertEquals(1, h.captures); assertNull(recovery.facts());
    }
    @Test public void retryRequiresSamePackageWindowAndSigningIdentity() {
        for (View other : List.of(new View(2, "other.app", 7, "signer1", 1),
                new View(2, "synthetic.app", 8, "signer1", 1), new View(2, "synthetic.app", 7, "signer2", 1))) {
            Harness h = new Harness(); h.firstFrameworkFailure(); h.views.set(1, other);
            ObservationRecovery recovery = h.recovery(35);
            assertEquals("stale_observation", assertThrows(Exception.class, () -> recovery.run(h)).getMessage());
            assertEquals(2, h.reads); assertEquals(1, h.captures); assertEquals(0, h.verified);
            assertNotNull(recovery.facts());
        }
    }
    @Test public void protectedRetryAndStopRetainHistoryWithoutAnotherCapture() {
        for (boolean stop : new boolean[] { false, true }) {
            Harness h = new Harness(); h.firstFrameworkFailure();
            h.readsBefore.add(null); h.readsBefore.add(() -> {
                if (stop) h.active = false; else throw new Exception("sensitive_window");
            });
            ObservationRecovery recovery = h.recovery(34);
            assertEquals(stop ? "session_expired" : "sensitive_window", assertThrows(Exception.class, () -> recovery.run(h)).getMessage());
            assertEquals(2, h.reads); assertEquals(1, h.captures); assertNotNull(recovery.facts());
        }
    }
    @Test public void changedRetryContentOrStopBeforeVerificationCannotReturnPixels() {
        for (boolean stop : new boolean[] { false, true }) {
            Harness h = new Harness(); h.firstFrameworkFailure();
            if (stop) { h.readsBefore.add(null); h.readsBefore.add(null); h.readsBefore.add(() -> h.active = false); }
            else h.views.set(2, Harness.view(3, 2));
            ObservationRecovery recovery = h.recovery(35);
            assertEquals(stop ? "session_expired" : "stale_observation", assertThrows(Exception.class, () -> recovery.run(h)).getMessage());
            assertEquals(2, h.captures); assertNotNull(recovery.facts()); assertNull(h.coordinator.current());
        }
    }
    @Test public void secondFrameworkFailureIsTerminalAndKeepsFirstFailureTiming() {
        Harness h = new Harness(); h.firstFrameworkFailure(); h.failures.add(new Exception("second internal error"));
        h.capturesBefore.add(() -> h.now += 3000);
        ObservationRecovery recovery = h.recovery(35);
        assertSame(h.failures.get(1), assertThrows(Exception.class, () -> recovery.run(h)));
        assertEquals(2, h.reads); assertEquals(2, h.captures);
        assertEquals(5000, recovery.facts().initialElapsedMs()); assertEquals(8000, recovery.facts().totalElapsedMs());
    }
    @Test public void fullBudgetIncludesFirstReadAndExactDeadlineCannotPublish() {
        Harness h = new Harness(); h.firstFrameworkFailure();
        h.readsBefore.add(() -> h.now += 1000); h.readsBefore.add(() -> h.now += 1000);
        h.readsBefore.add(() -> h.now += 2000);
        ObservationRecovery recovery = h.recovery(35);
        assertThrows(ObservationRecovery.DeadlineExceeded.class, () -> recovery.run(h));
        assertEquals(9000, h.now); assertEquals(0, h.verified);
        assertEquals(5000, recovery.facts().initialElapsedMs()); assertEquals(9000, recovery.facts().totalElapsedMs());
    }
    @Test public void noTimeForRetryPreservesOriginalFailureWithoutRecoveryMetadata() {
        Harness h = new Harness(); h.firstFrameworkFailure(); h.readsBefore.add(() -> h.now += 4000);
        ObservationRecovery recovery = h.recovery(35);
        assertSame(h.failures.get(0), assertThrows(Exception.class, () -> recovery.run(h)));
        assertEquals(1, h.reads); assertEquals(1, h.captures); assertNull(recovery.facts());
    }
    @Test public void perPhaseWaitsNeverExtendTheAggregateBudgetAndFactsDoNotHideLateness() throws Exception {
        Harness h = new Harness(); h.firstFrameworkFailure(); ObservationRecovery recovery = h.recovery(35);
        recovery.run(h);
        assertEquals(4000, recovery.deadline.remaining(6000));
        h.now = 8999; assertEquals(1, recovery.deadline.remaining(6000));
        h.now = 9000; assertThrows(ObservationRecovery.DeadlineExceeded.class, () -> recovery.deadline.remaining(1));
        h.now = 70_000; assertEquals(60_000, recovery.facts().totalElapsedMs());
    }
    @Test public void anUnansweredLocalTimeoutRetainsItsSlotAndCannotRecover() {
        Harness h = new Harness();
        h.capturesBefore.add(() -> {
            CaptureCoordinator.Ticket pending = h.coordinator.current();
            h.now = 6000; h.coordinator.abandon(pending);
            assertFalse(pending.recoveryEligible());
            throw new Exception("screenshot_timeout");
        });
        ObservationRecovery recovery = h.recovery(35);
        assertEquals("screenshot_timeout", assertThrows(Exception.class, () -> recovery.run(h)).getMessage());
        assertEquals(1, h.captures); assertNull(recovery.facts()); assertNotNull(h.coordinator.current());
        assertNull(h.coordinator.begin(h.now));
    }
}
