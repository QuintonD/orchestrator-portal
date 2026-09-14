# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ATTRIBUTION.md.
"""Host-only protocol checks. Never starts ADB, a device, or a biometric action."""
import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("document_scope_probe", Path(__file__).with_name("document-scope-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def ready(transcript):
    transcript.feed(probe.READY)
    return transcript.feed("INSTRUMENTATION_STATUS_CODE: 2")


class DocumentScopeDriverTest(unittest.TestCase):
    def test_read_only_requires_exact_eleven_assertions_and_no_sensor_marker(self):
        transcript = probe.Transcript("read-only")
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARIES["read-only"])
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)
        self.assertEqual(transcript.ready, 0)
        with self.assertRaises(probe.bio.ProbeFailure):
            probe.Transcript("read-only").feed(probe.READY)

    def test_modes_cannot_accept_each_others_success_protocol(self):
        full = probe.Transcript("full")
        ready(full)
        with self.assertRaises(probe.bio.ProbeFailure):
            full.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARIES["read-only"])
        with self.assertRaises(probe.bio.ProbeFailure):
            probe.Transcript("read-only").feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARY)
        with self.assertRaises(probe.bio.ProbeFailure):
            probe.Transcript("read-only").feed("INSTRUMENTATION_STATUS_CODE: 2")

    def test_source_identity_ignores_gradle_cache_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".gradle").mkdir()
            for name in ("build.gradle", "settings.gradle", "gradle.properties", "app/build.gradle", "fixture/build.gradle",
                         "app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/DocumentScopeProbe.java"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic source\n", encoding="utf-8")
            with patch.object(probe, "ROOT", root), patch.object(probe.bio, "capture", return_value=b"a" * 40 + b"\n"):
                identity = probe.source_facts(123)
            self.assertEqual(identity["gitHead"], "a" * 40)
            self.assertRegex(identity["workingSourcesSha256"], r"^[0-9a-f]{64}$")

    def test_host_failure_records_fixed_stage_without_exception_text(self):
        record = {}
        with patch.object(probe.bio, "capture", side_effect=(b"1\n", b"orchestrator-phone-control-test\nOK\n")), \
                patch.object(probe, "source_facts", side_effect=PermissionError("private directory name")):
            with self.assertRaises(PermissionError):
                probe.run_probe("adb", "emulator-5576", "43caee51-8bf7-44ab-91df-0f7d35f5da26", record)
        self.assertEqual(record["failureStage"], "source_identity")
        self.assertEqual(record["attempts"], 0)
        self.assertNotIn("private", str(record))

    def test_exact_complete_success(self):
        transcript = probe.Transcript()
        self.assertEqual(ready(transcript), "replace")
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARY)
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)

    def test_duplicate_ready_never_authorizes_second_sensor_event(self):
        transcript = probe.Transcript()
        ready(transcript)
        with self.assertRaises(probe.bio.ProbeFailure):
            transcript.feed(probe.READY)

    def test_marker_needs_matching_status_code(self):
        for status in ("INSTRUMENTATION_STATUS_CODE: 1", "INSTRUMENTATION_STATUS_CODE: 3"):
            transcript = probe.Transcript()
            transcript.feed(probe.READY)
            with self.assertRaises(probe.bio.ProbeFailure):
                transcript.feed(status)

    def test_success_requires_exact_assertions_and_terminal(self):
        for text in (probe.SUMMARY.replace("21", "20"), "prefix " + probe.SUMMARY, probe.SUMMARY + " extra"):
            transcript = probe.Transcript()
            ready(transcript)
            with self.assertRaises(probe.bio.ProbeFailure):
                transcript.feed("INSTRUMENTATION_RESULT: stream=" + text)
        transcript = probe.Transcript()
        ready(transcript)
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARY)
        with self.assertRaises(probe.bio.ProbeFailure):
            transcript.finish(0)

    def test_failure_retains_only_fixed_safe_facts(self):
        transcript = probe.Transcript()
        transcript.feed("INSTRUMENTATION_RESULT: phone_qa_failure_stage=document_scope_probe")
        transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 8 assertions: AssertionError: private filename content document_unavailable")
        transcript.feed("INSTRUMENTATION_CODE: 0")
        with self.assertRaises(probe.bio.ProbeFailure):
            transcript.finish(0)
        self.assertEqual(transcript.failure, {"stage": "document_scope_probe", "assertions": 8, "class": "AssertionError", "codes": ["document_unavailable"]})
        self.assertNotIn("private", str(transcript.failure))

    def test_physical_or_unowned_emulator_rejected_before_mutation(self):
        resource_id = "43caee51-8bf7-44ab-91df-0f7d35f5da26"
        with patch.object(probe.bio, "capture") as capture:
            with self.assertRaises(probe.bio.ProbeFailure):
                probe.run_probe("adb", "physical-phone", resource_id, {})
            capture.assert_not_called()
        with patch.object(probe.bio, "capture", side_effect=(b"1\n", b"user-emulator\nOK\n")) as capture:
            with self.assertRaises(probe.bio.ProbeFailure):
                probe.run_probe("adb", "emulator-5576", resource_id, {})
            self.assertEqual(capture.call_count, 2)

    def test_fixture_reference_has_exact_crlf_and_unicode_without_exported_text(self):
        self.assertIn(b"\r\n", probe.EXPECTED)
        self.assertIn("日本語".encode(), probe.EXPECTED)
        self.assertEqual(set(probe.facts(probe.EXPECTED)), {"bytes", "sha256"})


if __name__ == "__main__":
    unittest.main()
