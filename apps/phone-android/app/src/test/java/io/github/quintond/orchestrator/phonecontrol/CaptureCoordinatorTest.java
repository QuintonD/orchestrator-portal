// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;

public class CaptureCoordinatorTest {
    @Test public void onlyTheSettledAwaitingFrameworkInternalCallbackGrantsRecovery() {
        for (int code : new int[] { 1, 2, 3, 4, 5, 6, 9999 }) {
            CaptureCoordinator coordinator = new CaptureCoordinator();
            CaptureCoordinator.Ticket ticket = coordinator.begin(0);
            assertTrue(ticket.requested());
            coordinator.frameworkFailure(ticket, code, new RuntimeException("fixed failure"));
            assertEquals(code == 1, ticket.recoveryEligible());
            assertNull(coordinator.current());
            CaptureCoordinator.Ticket replacement = coordinator.begin(1);
            coordinator.frameworkFailure(ticket, 1, new RuntimeException("duplicate"));
            assertEquals(code == 1, ticket.recoveryEligible()); assertSame(replacement, coordinator.current());
        }
    }
    @Test public void queuedAbandonedEncodingAndGenericFailuresCannotGrantRecovery() {
        for (String phase : new String[] { "queued", "abandoned", "encoding", "generic" }) {
            CaptureCoordinator coordinator = new CaptureCoordinator();
            CaptureCoordinator.Ticket ticket = coordinator.begin(0);
            if (!phase.equals("queued")) assertTrue(ticket.requested());
            if (phase.equals("abandoned")) coordinator.abandon(ticket);
            if (phase.equals("encoding")) assertTrue(coordinator.encoding(ticket));
            if (phase.equals("generic")) coordinator.failBeforeEncoding(ticket, new RuntimeException("screenshot_internal_error"));
            coordinator.frameworkFailure(ticket, 1, new RuntimeException("late internal callback"));
            assertFalse(ticket.recoveryEligible());
            if (phase.equals("encoding")) assertSame(ticket, coordinator.current());
            else assertNull(coordinator.current());
        }
    }
    @Test public void timeoutBeforeMainThreadCannotIssueALateOsRequest() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(100);
        coordinator.abandon(ticket);
        assertNull(coordinator.current());
        assertFalse(ticket.requested());
    }
    @Test public void timedOutOsRequestBlocksNewRequestsUntilCallbackCleanup() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket old = coordinator.begin(100);
        assertTrue(old.requested());
        coordinator.abandon(old);
        assertNull(coordinator.begin(200));
        assertFalse(coordinator.encoding(old));
        coordinator.finish(old);
        CaptureCoordinator.Ticket next = coordinator.begin(300);
        assertNotNull(next);
        coordinator.finish(old);
        assertSame(next, coordinator.current());
    }
    @Test public void stopCannotAccumulateQueuedEncodingWork() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(0);
        assertTrue(ticket.requested()); assertTrue(coordinator.encoding(ticket));
        coordinator.abandon(ticket);
        assertTrue(ticket.abandoned()); assertNull(coordinator.begin(1));
        coordinator.finish(ticket);
        assertNotNull(coordinator.begin(2));
    }
    @Test public void fatalEncoderFaultClosesResourcesReconcilesWaiterAndReleasesSlot() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(100);
        java.util.concurrent.atomic.AtomicBoolean closed = new java.util.concurrent.atomic.AtomicBoolean();
        OutOfMemoryError fatal = new OutOfMemoryError("synthetic private encoder detail");
        assertSame(fatal, assertThrows(OutOfMemoryError.class, () -> coordinator.encode(ticket, () -> {
            try (AutoCloseable resource = () -> closed.set(true)) { throw fatal; }
        })));
        assertTrue(closed.get()); assertNull(coordinator.current());
        java.util.concurrent.CompletionException response = assertThrows(java.util.concurrent.CompletionException.class, ticket.result::join);
        assertEquals("Capture encoding failed", response.getCause().getMessage());
        assertNotNull(coordinator.begin(200));
    }
    @Test public void checkedEncoderFaultCannotCompleteSuccessfullyOrRetainTheSlot() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(100);
        coordinator.encode(ticket, () -> { throw new java.io.IOException("untrusted encoder text"); });
        assertNull(coordinator.current()); assertTrue(ticket.result.isCompletedExceptionally());
        java.util.concurrent.CompletionException response = assertThrows(java.util.concurrent.CompletionException.class, ticket.result::join);
        assertFalse(response.getCause().getMessage().contains("untrusted"));
        CaptureCoordinator.Ticket probe = coordinator.begin(200);
        coordinator.encode(probe, () -> new byte[0]);
        assertEquals(0, probe.result.join().length); assertNull(coordinator.current());
    }
    @Test public void duplicateSuccessCannotQueueAnotherEncoderOrReleaseItsSlot() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(0);
        assertTrue(ticket.requested());
        assertFalse(ticket.requested());
        assertTrue(coordinator.encoding(ticket));
        assertFalse(coordinator.encoding(ticket));
        assertSame(ticket, coordinator.current());
        assertNull(coordinator.begin(1));
        coordinator.encode(ticket, () -> new byte[] { 42 });
        assertArrayEquals(new byte[] { 42 }, ticket.result.join());
        assertFalse(coordinator.encoding(ticket));
    }
    @Test public void latePlatformFailureCannotReleaseAnEncodingSlotEvenAfterStop() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(0);
        assertTrue(ticket.requested()); assertTrue(coordinator.encoding(ticket));
        coordinator.abandon(ticket);
        coordinator.failBeforeEncoding(ticket, new IllegalStateException("late callback"));
        assertSame(ticket, coordinator.current()); assertNull(coordinator.begin(1));
        assertFalse(ticket.result.isDone());
        assertFalse(coordinator.encoding(ticket));
        coordinator.encode(ticket, () -> new byte[0]);
        assertTrue(ticket.result.isCompletedExceptionally());
        assertNull(coordinator.current());
    }
    @Test public void failureThenSuccessCannotReviveATicketOrReleaseItsReplacement() {
        CaptureCoordinator coordinator = new CaptureCoordinator();
        CaptureCoordinator.Ticket ticket = coordinator.begin(0);
        assertTrue(ticket.requested());
        RuntimeException failure = new RuntimeException("fixed capture error");
        coordinator.failBeforeEncoding(ticket, failure);
        CaptureCoordinator.Ticket next = coordinator.begin(1);
        assertFalse(coordinator.encoding(ticket));
        coordinator.failBeforeEncoding(ticket, new RuntimeException("duplicate"));
        assertSame(next, coordinator.current());
        assertSame(failure, assertThrows(java.util.concurrent.CompletionException.class, ticket.result::join).getCause());
    }
}
