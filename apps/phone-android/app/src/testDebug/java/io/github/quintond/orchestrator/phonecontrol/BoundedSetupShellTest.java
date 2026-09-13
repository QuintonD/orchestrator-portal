// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class BoundedSetupShellTest {
    private static final String COMMAND = "dumpsys -t 2 accessibility";
    private static final byte[] COMPLETE = "\nPHONE_QA_COMMAND_COMPLETE:0\n".getBytes(StandardCharsets.UTF_8);

    private static final class Pipes {
        final AtomicBoolean stdoutClosed = new AtomicBoolean(), stderrClosed = new AtomicBoolean(), stdinClosed = new AtomicBoolean();
        final ByteArrayOutputStream input = new ByteArrayOutputStream() {
            @Override public void close() { stdinClosed.set(true); }
        };
        final BoundedSetupShell.Channel channel;
        Pipes(InputStream stdout, byte[] stderr) {
            channel = new BoundedSetupShell.Channel(new FilterInputStream(stdout) {
                @Override public void close() throws IOException { stdoutClosed.set(true); super.close(); }
            }, input, new ByteArrayInputStream(stderr) {
                @Override public void close() { stderrClosed.set(true); }
            });
        }
        void assertClosed() { assertTrue(stdoutClosed.get()); assertTrue(stderrClosed.get()); assertTrue(stdinClosed.get()); }
    }

    @Test public void fixedScriptIsWrittenThroughStdinAndAllOwnedPipesClose() throws Exception {
        Pipes pipes = new Pipes(new ByteArrayInputStream(COMPLETE), new byte[0]);
        try (BoundedSetupShell shell = new BoundedSetupShell(() -> pipes.channel)) {
            AccessibilitySetup.Reply result = shell.execute(COMMAND, 1000);
            assertEquals("", AccessibilitySetup.commandBody(result));
        }
        assertEquals(AccessibilitySetup.script(COMMAND), pipes.input.toString(StandardCharsets.UTF_8));
        pipes.assertClosed();
    }

    @Test public void silentReadDeadlineClosesPipesAndCannotPassPartialSuccess() throws Exception {
        InputStream blocked = new InputStream() {
            private boolean closed;
            @Override public synchronized int read() throws IOException {
                while (!closed) try { wait(); } catch (InterruptedException ignored) { /* Model an uninterruptible pipe read. */ }
                throw new IOException("closed");
            }
            @Override public synchronized void close() { closed = true; notifyAll(); }
        };
        Pipes pipes = new Pipes(blocked, new byte[0]);
        long start = System.nanoTime();
        try (BoundedSetupShell shell = new BoundedSetupShell(() -> pipes.channel)) {
            try { shell.execute(COMMAND, 50); fail("Silent command must time out"); }
            catch (AccessibilitySetup.CommandFailure expected) {
                assertEquals("Disposable test shell did not complete", expected.getMessage());
                assertEquals(AccessibilitySetup.Kind.TIMEOUT, expected.kind);
                assertEquals(AccessibilitySetup.ShellPhase.DRAIN, expected.phase);
            }
        }
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 2000);
        pipes.assertClosed();
    }

    @Test public void descriptorsArrivingAfterOpeningDeadlineAreImmediatelyClosed() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        Pipes pipes = new Pipes(new ByteArrayInputStream(COMPLETE), new byte[0]);
        try (BoundedSetupShell shell = new BoundedSetupShell(() -> {
            while (release.getCount() != 0) try { release.await(); } catch (InterruptedException ignored) { /* Model delayed Binder return. */ }
            return new BoundedSetupShell.Channel(pipes.channel.stdout, pipes.channel.stdin, pipes.channel.stderr);
        })) {
            try { shell.execute(COMMAND, 50); fail("Opening pipes is inside the deadline"); }
            catch (AccessibilitySetup.CommandFailure expected) {
                assertEquals(AccessibilitySetup.Kind.TIMEOUT, expected.kind);
                assertEquals(AccessibilitySetup.ShellPhase.OPEN, expected.phase);
            }
            release.countDown();
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (!(pipes.stdoutClosed.get() && pipes.stderrClosed.get() && pipes.stdinClosed.get()) && System.nanoTime() < until) Thread.sleep(5);
            pipes.assertClosed();
            assertEquals(0, pipes.input.size());
        } finally { release.countDown(); }
    }

    @Test public void oversizedOrInvalidUtf8OutputCannotBecomeAcknowledgement() throws Exception {
        for (byte[] output : new byte[][] {new byte[AccessibilitySetup.MAX_BYTES + 1], {(byte) 0xC3, (byte) 0x28}}) {
            Pipes pipes = new Pipes(new ByteArrayInputStream(output), new byte[0]);
            try (BoundedSetupShell shell = new BoundedSetupShell(() -> pipes.channel)) {
                try { shell.execute(COMMAND, 1000); fail("Invalid output"); }
                catch (AccessibilitySetup.CommandFailure expected) { assertEquals(AccessibilitySetup.Kind.INVALID, expected.kind); }
            }
            pipes.assertClosed();
        }
    }

    @Test public void openingAndWritingIoFailuresKeepTheirFixedPhase() throws Exception {
        for (boolean opening : new boolean[] {true, false}) {
            AtomicBoolean closed = new AtomicBoolean();
            BoundedSetupShell.Transport transport = () -> {
                if (opening) throw new IOException("private opening reply");
                return new BoundedSetupShell.Channel(new ByteArrayInputStream(COMPLETE), new java.io.OutputStream() {
                    @Override public void write(int value) throws IOException { throw new IOException("private write reply"); }
                    @Override public void close() { closed.set(true); }
                }, new ByteArrayInputStream(new byte[0]));
            };
            try (BoundedSetupShell shell = new BoundedSetupShell(transport)) {
                try { shell.execute(COMMAND, 1000); fail("I/O failure"); }
                catch (AccessibilitySetup.CommandFailure expected) {
                    assertEquals(AccessibilitySetup.Kind.IO, expected.kind);
                    assertEquals(opening ? AccessibilitySetup.ShellPhase.OPEN : AccessibilitySetup.ShellPhase.WRITE, expected.phase);
                    assertFalse(expected.toString().contains("private"));
                }
            }
            if (!opening) assertTrue(closed.get());
        }
    }
}
