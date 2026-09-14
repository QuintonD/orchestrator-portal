// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.concurrent.CompletableFuture;

/** A timed-out provider keeps its slot until it actually returns. No unbounded thread/retry queue. */
final class DocumentWork {
    interface Action<T> { T run(Ticket<T> ticket) throws Exception; }
    static final class Ticket<T> {
        final CompletableFuture<T> result = new CompletableFuture<>();
        volatile boolean abandoned;
        volatile boolean writeAttempted;
        synchronized void abandon() { abandoned = true; }
        synchronized void beforeWrite() throws ApiException {
            check();
            writeAttempted = true;
        }
        void check() throws ApiException {
            if (abandoned) throw new ApiException(writeAttempted ? "unknown_action_state" : "document_unavailable", "Document request ended; do not retry writes automatically");
        }
    }
    private Ticket<?> current;
    private final java.util.ArrayDeque<Runnable> cleanup = new java.util.ArrayDeque<>();
    synchronized boolean busy() { return current != null; }
    synchronized void abandon() { if (current != null) current.abandon(); }
    synchronized void afterIdle(Runnable action) {
        if (cleanup.size() >= 16) return; // Local authority is already removed; retained URI access stays inert.
        cleanup.add(action);
        if (current == null) {
            try { start(ticket -> null); } catch (ApiException impossible) { throw new AssertionError(impossible); }
        }
    }
    synchronized <T> Ticket<T> start(Action<T> action) throws ApiException {
        if (current != null) throw new ApiException("busy", "A document provider operation is still in progress");
        Ticket<T> ticket = new Ticket<>(); current = ticket;
        Thread worker = new Thread(() -> {
            try { T result = action.run(ticket); ticket.check(); ticket.result.complete(result); }
            catch (Throwable error) { ticket.result.completeExceptionally(error); }
            finally {
                // Android URI permission release never blocks Stop and cannot race a new document grant.
                while (true) {
                    Runnable next;
                    synchronized (DocumentWork.this) {
                        next = cleanup.poll();
                        if (next == null) { if (current == ticket) current = null; break; }
                    }
                    try { next.run(); } catch (RuntimeException ignored) { /* The removed local grant remains authoritative. */ }
                }
            }
        }, "phone-document-provider");
        worker.setDaemon(true); worker.start(); return ticket;
    }
}
