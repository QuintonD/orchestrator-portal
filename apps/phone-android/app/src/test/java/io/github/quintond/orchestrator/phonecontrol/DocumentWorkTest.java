// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ExecutionException;
import org.junit.Test;
import static org.junit.Assert.*;

public final class DocumentWorkTest {
    @Test public void timeoutRetainsSlotAndCannotPublishLateRead() throws Exception {
        DocumentWork work = new DocumentWork(); CountDownLatch finish = new CountDownLatch(1);
        DocumentWork.Ticket<String> ticket = work.start(job -> { finish.await(); return "private content"; });
        try {
            ticket.abandon(); assertTrue(work.busy());
            assertThrows(ApiException.class, () -> work.start(job -> "second"));
        } finally { finish.countDown(); }
        ExecutionException failure = assertThrows(ExecutionException.class, () -> ticket.result.get(2, TimeUnit.SECONDS));
        assertEquals("document_unavailable", ((ApiException) failure.getCause()).code);
    }
    @Test public void abandonedWorkerCannotStartWrite() throws Exception {
        DocumentWork.Ticket<Void> ticket = new DocumentWork.Ticket<>();
        ticket.abandon(); assertThrows(ApiException.class, ticket::beforeWrite); assertFalse(ticket.writeAttempted);
    }
    @Test public void stopAfterWriteAttemptIsAlwaysUnknown() throws Exception {
        DocumentWork.Ticket<Void> ticket = new DocumentWork.Ticket<>(); ticket.beforeWrite(); ticket.abandon();
        assertEquals("unknown_action_state", assertThrows(ApiException.class, ticket::check).code);
    }
    @Test public void providerFailureCompletesWithoutHidingException() throws Exception {
        DocumentWork work = new DocumentWork();
        DocumentWork.Ticket<Void> ticket = work.start(job -> { throw new IOExceptionFixture(); });
        assertTrue(assertThrows(ExecutionException.class, () -> ticket.result.get(2, TimeUnit.SECONDS)).getCause() instanceof IOExceptionFixture);
    }
    @Test public void revocationCleanupWaitsForRealProviderCompletion() throws Exception {
        DocumentWork work = new DocumentWork(); CountDownLatch finish = new CountDownLatch(1); CountDownLatch cleaned = new CountDownLatch(1);
        DocumentWork.Ticket<Void> ticket = work.start(job -> { finish.await(); return null; });
        ticket.abandon(); work.afterIdle(cleaned::countDown);
        assertEquals(1, cleaned.getCount()); assertTrue(work.busy());
        finish.countDown(); assertTrue(cleaned.await(2, TimeUnit.SECONDS));
    }
    private static final class IOExceptionFixture extends Exception { }
}
