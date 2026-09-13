// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Disposable instrumentation helper; shared only with debug JVM tests, never app sources. */
final class AccessibilitySetup {
    static final int MAX_BYTES = 65_536;
    static final String MARKER = "PHONE_QA_COMMAND_COMPLETE:";
    private static final Pattern COMPONENT = Pattern.compile("([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)+)/([.]?[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)");
    // Android ICU requires both literal braces escaped; the desktop JVM accepts a bare '}'.
    private static final Pattern ATTRIBUTES = Pattern.compile("     attributes:\\{id=(0|[1-9][0-9]{0,5}), [^\\r\\n]*\\}");
    private static final Pattern DISPLAYS = Pattern.compile("    (0|[1-9][0-9]?) valid display(s?): (.*)");

    record Reply(String stdout, String stderr) {}
    record State(boolean enabled, boolean binding, boolean crashed) {
        boolean disabled() { return !enabled && !binding && !crashed; }
    }
    interface Shell { Reply execute(String command, long timeoutMs) throws Exception; }
    interface Sleeper { void sleep(long milliseconds) throws InterruptedException; }
    enum Point { DISABLE_WRITE, CACHED_READ, CACHED_PARSE, DISABLE_ACK_WAIT, ENABLE_WRITE, CONNECT_WAIT }
    enum Kind { TIMEOUT, INVALID, IO, INTERRUPTED, OTHER }
    enum ShellPhase { OPEN, WRITE, DRAIN }
    record Snapshot(boolean enabled, boolean binding, boolean crashed, boolean connected) {}
    static final class CommandFailure extends java.io.IOException {
        final Kind kind;
        final ShellPhase phase;
        CommandFailure(Kind kind, ShellPhase phase) {
            super("Disposable test shell did not complete"); this.kind = kind; this.phase = phase;
        }
    }
    private static final class BudgetExpired extends IllegalStateException {}
    static final class SetupFailure extends Exception {
        final String stage;
        final Point point;
        final Kind kind;
        final ShellPhase shellPhase;
        final long elapsedMs;
        final int samples;
        final Snapshot lastState;
        SetupFailure(String stage, Point point, Exception failure, long elapsedMs, int samples, Snapshot lastState) {
            super("Disposable accessibility setup did not complete");
            this.stage = stage; this.point = point;
            this.kind = failure instanceof CommandFailure command ? command.kind
                    : failure instanceof BudgetExpired ? Kind.TIMEOUT
                    : failure instanceof InterruptedException ? Kind.INTERRUPTED
                    : failure instanceof IllegalStateException || failure instanceof IllegalArgumentException ? Kind.INVALID
                    : failure instanceof java.io.IOException ? Kind.IO : Kind.OTHER;
            this.shellPhase = failure instanceof CommandFailure command ? command.phase : null;
            this.elapsedMs = Math.max(0, Math.min(180_000, elapsedMs));
            this.samples = Math.max(0, Math.min(200, samples)); this.lastState = lastState;
        }
        String facts() {
            String state = lastState == null ? "null" : "{\"enabled\":" + lastState.enabled
                    + ",\"binding\":" + lastState.binding + ",\"crashed\":" + lastState.crashed
                    + ",\"connected\":" + lastState.connected + "}";
            return "{\"schemaVersion\":1,\"point\":\"" + point.name().toLowerCase(java.util.Locale.ROOT)
                    + "\",\"kind\":\"" + kind.name().toLowerCase(java.util.Locale.ROOT)
                    + "\",\"elapsedMs\":" + elapsedMs + ",\"samples\":" + samples
                    + ",\"lastState\":" + state + ",\"shellPhase\":"
                    + (shellPhase == null ? "null" : "\"" + shellPhase.name().toLowerCase(java.util.Locale.ROOT) + "\"") + "}";
        }
    }

