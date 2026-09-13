// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** Owns only the three pipes returned for one test shell; deadline includes opening them. */
final class BoundedSetupShell implements AccessibilitySetup.Shell, AutoCloseable {
    interface Transport { Channel open() throws Exception; }
    static final class Channel implements AutoCloseable {
        final InputStream stdout, stderr;
        final OutputStream stdin;
        Channel(InputStream stdout, OutputStream stdin, InputStream stderr) {
            this.stdout = stdout; this.stdin = stdin; this.stderr = stderr;
        }
        @Override public void close() {
            for (AutoCloseable stream : new AutoCloseable[] {stdin, stdout, stderr}) {
                try { if (stream != null) stream.close(); } catch (Exception ignored) { /* Attempt every owned pipe. */ }
            }
        }
    }
    private static final class Command {
        private boolean cancelled;
        private Channel channel;
        synchronized void opened(Channel value) throws IOException {
            if (cancelled) { value.close(); throw new IOException("Test shell deadline elapsed"); }
            channel = value;
        }
        synchronized void close() {
            cancelled = true;
            if (channel != null) { channel.close(); channel = null; }
        }
    }
    private final Transport transport;
    private final ExecutorService workers = Executors.newFixedThreadPool(3, task -> {
        Thread thread = new Thread(task, "phone-qa-setup-shell"); thread.setDaemon(true); return thread;
    });
    private Command active;

    BoundedSetupShell(Transport transport) { this.transport = transport; }

    @Override public AccessibilitySetup.Reply execute(String command, long timeoutMs) throws Exception {
        if (timeoutMs <= 0 || timeoutMs > 2000) throw new IOException("Invalid test shell deadline");
        final String script = AccessibilitySetup.script(command);
        final Command state = new Command();
        active = state;
        Future<AccessibilitySetup.Reply> task = workers.submit(() -> {
            Future<String> stdout = null, stderr = null;
            try {
                Channel channel = transport.open();
                state.opened(channel);
                stdout = workers.submit(() -> read(channel.stdout, AccessibilitySetup.MAX_BYTES));
                stderr = workers.submit(() -> read(channel.stderr, 4096));
                channel.stdin.write(script.getBytes(StandardCharsets.UTF_8));
                channel.stdin.close();
                return new AccessibilitySetup.Reply(stdout.get(), stderr.get());
            } finally {
                state.close();
                if (stdout != null) stdout.cancel(true);
                if (stderr != null) stderr.cancel(true);
            }
        });
        try { return task.get(timeoutMs, TimeUnit.MILLISECONDS); }
        catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IOException("Disposable test shell did not complete");
        } finally {
            state.close(); task.cancel(true); active = null;
        }
    }

    private static String read(InputStream stream, int maximum) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > maximum) throw new IOException("Test shell output exceeded its bound");
                bytes.write(buffer, 0, count);
            }
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        }
    }

    @Override public void close() {
        if (active != null) active.close();
        workers.shutdownNow();
    }
}
