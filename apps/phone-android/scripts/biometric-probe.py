# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ATTRIBUTION.md.
"""Bounded driver for real CryptoObject authentication on a disposable emulator."""
import argparse
import os
from pathlib import Path
import subprocess
import time
import queue
import re
import threading

APP = "io.github.quintond.orchestrator.phonecontrol.debug"
RUNNER = APP + ".test/io.github.quintond.orchestrator.phonecontrol.SmokeTest"
COUNTS = {"full": 45, "layout": 21, "key-rotation": 8, "inflight-stop": 13, "semantic": 14, "home-lifecycle": 37}
TIMEOUTS = {"full": 150, "layout": 75, "key-rotation": 60, "inflight-stop": 60, "semantic": 75, "home-lifecycle": 150}
READY = {
    "full": ("tap", "node.click", "longPress", "swipe", "pinch", "type", "key", "back", "app.launch", "stale-content", "stale-semantic"),
    "layout": (),
    "key-rotation": ("key-rotation-recovery",),
    "inflight-stop": ("inflight-stop",),
    "semantic": ("scroll-forward", "scroll-backward"),
    "home-lifecycle": ("home-content", "home-strict-tap", "home-strict-back", "home-secure", "home-password", "home-revoked-app", "home-revoked-operation"),
}
READINESS_CODES = frozenset((
    "stale_observation", "window_unavailable", "screenshot_unavailable", "protected_window", "sensitive_window", "tree_too_large",
    "forbidden", "unauthorized", "session_expired", "protected_app", "app_unavailable", "other", "read_error",
    "screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display",
    "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error",
))


class ProbeFailure(Exception):
    """Only fixed local error codes are ever printed by main()."""
    diagnostics = ()