    static void prepare(String component, Shell shell, BooleanSupplier connected,
            LongSupplier clock, Sleeper sleeper) throws SetupFailure {
        String stage = "accessibility_disable";
        Point point = Point.DISABLE_WRITE;
        Snapshot lastState = null;
        int samples = 0;
        final long started = clock.getAsLong(), deadline = started + 20_000;
        try {
            canonical(component);
            require(commandBody(shell.execute("settings put secure enabled_accessibility_services null",
                    commandBudget(clock, deadline))).isEmpty());
            while (true) {
                long budget = commandBudget(clock, deadline);
                point = Point.CACHED_READ;
                Reply reply = shell.execute("dumpsys -t 2 accessibility", budget);
                point = Point.CACHED_PARSE;
                State state = cachedState(reply, component);
                remaining(clock, deadline);
                boolean localConnected = connected.getAsBoolean();
                lastState = new Snapshot(state.enabled, state.binding, state.crashed, localConnected);
                samples = Math.min(200, samples + 1);
                point = Point.DISABLE_ACK_WAIT;
                if (state.disabled() && !localConnected) break;
                sleeper.sleep(Math.min(100, remaining(clock, deadline)));
            }
            stage = "accessibility_enable";
            point = Point.ENABLE_WRITE;
            require(commandBody(shell.execute("settings put secure enabled_accessibility_services " + component,
                    commandBudget(clock, deadline))).isEmpty());
            require(commandBody(shell.execute("settings put secure accessibility_enabled 1",
                    commandBudget(clock, deadline))).isEmpty());
            stage = "accessibility_connect";
            point = Point.CONNECT_WAIT;
            while (!connected.getAsBoolean()) sleeper.sleep(Math.min(100, remaining(clock, deadline)));
            remaining(clock, deadline);
        } catch (Exception failure) {
            if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new SetupFailure(stage, point, failure, clock.getAsLong() - started, samples, lastState);
        }
    }

    private static long commandBudget(LongSupplier clock, long deadline) {
        return Math.min(2_000, remaining(clock, deadline));
    }
    private static long remaining(LongSupplier clock, long deadline) {
        long value = deadline - clock.getAsLong();
        if (value <= 0) throw new BudgetExpired();
        return value;
    }

    static String script(String command) {
        require(command.equals("dumpsys -t 2 accessibility")
                || command.equals("settings put secure enabled_accessibility_services null")
                || command.equals("settings put secure accessibility_enabled 1")
                || command.startsWith("settings put secure enabled_accessibility_services ")
                    && canonical(command.substring("settings put secure enabled_accessibility_services ".length())) != null);
        // Written to /system/bin/sh stdin; Runtime.exec does not interpret quoted shell argv.
        return command + "\nphone_qa_command_status=$?\nprintf '\\n" + MARKER
                + "%s\\n' \"$phone_qa_command_status\"\nexit \"$phone_qa_command_status\"\n";
    }

    static String commandBody(Reply reply) {
        require(reply != null && reply.stdout != null && reply.stderr != null && reply.stderr.isEmpty());
        require(reply.stdout.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES);
        String text = reply.stdout.replace("\r\r\n", "\n").replace("\r\n", "\n");
        require(text.indexOf('\r') < 0 && text.indexOf('\0') < 0);
        String terminal = "\n" + MARKER + "0\n";
        require(text.endsWith(terminal) && text.indexOf(MARKER) == text.lastIndexOf(MARKER));
        return text.substring(0, text.length() - terminal.length());
    }

