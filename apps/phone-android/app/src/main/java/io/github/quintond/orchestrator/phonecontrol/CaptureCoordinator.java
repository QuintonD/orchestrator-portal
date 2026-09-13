// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicReference;

/** A timed-out OS request retains its slot until the callback disposes its buffer. */
final class CaptureCoordinator {
    static final class Ticket {
        final long started;
        final CompletableFuture<byte[]> result = new CompletableFuture<>();
        final RuntimeException encodingFailure = new RuntimeException("Capture encoding failed");
        volatile String stage = "queued";
        private boolean abandoned;
        private boolean finished;
        private boolean frameworkInternalFailure;
        Ticket(long started) { this.started = started; }
        synchronized boolean requested() {
            if (abandoned || finished || !stage.equals("queued")) return false;
            stage = "awaiting_callback";
            return true;
        }
        synchronized boolean abandoned() { return abandoned; }
        synchronized boolean recoveryEligible() { return finished && !abandoned && frameworkInternalFailure; }
    }
    private final AtomicReference<Ticket> active = new AtomicReference<>();
    Ticket current() { return active.get(); }
    Ticket begin(long now) {
        Ticket ticket = new Ticket(now);
        return active.compareAndSet(null, ticket) ? ticket : null;
    }
    void abandon(Ticket ticket) {
        synchronized (ticket) {
            ticket.abandoned = true;
            if (ticket.stage.equals("queued")) finish(ticket);
        }
    }
    boolean encoding(Ticket ticket) {
        synchronized (ticket) {
            // A duplicated success must close only its own buffer; it cannot
            // enqueue another encoder or release the first encoder's slot.
            if (ticket.finished || !ticket.stage.equals("awaiting_callback")) return false;
            if (ticket.abandoned) { finish(ticket); return false; }
            ticket.stage = "encoding";
            return true;
        }
    }
    void failBeforeEncoding(Ticket ticket, Throwable failure) {
        synchronized (ticket) {
            // A late platform failure cannot settle work already handed to the
            // encoder. Only that worker (or submission rejection) owns cleanup.
            if (ticket.finished || ticket.stage.equals("encoding")) return;
            finish(ticket);
            ticket.result.completeExceptionally(failure);
        }
    }
    void frameworkFailure(Ticket ticket, int errorCode, Throwable failure) {
        synchronized (ticket) {
            if (ticket.finished || ticket.stage.equals("encoding")) return;
            // Only this actual public callback grants recovery provenance. Android may
            // synthesize INTERNAL_ERROR (1) after five seconds; this is not proof that
            // the lower-level capture finished. Never infer it from a projected code.
            ticket.frameworkInternalFailure = errorCode == 1 && !ticket.abandoned
                    && ticket.stage.equals("awaiting_callback") && active.get() == ticket;
            failBeforeEncoding(ticket, failure);
        }
    }
    void finish(Ticket ticket) {
        synchronized (ticket) {
            ticket.finished = true;
            active.compareAndSet(ticket, null);
        }
    }
    void encode(Ticket ticket, Callable<byte[]> operation) {
        byte[] bytes = null;
        Throwable failure = null;
        try { bytes = operation.call(); }
        catch (Throwable rejected) { failure = rejected; }
        finally { finish(ticket); }
        if (failure != null || bytes == null || ticket.abandoned()) {
            // Keep known safe API failures. The fallback is allocated with the
            // ticket, before bitmap work, and contains no exception details.
            ticket.result.completeExceptionally(failure instanceof ApiException ? failure : ticket.encodingFailure);
        } else ticket.result.complete(bytes);
        // Fatal VM/programming errors retain their normal semantics after the
        // slot and waiter are reconciled; they are never treated as a capture.
        if (failure instanceof Error fatal) throw fatal;
    }
}
