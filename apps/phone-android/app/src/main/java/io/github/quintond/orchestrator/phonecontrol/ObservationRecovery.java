// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.util.function.LongSupplier;

/** One fresh read after a settled framework failure; never used for action capture. */
final class ObservationRecovery {
    static final long BUDGET_MS = 9000;
    static boolean applies(int sdk) { return sdk == 34 || sdk == 35; }

    static final class DeadlineExceeded extends Exception { }
    static final class Deadline {
        private final LongSupplier clock;
        private final long started;
        final boolean bounded;
        Deadline(LongSupplier clock, boolean bounded) {
            this.clock = clock;
            this.started = clock.getAsLong();
            this.bounded = bounded;
        }
        long elapsed() { return Math.max(0, clock.getAsLong() - started); }
        long remaining(long ceiling) throws DeadlineExceeded {
            long remaining = bounded ? Math.min(ceiling, BUDGET_MS - elapsed()) : ceiling;
            if (remaining <= 0) throw new DeadlineExceeded();
            return remaining;
        }
        void check() throws DeadlineExceeded { remaining(Long.MAX_VALUE); }
    }
    /** Created only from a ticket whose actual framework callback settled its slot. */
    static final class RetryableCaptureFailure extends Exception {
        final Exception failure;
        final long captureElapsedMs;
        RetryableCaptureFailure(Exception failure, long captureElapsedMs) {
            super(failure);
            this.failure = failure;
            this.captureElapsedMs = Math.max(0, Math.min(60_000, captureElapsedMs));
        }
    }
    interface Work<T, P> {
        T read(Deadline deadline) throws Exception;
        P capture(T before, Deadline deadline) throws Exception;
        void sameTarget(T first, T next) throws Exception;
        void verify(T before, T after) throws Exception;
    }
    record Result<T, P>(T observation, P pixels) { }
    record Facts(long initialElapsedMs, long totalElapsedMs) { }

    final Deadline deadline;
    private Long initialElapsedMs;

    ObservationRecovery(int sdk, LongSupplier clock) { deadline = new Deadline(clock, applies(sdk)); }
    Facts facts() {
        return initialElapsedMs == null ? null : new Facts(initialElapsedMs,
                Math.max(initialElapsedMs, Math.min(60_000, deadline.elapsed())));
    }
    <T, P> Result<T, P> run(Work<T, P> work) throws Exception {
        T first = null;
        RetryableCaptureFailure initial = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            if (attempt == 1) {
                // No second read means no recovery metadata: preserve the original
                // failure if the aggregate budget expired before recovery could start.
                try { deadline.check(); } catch (DeadlineExceeded expired) { throw initial.failure; }
                initialElapsedMs = initial.captureElapsedMs;
            }
            if (attempt == 0) deadline.check();
            T before = work.read(deadline);
            deadline.check();
            if (attempt == 0) first = before;
            else work.sameTarget(first, before);
            deadline.check();
            P pixels;
            try { pixels = work.capture(before, deadline); }
            catch (RetryableCaptureFailure failed) {
                if (attempt == 0 && deadline.bounded) { initial = failed; continue; }
                throw failed.failure;
            }
            deadline.check();
            T after = work.read(deadline);
            deadline.check();
            work.verify(before, after);
            deadline.check();
            return new Result<>(before, pixels);
        }
        throw new AssertionError("Bounded observation attempts exhausted");
    }
}