    static State cachedState(Reply reply, String component) {
        String target = canonical(component);
        String text = commandBody(reply);
        require(text.endsWith("\n") && !text.contains("DUMP TIMEOUT")
                && !text.contains("Security exception:") && !text.contains("Exception occurred while dumping:")
                && !text.contains("Permission Denial:") && !text.contains("*** SERVICE "));
        String[] lines = text.substring(0, text.length() - 1).split("\n", -1);
        require(lines.length >= 12 && lines[0].equals("ACCESSIBILITY MANAGER (dumpsys accessibility)"));
        int headers = 0, currentUsers = 0;
        List<Integer> users = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].equals("ACCESSIBILITY MANAGER (dumpsys accessibility)")) headers++;
            if (lines[i].startsWith("currentUserId=")) { require(lines[i].equals("currentUserId=0")); currentUsers++; }
            if (lines[i].equals("User state[")) users.add(i);
        }
        require(headers == 1 && currentUsers == 1 && !users.isEmpty());
        int footer = lines.length - 3;
        require(lines[footer].equals("Accessibility Display Listener:"));
        require(lines[footer + 1].matches("    SystemUI uid: (0|[1-9][0-9]{0,8})"));
        Matcher displays = DISPLAYS.matcher(lines[footer + 2]);
        require(displays.matches());
        int count = Integer.parseInt(displays.group(1));
        require(displays.group(2).equals(count == 1 ? "" : "s"));
        String[] ids = displays.group(3).isEmpty() ? new String[0] : displays.group(3).split(", ", -1);
        require(count == ids.length && new HashSet<>(List.of(ids)).size() == count);
        for (String id : ids) require(id.matches("0|[1-9][0-9]{0,8}"));
        Set<Integer> seen = new HashSet<>();
        State found = null;
        for (int userIndex = 0; userIndex < users.size(); userIndex++) {
            int start = users.get(userIndex);
            int end = userIndex + 1 < users.size() ? users.get(userIndex + 1) : footer;
            require(start + 1 < end);
            Matcher attributes = ATTRIBUTES.matcher(lines[start + 1]);
            require(attributes.matches());
            int id = Integer.parseInt(attributes.group(1));
            require(seen.add(id));
            if (id != 0) continue;
            Boolean enabled = null, binding = null, crashed = null;
            int enabledAt = -1, bindingAt = -1, crashedAt = -1, clientAt = -1, closingAt = -1;
            for (int i = start + 2; i < end; i++) {
                if (lines[i].startsWith("     Enabled services:")) { require(enabled == null); enabled = contains(lines[i], "Enabled", target); enabledAt = i; }
                if (lines[i].startsWith("     Binding services:")) { require(binding == null); binding = contains(lines[i], "Binding", target); bindingAt = i; }
                if (lines[i].startsWith("     Crashed services:")) { require(crashed == null); crashed = contains(lines[i], "Crashed", target); crashedAt = i; }
                if (lines[i].equals("     Client list info:{")) { require(clientAt < 0); clientAt = i; }
                if (lines[i].equals("          Registered clients:{")) { require(closingAt < 0 && i + 1 < end && lines[i + 1].endsWith("}]")); closingAt = i + 1; }
            }
            require(enabled != null && binding != null && crashed != null
                    && enabledAt + 1 == bindingAt && bindingAt + 1 == crashedAt
                    && clientAt > crashedAt && closingAt > clientAt);
            found = new State(enabled, binding, crashed);
        }
        require(found != null);
        return found;
    }

    private static boolean contains(String line, String field, String target) {
        String prefix = "     " + field + " services:{";
        require(line.startsWith(prefix) && line.endsWith("}"));
        String body = line.substring(prefix.length(), line.length() - 1);
        if (body.isEmpty()) return false;
        Set<String> values = new HashSet<>();
        for (String entry : body.split(", ", -1)) {
            require(entry.startsWith("{") && entry.endsWith("}"));
            require(values.add(canonical(entry.substring(1, entry.length() - 1))));
        }
        return values.contains(target);
    }
    private static String canonical(String value) {
        require(value != null && value.length() <= 512);
        Matcher matcher = COMPONENT.matcher(value);
        require(matcher.matches());
        String pkg = matcher.group(1), name = matcher.group(2);
        return pkg + "/" + (name.startsWith(".") ? pkg + name : name);
    }
    private static void require(boolean condition) {
        if (!condition) throw new IllegalStateException("Invalid disposable accessibility acknowledgement");
    }
}
