# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ATTRIBUTION.md.
"""One bounded document-scope acceptance attempt on an owned synthetic emulator."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import time

_spec = importlib.util.spec_from_file_location("phone_biometric_driver", Path(__file__).with_name("biometric-probe.py"))
bio = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bio)

FIXTURE = "io.github.quintond.orchestrator.phonefixture.debug"
COUNT = 21
SUMMARY = "PASS: 21 document scope assertions (emulator sensor; synthetic owner-selected document)."
COUNTS = {"full": COUNT, "read-only": 11}
SUMMARIES = {"full": SUMMARY, "read-only": "PASS: 11 document scope read-only assertions (synthetic owner-selected document; no biometric action)."}
READY = "INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_SCOPE_BIOMETRIC_READY replace"
EXPECTED = "Scoped document QA\r\nKeep café and 日本語.\nOne exact owner-reviewed replacement.\n".encode("utf-8")
ORIGINAL = "Synthetic target\r\nKeep café and 日本語.\n".encode("utf-8")
SIBLING = "Synthetic sibling\r\nKeep café and 日本語.\n".encode("utf-8")
ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def facts(data):
    return {"bytes": len(data), "sha256": sha(data)}


class Transcript:
    """Exactly one READY/status pair, exact assertion summary, and terminal success."""
    def __init__(self, mode="full"):
        if mode not in COUNTS:
            raise bio.ProbeFailure("invalid_probe_mode")
        self.mode = mode
        self.expected_ready = 1 if mode == "full" else 0
        self.pending = False
        self.ready = 0
        self.passed = False
        self.terminal = False
        self.failure = {}

    def feed(self, line):
        if len(line) > 4096:
            raise bio.ProbeFailure("output_line_limit")
        if not line:
            return None
        if self.terminal and line.startswith("INSTRUMENTATION_"):
            raise bio.ProbeFailure("data_after_terminal")
        if line == READY:
            if not self.expected_ready or self.pending or self.ready or self.passed or self.failure:
                raise bio.ProbeFailure("unexpected_ready_marker")
            self.pending = True
        elif line.startswith("INSTRUMENTATION_STATUS_CODE:"):
            if line != "INSTRUMENTATION_STATUS_CODE: 2" or not self.pending:
                raise bio.ProbeFailure("unexpected_status_code")
            self.pending = False
            self.ready = 1
            return "replace"
        elif line.startswith("INSTRUMENTATION_STATUS:"):
            raise bio.ProbeFailure("unexpected_status_marker")
        elif line.startswith("INSTRUMENTATION_RESULT: phone_qa_failure_stage="):
            stage = line.split("=", 1)[1]
            if stage not in bio.FAILURE_STAGES | {"document_scope_probe"} or "stage" in self.failure or self.passed or self.pending:
                raise bio.ProbeFailure("invalid_failure_metadata")
            self.failure["stage"] = stage
        elif line.startswith("INSTRUMENTATION_RESULT: phone_qa_"):
            # Other native diagnostics may contain contextual values; discard them.
            if not self.failure or self.passed:
                raise bio.ProbeFailure("unexpected_failure_metadata")
        elif line.startswith("INSTRUMENTATION_RESULT: stream="):
            if line == "INSTRUMENTATION_RESULT: stream=" + SUMMARIES[self.mode]:
                if self.pending or self.ready != self.expected_ready or self.passed or self.failure:
                    raise bio.ProbeFailure("unexpected_result_summary")
                self.passed = True
            else:
                match = re.fullmatch(r"INSTRUMENTATION_RESULT: stream=FAIL after ([0-9]{1,2}) assertions: ([A-Za-z]+): (.*)", line)
                if not match or int(match[1]) > COUNTS[self.mode] or self.passed or "assertions" in self.failure:
                    raise bio.ProbeFailure("unexpected_result_summary")
                self.failure["assertions"] = int(match[1])
                self.failure["class"] = match[2] if match[2] in bio.FAILURE_CLASSES else "Error"
                self.failure["codes"] = [code for code in (
                    "forbidden", "invalid_request", "document_unavailable", "unsupported_document", "stale_document",
                    "consent_denied", "consent_unavailable", "deadline_expired", "unknown_action_state", "busy")
                    if re.search(r"\b" + code + r"\b", match[3])]
        elif line.startswith("INSTRUMENTATION_CODE:"):
            expected = "INSTRUMENTATION_CODE: 0" if self.failure else "INSTRUMENTATION_CODE: -1"
            if line != expected or self.pending or (not self.passed and "assertions" not in self.failure):
                raise bio.ProbeFailure("framework_failed")
            self.terminal = True
        elif line.startswith(("INSTRUMENTATION_", "FAIL:", "Error:")):
            raise bio.ProbeFailure("unexpected_protocol_line")
        return None

    def attach_failure(self, error):
        return error

    def finish(self, returncode):
        if returncode != 0:
            raise bio.ProbeFailure("instrumentation_adb_failed")
        if self.failure:
            raise bio.ProbeFailure("native_probe_failed")
        if not self.terminal or not self.passed or self.pending or self.ready != self.expected_ready:
            raise bio.ProbeFailure("incomplete_test_protocol")


def source_facts(deadline):
    files = [path for path in ROOT.glob("*.gradle") if path.is_file()]
    files.append(ROOT / "gradle.properties")
    for directory in (ROOT / "app/src", ROOT / "fixture/src", ROOT / "scripts"):
        files.extend(path for path in directory.rglob("*") if path.is_file() and path.suffix in {".java", ".xml", ".py"})
    files.extend((ROOT / "app/build.gradle", ROOT / "fixture/build.gradle"))
    digest = hashlib.sha256()
    for path in sorted(set(files)):
        digest.update(path.relative_to(ROOT).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    commit = bio.capture(["git", "-C", str(ROOT), "rev-parse", "HEAD"], min(deadline, time.monotonic() + 5)).decode("ascii").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise bio.ProbeFailure("source_identity_unavailable")
    return {"gitHead": commit, "workingSourcesSha256": digest.hexdigest(), "driverSha256": sha(Path(__file__).read_bytes()),
            "probeSha256": sha((ROOT / "app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/DocumentScopeProbe.java").read_bytes())}


def installed_apks(prefix, deadline):
    paths = {
        bio.APP: ROOT / "app/build/outputs/apk/debug/app-debug.apk",
        bio.APP + ".test": ROOT / "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
        FIXTURE: ROOT / "fixture/build/outputs/apk/debug/fixture-debug.apk",
    }
    results = {}
    for package, local in paths.items():
        output = bio.capture(prefix + ["shell", "pm", "path", package], min(deadline, time.monotonic() + 5)).decode("ascii").strip()
        if not re.fullmatch(r"package:/data/app/[A-Za-z0-9_+=~/.-]+/base\.apk", output):
            raise bio.ProbeFailure("unexpected_installed_apk_path")
        remote = output[len("package:"):]
        checked = bio.capture(prefix + ["shell", "sha256sum", remote], min(deadline, time.monotonic() + 5)).decode("ascii").strip()
        expected = sha(local.read_bytes())
        if checked != expected + "  " + remote:
            raise bio.ProbeFailure("installed_apk_mismatch")
        results[package] = {"sha256": expected, "matchesLocalBuild": True}
    return results


def snapshot(prefix, deadline):
    return {name: bio.capture(prefix + ["exec-out", "run-as", FIXTURE, "cat", "files/scope-" + name + ".txt"],
                              min(deadline, time.monotonic() + 5), cap=8193) for name in ("target", "sibling")}


def run_probe(adb, serial, resource_id, record, mode="full"):
    deadline = time.monotonic() + 120
    if not bio.serial_allowed(serial) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", resource_id):
        raise bio.ProbeFailure("invalid_emulator_or_resource")
    prefix = [adb, "-s", serial]
    child = None
    owned = False
    attempted = False
    transcript = Transcript(mode)
    record.update({"mode": mode, "attempts": 0, "sensorEventsAttempted": 0, "timeoutSeconds": 120, "resourceIdSha256": sha(resource_id.encode())})
    try:
        record["stage"] = "emulator_identity"
        qemu = bio.capture(prefix + ["shell", "getprop", "ro.kernel.qemu"], min(deadline, time.monotonic() + 5))
        avd = bio.capture(prefix + ["emu", "avd", "name"], min(deadline, time.monotonic() + 5))
        if qemu.strip() != b"1" or not bio.avd_allowed(avd):
            raise bio.ProbeFailure("dedicated_emulator_required")
        owned = True
        record["emulator"] = {"serial": serial, "avd": avd.decode("ascii").splitlines()[0].strip()}
        record["stage"] = "source_identity"
        record["source"] = source_facts(deadline)
        record["stage"] = "installed_apk_identity"
        record["apks"] = installed_apks(prefix, deadline)
        record["stage"] = "fixture_before"
        before = snapshot(prefix, deadline)
        record["before"] = {name: facts(data) for name, data in before.items()}
        if before["target"] not in (ORIGINAL, EXPECTED) or before["sibling"] != SIBLING:
            raise bio.ProbeFailure("unexpected_synthetic_fixture_bytes")
        record["stage"] = "instrumentation"
        mode_arguments = ["-e", "probeMode", "document-read-only"] if mode == "read-only" else []
        child = bio.BoundedProcess(prefix + ["shell", "am", "instrument", "-w", "-r", "-e", "documentScopeResourceId", resource_id] + mode_arguments + [bio.RUNNER])
        attempted = True
        record["attempts"] = 1
        used = set()

        def finger(marker):
            if mode != "full" or marker != "replace" or record["sensorEventsAttempted"]:
                raise bio.ProbeFailure("unexpected_sensor_request")
            print("PHONE_DOCUMENT_SCOPE_BIOMETRIC_READY replace", flush=True)
            record["stage"] = "sensor_readiness"
            polls, elapsed = bio.wait_for_sensor(prefix, deadline, used)
            record["sensorReadiness"] = {"polls": polls, "elapsedMs": elapsed, "uniqueRequests": len(used)}
            record["sensorEventsAttempted"] = 1
            record["stage"] = "sensor_input"
            bio.capture(prefix + ["emu", "finger", "touch", "1"], min(deadline, time.monotonic() + 5))
            print("PHONE_DOCUMENT_SCOPE_SENSOR_SENT replace", flush=True)
            record["stage"] = "instrumentation"

        bio.parse_chunks(child, deadline, transcript, finger)
        record["stage"] = "fixture_after"
        after = snapshot(prefix, deadline)
        record["after"] = {name: facts(data) for name, data in after.items()}
        target_check = "targetMatchesAuthorizedReplacement" if mode == "full" else "targetUnchanged"
        record[target_check] = after["target"] == (EXPECTED if mode == "full" else before["target"])
        record["siblingUnchanged"] = after["sibling"] == before["sibling"]
        if not record[target_check] or not record["siblingUnchanged"] or record["sensorEventsAttempted"] != transcript.expected_ready:
            raise bio.ProbeFailure("independent_document_verification_failed")
        record["assertions"] = COUNTS[mode]
        record["stage"] = "completed"
    except BaseException:
        record["failureStage"] = record.get("stage", "configuration")
        raise
    finally:
        record["protocol"] = {"readyMarkers": transcript.ready, "summarySeen": transcript.passed, "terminalSeen": transcript.terminal,
                              "failure": transcript.failure}
        cleanup_failed = False
        if child is not None:
            try:
                child.close()
            except (OSError, ValueError, subprocess.SubprocessError):
                cleanup_failed = True
        if owned and attempted:
            try:
                bio.capture(prefix + ["shell", "am", "force-stop", bio.APP], time.monotonic() + 5)
                if "after" not in record:
                    record["afterFailure"] = {name: facts(data) for name, data in snapshot(prefix, time.monotonic() + 10).items()}
            except (bio.ProbeFailure, OSError, ValueError, subprocess.SubprocessError):
                cleanup_failed = True
        record["cleanupPassed"] = not cleanup_failed
        if cleanup_failed:
            record["cleanupFailure"] = "owned_companion_cleanup_or_evidence_unavailable"
            if transcript.passed:
                raise bio.ProbeFailure("cleanup_failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--resource-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--mode", choices=tuple(COUNTS), default="full")
    args = parser.parse_args()
    record = {"schemaVersion": 1, "probe": "android.document.v1", "passed": False}
    started = time.monotonic()
    try:
        # Exclusive creation prevents a failed/new attempt from replacing earlier evidence.
        with args.output.open("x", encoding="utf-8") as output:
            try:
                run_probe(args.adb, args.serial, args.resource_id, record, args.mode)
                record["passed"] = True
            except bio.ProbeFailure as failure:
                record["failureCode"] = str(failure)
            except KeyboardInterrupt:
                record["failureCode"] = "interrupted"
            except Exception:
                record["failureCode"] = "host_process_failed"
            record["elapsedMs"] = int((time.monotonic() - started) * 1000)
            json.dump(record, output, indent=2, ensure_ascii=True)
            output.write("\n")
    except (OSError, ValueError):
        print("PHONE_DOCUMENT_SCOPE_FAILED evidence_new_file_required", flush=True)
        return 1
    print(SUMMARIES[args.mode] if record["passed"] else "PHONE_DOCUMENT_SCOPE_FAILED " + record.get("failureCode", "unknown"), flush=True)
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