class BoundedProcess:
    """Chunk reading keeps an incomplete line from blocking deadline checks."""
    def __init__(self, command, output_cap=65536):
        self.process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
        self.output_cap = output_cap
        self.chunks = queue.Queue(maxsize=16)
        self.stopping = threading.Event()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _put(self, item):
        while not self.stopping.is_set():
            try:
                self.chunks.put(item, timeout=0.05)
                return
            except queue.Full:
                pass

    def _read(self):
        try:
            while not self.stopping.is_set():
                chunk = os.read(self.process.stdout.fileno(), 4096)
                if not chunk:
                    break
                self._put(chunk)
        except (OSError, ValueError):
            pass
        finally:
            self._put(None)

    def read_until(self, deadline):
        total = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProbeFailure("deadline_exceeded")
            try:
                chunk = self.chunks.get(timeout=min(0.1, remaining))
            except queue.Empty:
                continue
            if chunk is None:
                try:
                    self.process.wait(timeout=max(0.001, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    raise ProbeFailure("deadline_exceeded") from None
                return
            total += len(chunk)
            if total > self.output_cap:
                raise ProbeFailure("output_limit")
            yield chunk

    def close(self):
        self.stopping.set()
        try:
            if self.process.poll() is None:
                self.process.terminate()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=1)
        finally:
            self.process.stdout.close()
            self.reader.join(timeout=1)


def capture(command, deadline, cap=4096):
    child = BoundedProcess(command, cap)
    try:
        result = b"".join(child.read_until(deadline))
        if child.process.returncode != 0:
            raise ProbeFailure("adb_command_failed")
        return result
    finally:
        child.close()


def serial_allowed(serial):
    match = re.fullmatch(r"emulator-([1-9][0-9]{3,4})", serial)
    return match is not None and 1024 <= int(match[1]) <= 65534 and int(match[1]) % 2 == 0


def avd_allowed(output):
    # The emulator console returns a name and OK; substrings in errors do not count.
    lines = [line.strip() for line in output.decode("ascii", errors="replace").splitlines() if line.strip()]
    return len(lines) == 2 and lines[1].strip() == "OK" and re.fullmatch(
        r"orchestrator-phone-control(?:-[A-Za-z0-9_-]+)?", lines[0].strip()) is not None


def summary(mode):
    return f"PASS: {COUNTS[mode]} biometric workflow assertions (emulated sensor; not hardware consent proof)."


def started_fingerprint_request(output):
    # Only the live scheduler entry counts. Historical auth logs and a pending
    # cookie (state 4) do not mean the sensor can accept the emulated touch.
    operations = [line.strip() for line in output.decode("ascii", errors="replace").splitlines()
                  if line.strip().startswith("Current operation:")]
    if len(operations) != 1:
        return None
    match = re.fullmatch(
        r"Current operation: \{\[[0-9]+\] com\.android\.server\.biometrics\.sensors\.fingerprint\."
        r"(?:aidl|hidl)\.FingerprintAuthenticationClient, proto=[0-9]+, owner=" + re.escape(APP)
        + r", cookie=[1-9][0-9]*, requestId=([1-9][0-9]*), userId=0\}, State: 2", operations[0])
    return int(match[1]) if match else None


def wait_for_sensor(prefix, deadline, used_requests):
    """Bounded read-only readiness checks; this never injects or retries input."""
    started = time.monotonic()
    sensor_deadline = min(deadline, started + 8)
    previous = None
    polls = 0
    while time.monotonic() < sensor_deadline:
        output = capture(prefix + ["shell", "dumpsys", "fingerprint"],
                         min(sensor_deadline, time.monotonic() + 5), cap=16384)
        polls += 1
        request = started_fingerprint_request(output)
        if request in used_requests:
            raise ProbeFailure("sensor_request_reused")
        if time.monotonic() >= sensor_deadline:
            break
        # Two successive live snapshots also exclude a transient start/cancel
        # handoff. Unknown dump formats fail closed when this budget expires.
        if request is not None and request == previous:
            used_requests.add(request)
            return polls, int((time.monotonic() - started) * 1000)
        previous = request
        time.sleep(min(0.15, max(0, sensor_deadline - time.monotonic())))
    raise ProbeFailure("sensor_not_ready")


class Transcript:
    """Accept the selected test's exact protocol, never a PASS substring."""
    def __init__(self, mode, on_diagnostic=lambda _: None):
        self.mode = mode
        self.index = 0
        self.pending = None
        self.summary_seen = False
        self.framework_success = False
        self.on_diagnostic = on_diagnostic
        self.pending_readiness = None
        self.readiness_sequence = 1
        self.readiness_refused = 0
        self.readiness_completed = 0
        self.readiness_failed = False

    def feed(self, line):
        ready_prefix = "INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY "
        readiness_prefix = "INSTRUMENTATION_STATUS: stream=PHONE_READINESS_"
        if line.startswith(readiness_prefix):
            if self.pending is not None or self.pending_readiness is not None or self.summary_seen or self.readiness_failed:
                raise ProbeFailure("unexpected_readiness_diagnostic")
            value = line[len("INSTRUMENTATION_STATUS: stream="):]
            refused = re.fullmatch(r"PHONE_READINESS_REFUSED ([1-9][0-9]?) ([1-8]) ([a-z_]+) (none|queued|awaiting_callback|encoding) (0|[1-9][0-9]{0,4})", value)
            result = re.fullmatch(r"PHONE_READINESS_RESULT ([1-9][0-9]?) (ready|failed) ([0-8])", value)
            if refused:
                sequence, attempt, code, stage, elapsed = refused.groups()
                if int(sequence) != self.readiness_sequence or int(sequence) > 64 or int(attempt) != self.readiness_refused + 1 \
                        or code not in READINESS_CODES or int(elapsed) > 60000:
                    raise ProbeFailure("invalid_readiness_diagnostic")
                self.pending_readiness = (value, "refused")
            elif result:
                sequence, terminal, count = result.groups()
                if int(sequence) != self.readiness_sequence or int(sequence) > 64 or int(count) != self.readiness_refused \
                        or (terminal == "ready" and int(count) == 8) or (terminal == "failed" and int(count) == 0):
                    raise ProbeFailure("invalid_readiness_diagnostic")
                self.pending_readiness = (value, terminal)
            else:
                raise ProbeFailure("invalid_readiness_diagnostic")
        elif line.startswith(ready_prefix):
            value = line[len(ready_prefix):]
            expected = READY[self.mode]
            if self.pending is not None or self.pending_readiness is not None or self.readiness_refused or self.readiness_failed \
                    or self.summary_seen or self.index >= len(expected) or value != expected[self.index]:
                raise ProbeFailure("unexpected_ready_marker")
            self.pending = value
        elif line.startswith("INSTRUMENTATION_STATUS_CODE:"):
            if line == "INSTRUMENTATION_STATUS_CODE: 3" and self.pending_readiness is not None and self.pending is None:
                diagnostic, kind = self.pending_readiness
                self.pending_readiness = None
                if kind == "refused":
                    self.readiness_refused += 1
                else:
                    self.readiness_failed = kind == "failed"
                    self.readiness_completed += 1
                    self.readiness_sequence += 1
                    self.readiness_refused = 0
                self.on_diagnostic(diagnostic)
                return None
            if line != "INSTRUMENTATION_STATUS_CODE: 2" or self.pending is None:
                raise ProbeFailure("unexpected_status_code")
            ready = self.pending
            self.pending = None
            self.index += 1
            return ready
        elif line.startswith("INSTRUMENTATION_RESULT: stream="):
            if line != "INSTRUMENTATION_RESULT: stream=" + summary(self.mode) or self.summary_seen or self.pending is not None \
                    or self.pending_readiness is not None or self.readiness_refused or self.readiness_failed or self.readiness_completed == 0 \
                    or self.index != len(READY[self.mode]):
                failure = ProbeFailure("unexpected_result_summary")
                failed = re.fullmatch(r"INSTRUMENTATION_RESULT: stream=FAIL after ([0-9]{1,3}) assertions: [A-Za-z]+: (.*)", line)
                if failed:
                    diagnostics = ["PHONE_BIOMETRIC_FAILURE_ASSERTIONS " + failed[1]]
                    for code in ("stale_observation", "consent_denied", "consent_unavailable", "deadline_expired", "unknown_action_state", "invalid_request", "protected_window",
                                 "screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied",
                                 "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error"):
                        if re.search(r"\b" + code + r"\b", failed[2]): diagnostics.append("PHONE_BIOMETRIC_FAILURE_CODE " + code)
                    for text, reason in (("Original window did not return after consent", "restore_timeout"), ("Window changed since observation", "preconsent_changed"), ("Target changed immediately before execution", "predispatch_changed"),
                                         ("Native consent Activity did not appear", "consent_surface_absent"), ("Review controls and scroll area stay inside system insets", "layout_bounds"),
                                         ("changed actual foreground as expected", "foreground_timeout"),
                                         ("Missing fixture node Gesture test pad", "fixture_pad_unavailable")):
                        if text in failed[2]: diagnostics.append("PHONE_BIOMETRIC_FAILURE_REASON " + reason)
                    geometry = re.search(r"\blayoutGeometry=([0-9]{1,4}(?:,[0-9]{1,4}){5})\b", failed[2])
                    if geometry: diagnostics.append("PHONE_BIOMETRIC_LAYOUT_GEOMETRY " + geometry[1])
                    stage = re.search(r"\bcaptureStage=(queued|awaiting_callback|encoding)\b", failed[2])
                    if stage: diagnostics.append("PHONE_BIOMETRIC_CAPTURE_STAGE " + stage[1])
                    elapsed = re.search(r"\bcaptureElapsedMs=([0-9]{1,5})\b", failed[2])
                    if elapsed and int(elapsed[1]) <= 60000: diagnostics.append("PHONE_BIOMETRIC_CAPTURE_ELAPSED_MS " + elapsed[1])
                    failure.diagnostics = tuple(diagnostics)
                raise failure
            self.summary_seen = True
        elif line.startswith("INSTRUMENTATION_CODE:"):
            if line != "INSTRUMENTATION_CODE: -1" or self.framework_success or not self.summary_seen:
                raise ProbeFailure("framework_failed")
            self.framework_success = True
        elif line.startswith(("INSTRUMENTATION_FAILED:", "INSTRUMENTATION_ABORTED:", "INSTRUMENTATION_RESULT:")):
            raise ProbeFailure("framework_failed")
        # Unknown lines are bounded and discarded, including exception text.
        return None

    def finish(self, returncode):
        if returncode != 0:
            raise ProbeFailure("instrumentation_adb_failed")
        if not self.summary_seen or not self.framework_success or self.pending is not None or self.pending_readiness is not None \
                or self.readiness_refused or self.readiness_failed or self.readiness_completed == 0 or self.index != len(READY[self.mode]):
            raise ProbeFailure("incomplete_test_protocol")


def parse_chunks(child, deadline, transcript, on_ready):
    pending = b""
    for chunk in child.read_until(deadline):
        pending += chunk
        while b"\n" in pending:
            raw, pending = pending.split(b"\n", 1)
            if len(raw) > 4096:
                raise ProbeFailure("output_line_limit")
            ready = transcript.feed(raw.rstrip(b"\r").decode("utf-8", errors="replace"))
            if ready is not None:
                on_ready(ready)
        if len(pending) > 4096:
            raise ProbeFailure("output_line_limit")
    if pending:
        ready = transcript.feed(pending.rstrip(b"\r").decode("utf-8", errors="replace"))
        if ready is not None:
            on_ready(ready)
    transcript.finish(child.process.returncode)


def run_probe(adb, serial, mode, emit=print):
    if not serial_allowed(serial):
        raise ProbeFailure("emulator_serial_required")
    deadline = time.monotonic() + TIMEOUTS[mode]
    prefix = [adb, "-s", serial]
    verified = False
    child = None
    failure = None
    cleanup_failed = False
    try:
        qemu = capture(prefix + ["shell", "getprop", "ro.kernel.qemu"], min(deadline, time.monotonic() + 5))
        name = capture(prefix + ["emu", "avd", "name"], min(deadline, time.monotonic() + 5))
        if qemu.strip() != b"1" or not avd_allowed(name):
            raise ProbeFailure("dedicated_emulator_required")
        verified = True
        child = BoundedProcess(prefix + ["shell", "am", "instrument", "-w", "-r", "-e", "biometricProbe", "true", "-e", "probeMode", mode, RUNNER])
        used_requests = set()

        def finger(ready):
            emit("PHONE_BIOMETRIC_READY " + ready)
            polls, elapsed = wait_for_sensor(prefix, deadline, used_requests)
            emit(f"PHONE_BIOMETRIC_SENSOR_READY {ready} {polls} {elapsed}")
            if time.monotonic() >= deadline:
                raise ProbeFailure("deadline_exceeded")
            capture(prefix + ["emu", "finger", "touch", "1"], min(deadline, time.monotonic() + 5))

        parse_chunks(child, deadline, Transcript(mode, on_diagnostic=emit), finger)
    except ProbeFailure as rejected:
        failure = rejected
    except (OSError, ValueError, subprocess.SubprocessError):
        failure = ProbeFailure("host_process_failed")
    finally:
        # This independent deadline still runs when the main budget has expired.
        # Do not clear app data/settings or stop the shared ADB server.
        if verified:
            try:
                capture(prefix + ["shell", "am", "force-stop", APP], time.monotonic() + 5)
            except (ProbeFailure, OSError, ValueError, subprocess.SubprocessError):
                cleanup_failed = True
                emit("PHONE_BIOMETRIC_CLEANUP_FAILED")
        if child is not None:
            try:
                child.close()
            except (OSError, ValueError, subprocess.SubprocessError):
                cleanup_failed = True
                emit("PHONE_BIOMETRIC_CHILD_CLEANUP_FAILED")
    if failure is not None:
        raise failure
    if cleanup_failed:
        raise ProbeFailure("cleanup_failed")
    emit(summary(mode))
    emit("INSTRUMENTATION_CODE: -1")
    emit("PHONE_BIOMETRIC_ADB_EXIT: 0")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--mode", choices=tuple(COUNTS), default="full")
    args = parser.parse_args()
    try:
        sdk = os.environ.get("ANDROID_HOME")
        if not sdk:
            raise ProbeFailure("android_home_required")
        adb = str(Path(sdk) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb"))
        run_probe(adb, args.serial, args.mode, emit=lambda line: print(line, flush=True))
        return 0
    except ProbeFailure as failed:
        for diagnostic in failed.diagnostics:
            print(diagnostic, flush=True)
        print("PHONE_BIOMETRIC_FAILED " + str(failed), flush=True)
        return 1
    except KeyboardInterrupt:
        print("PHONE_BIOMETRIC_FAILED interrupted", flush=True)
        return 130
    except Exception:
        print("PHONE_BIOMETRIC_FAILED host_process_failed", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
