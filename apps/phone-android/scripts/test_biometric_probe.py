# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ATTRIBUTION.md.
"""Host-only adversarial checks; these tests never invoke ADB or a device."""
import importlib.util
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("biometric_probe", Path(__file__).with_name("biometric-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def readiness(transcript, value="PHONE_READINESS_RESULT 1 ready 0"):
    transcript.feed("INSTRUMENTATION_STATUS: stream=" + value)
    return transcript.feed("INSTRUMENTATION_STATUS_CODE: 3")


def sensor_dump(request=7, state=2, owner=probe.APP):
    return ("Dump of BiometricScheduler BiometricScheduler\n"
            "Current operation: {[41] com.android.server.biometrics.sensors.fingerprint.aidl."
            f"FingerprintAuthenticationClient, proto=3, owner={owner}, cookie=987, requestId={request}, userId=0}}, State: {state}\n"
            "Pending operations: 0\n").encode("ascii")


class FakeClock:
    now = 100.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class BiometricHarnessTest(unittest.TestCase):
    def test_sensor_readiness_needs_live_owned_started_operation(self):
        active = sensor_dump()
        self.assertEqual(probe.started_fingerprint_request(active), 7)
        self.assertEqual(probe.started_fingerprint_request(active.replace(b".aidl.", b".hidl.")), 7)
        for output in (
                sensor_dump(state=4), sensor_dump(state=3), sensor_dump(state=5), sensor_dump(state=0),
                sensor_dump(owner="com.android.settings"), sensor_dump(owner=probe.APP + ".lookalike"),
                sensor_dump(request=-1), active.replace(b"cookie=987", b"cookie=0"),
                active.replace(b"userId=0", b"userId=10"), active.replace(b"Current operation:", b"Recent operation:"),
                active.replace(b"FingerprintAuthenticationClient", b"FingerprintEnrollClient"),
                active.replace(b"Current operation:", b"Historical log Current operation:"),
                active + b"Current operation: null\n", active + active,
                b"Current operation: null\n#7 authEndedFor(wasSuccessful=true)\n",
                active.replace(b"State: 2\n", b"State: 2 extra\n"),
                active.replace(b"Current operation: {", b"Current operation: {\n")):
            with self.subTest(output=output):
                self.assertIsNone(probe.started_fingerprint_request(output))

    def test_sensor_waits_through_cookie_and_requires_stable_started_request(self):
        clock = FakeClock()
        used = set()
        with patch.object(probe.time, "monotonic", clock.monotonic), patch.object(probe.time, "sleep", clock.sleep), \
                patch.object(probe, "capture", side_effect=[sensor_dump(state=4), sensor_dump(), sensor_dump(state=3), sensor_dump(8), sensor_dump(8)]) as reads:
            polls, elapsed = probe.wait_for_sensor(["adb", "-s", "emulator-5570"], 120, used)
        self.assertEqual((polls, used), (5, {8}))
        self.assertGreaterEqual(elapsed, 599)
        for call in reads.call_args_list:
            self.assertEqual(call.args[0][-3:], ["shell", "dumpsys", "fingerprint"])
            self.assertLessEqual(call.args[1], 108)
            self.assertEqual(call.kwargs["cap"], 16384)

    def test_sensor_timeout_and_reused_request_never_inject_input(self):
        for output, used, expected in ((sensor_dump(state=4), set(), "sensor_not_ready"),
                                       (sensor_dump(owner="com.android.settings"), set(), "sensor_not_ready"),
                                       (sensor_dump(), {7}, "sensor_request_reused")):
            with self.subTest(expected=expected):
                clock = FakeClock()
                with patch.object(probe.time, "monotonic", clock.monotonic), patch.object(probe.time, "sleep", clock.sleep), \
                        patch.object(probe, "capture", return_value=output) as reads:
                    with self.assertRaisesRegex(probe.ProbeFailure, expected):
                        probe.wait_for_sensor(["adb"], 100.4, used)
                self.assertLessEqual(clock.now, 100.4)
                self.assertTrue(all(call.args[0][-3:] == ["shell", "dumpsys", "fingerprint"] for call in reads.call_args_list))

    def test_sensor_adb_deadline_failure_is_not_retried(self):
        with patch.object(probe, "capture", side_effect=probe.ProbeFailure("deadline_exceeded")) as reads:
            with self.assertRaisesRegex(probe.ProbeFailure, "deadline_exceeded"):
                probe.wait_for_sensor(["adb"], time.monotonic() + 10, set())
        reads.assert_called_once()

    def test_run_injects_once_only_after_sensor_is_ready(self):
        child = Mock()
        emitted = []

        def feed_ready(_child, _deadline, _transcript, on_ready):
            on_ready("key-rotation-recovery")

        with patch.object(probe, "BoundedProcess", return_value=child), patch.object(probe, "parse_chunks", side_effect=feed_ready), \
                patch.object(probe, "capture", side_effect=[b"1", b"orchestrator-phone-control-qa\nOK", b"OK", b""]) as adb, \
                patch.object(probe, "wait_for_sensor", return_value=(4, 1600)) as sensor:
            probe.run_probe("adb", "emulator-5570", "key-rotation", emitted.append)
        sensor.assert_called_once()
        self.assertEqual(sum(call.args[0][-4:] == ["emu", "finger", "touch", "1"] for call in adb.call_args_list), 1)
        self.assertIn("PHONE_BIOMETRIC_SENSOR_READY key-rotation-recovery 4 1600", emitted)
        child.close.assert_called_once()

    def test_run_does_not_inject_on_failed_sensor_readiness_and_still_cleans_up(self):
        child = Mock()

        def feed_ready(_child, _deadline, _transcript, on_ready):
            on_ready("key-rotation-recovery")

        with patch.object(probe, "BoundedProcess", return_value=child), patch.object(probe, "parse_chunks", side_effect=feed_ready), \
                patch.object(probe, "capture", side_effect=[b"1", b"orchestrator-phone-control-qa\nOK", b""]) as adb, \
                patch.object(probe, "wait_for_sensor", side_effect=probe.ProbeFailure("sensor_not_ready")):
            with self.assertRaisesRegex(probe.ProbeFailure, "sensor_not_ready"):
                probe.run_probe("adb", "emulator-5570", "key-rotation", lambda _: None)
        self.assertFalse(any("finger" in call.args[0] for call in adb.call_args_list))
        self.assertEqual(adb.call_args_list[-1].args[0][-3:], ["am", "force-stop", probe.APP])
        child.close.assert_called_once()

    def test_unrelated_or_lookalike_devices_are_rejected(self):
        self.assertTrue(probe.serial_allowed("emulator-5570"))
        for value in ("phone123", "emulator-5570\n", "emulator-5570 extra", "emulator-65536", "emulator-05570", "emulator-5571"):
            self.assertFalse(probe.serial_allowed(value), value)
        self.assertTrue(probe.avd_allowed(b"orchestrator-phone-control-20260912\r\nOK\r\n"))
        self.assertTrue(probe.avd_allowed(b"orchestrator-phone-control-20260912\r\r\nOK\r\r\n"))
        for output in (b"other-orchestrator-phone-control\nOK", b"orchestrator-phone-controller\nOK", b"error: orchestrator-phone-control\nOK", b"orchestrator-phone-control\nERROR"):
            self.assertFalse(probe.avd_allowed(output))

    def test_only_complete_matching_framework_result_succeeds(self):
        transcript = probe.Transcript("key-rotation")
        readiness(transcript)
        self.assertIsNone(transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY key-rotation-recovery"))
        self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), "key-rotation-recovery")
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("key-rotation"))
        with self.assertRaisesRegex(probe.ProbeFailure, "incomplete_test_protocol"):
            transcript.finish(0)
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)
        with self.assertRaisesRegex(probe.ProbeFailure, "instrumentation_adb_failed"):
            transcript.finish(1)

    def test_pass_substrings_wrong_modes_and_framework_failures_do_not_pass(self):
        transcript = probe.Transcript("layout")
        transcript.feed("private message PASS: 21 whatever")
        with self.assertRaises(probe.ProbeFailure):
            transcript.finish(0)
        with self.assertRaises(probe.ProbeFailure):
            transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("full"))
        readiness(transcript)
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("layout"))
        with self.assertRaises(probe.ProbeFailure):
            transcript.feed("INSTRUMENTATION_CODE: 0")

    def test_inflight_mode_requires_its_own_marker_and_exact_summary(self):
        transcript = probe.Transcript("inflight-stop")
        readiness(transcript)
        transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY inflight-stop")
        self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), "inflight-stop")
        transcript.feed("INSTRUMENTATION_RESULT: stream=PASS: 13 biometric workflow assertions (emulated sensor; not hardware consent proof).")
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)

    def test_home_lifecycle_requires_all_seven_authentications_and_exact_count(self):
        transcript = probe.Transcript("home-lifecycle")
        readiness(transcript)
        markers = ("home-content", "home-strict-tap", "home-strict-back", "home-secure", "home-password", "home-revoked-app", "home-revoked-operation")
        for marker in markers[:-1]:
            transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY " + marker)
            self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), marker)
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_result_summary"):
            transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("home-lifecycle"))
        transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY " + markers[-1])
        self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), markers[-1])
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_result_summary"):
            transcript.feed("INSTRUMENTATION_RESULT: stream=PASS: 36 biometric workflow assertions (emulated sensor; not hardware consent proof).")
        transcript.feed("INSTRUMENTATION_RESULT: stream=PASS: 37 biometric workflow assertions (emulated sensor; not hardware consent proof).")
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)

    def test_readiness_refusals_and_recovery_are_emitted_only_as_complete_fixed_records(self):
        emitted = []
        transcript = probe.Transcript("layout", emitted.append)
        first = "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding 7"
        transcript.feed("INSTRUMENTATION_STATUS: stream=" + first)
        self.assertEqual(emitted, [])
        self.assertIsNone(transcript.feed("INSTRUMENTATION_STATUS_CODE: 3"))
        self.assertEqual(emitted, [first])
        second = "PHONE_READINESS_REFUSED 1 2 stale_observation none 0"
        self.assertIsNone(readiness(transcript, second))
        recovered = "PHONE_READINESS_RESULT 1 ready 2"
        self.assertIsNone(readiness(transcript, recovered))
        self.assertIsNone(readiness(transcript, "PHONE_READINESS_RESULT 2 ready 0"))
        self.assertEqual(emitted, [first, second, recovered, "PHONE_READINESS_RESULT 2 ready 0"])
        transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("layout"))
        transcript.feed("INSTRUMENTATION_CODE: -1")
        transcript.finish(0)

    def test_readiness_diagnostics_reject_private_text_invalid_bounds_and_wrong_sequences(self):
        invalid = (
            "PHONE_READINESS_REFUSED 1 1 private_content encoding 7",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed private_stage 7",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding 60001",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding -1",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding 07",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding 7 private content",
            "PHONE_READINESS_REFUSED 1 1 screenshot_geometry_changed encoding 7\nPHONE_BIOMETRIC_READY tap",
            "PHONE_READINESS_REFUSED 1 2 screenshot_geometry_changed encoding 7",
            "PHONE_READINESS_REFUSED 2 1 screenshot_geometry_changed encoding 7",
            "PHONE_READINESS_REFUSED 65 1 screenshot_geometry_changed encoding 7",
            "PHONE_READINESS_RESULT 1 ready 1",
            "PHONE_READINESS_RESULT 1 failed 0",
        )
        for value in invalid:
            with self.subTest(value=value):
                emitted = []
                with self.assertRaisesRegex(probe.ProbeFailure, "invalid_readiness_diagnostic"):
                    readiness(probe.Transcript("layout", emitted.append), value)
                self.assertEqual(emitted, [])

    def test_readiness_cannot_hide_a_refusal_or_turn_eight_refusals_into_success(self):
        transcript = probe.Transcript("layout")
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_result_summary"):
            transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("layout"))
        for attempt in range(1, 9):
            readiness(transcript, f"PHONE_READINESS_REFUSED 1 {attempt} screenshot_geometry_changed encoding 7")
            with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_result_summary"):
                transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("layout"))
        with self.assertRaisesRegex(probe.ProbeFailure, "invalid_readiness_diagnostic"):
            readiness(transcript, "PHONE_READINESS_RESULT 1 ready 8")
        readiness(transcript, "PHONE_READINESS_RESULT 1 failed 8")
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_result_summary"):
            transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.summary("layout"))
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_readiness_diagnostic"):
            readiness(transcript, "PHONE_READINESS_RESULT 2 ready 0")

    def test_readiness_status_never_triggers_a_sensor_or_interleaves_with_one(self):
        transcript = probe.Transcript("key-rotation")
        transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_READINESS_RESULT 1 ready 0")
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_status_code"):
            transcript.feed("INSTRUMENTATION_STATUS_CODE: 2")
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_ready_marker"):
            transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY key-rotation-recovery")
        self.assertIsNone(transcript.feed("INSTRUMENTATION_STATUS_CODE: 3"))
        transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY key-rotation-recovery")
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_readiness_diagnostic"):
            readiness(transcript, "PHONE_READINESS_RESULT 2 ready 0")
        self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), "key-rotation-recovery")

    def test_failure_diagnostics_contain_only_numeric_count_and_fixed_codes(self):
        transcript = probe.Transcript("full")
        with self.assertRaises(probe.ProbeFailure) as failed:
            transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 13 assertions: AssertionError: private fixture contents screenshot_timeout hidden text")
        self.assertEqual(failed.exception.diagnostics, ("PHONE_BIOMETRIC_FAILURE_ASSERTIONS 13", "PHONE_BIOMETRIC_FAILURE_CODE screenshot_timeout"))
        with self.assertRaises(probe.ProbeFailure) as staged:
            transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 13 assertions: AssertionError: screenshot_timeout; captureStage=awaiting_callback; captureElapsedMs=5000 private text")
        self.assertEqual(staged.exception.diagnostics[-2:], ("PHONE_BIOMETRIC_CAPTURE_STAGE awaiting_callback", "PHONE_BIOMETRIC_CAPTURE_ELAPSED_MS 5000"))
        with self.assertRaises(probe.ProbeFailure) as platform:
            transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 12 assertions: AssertionError: screenshot_internal_error; private callback details")
        self.assertEqual(platform.exception.diagnostics[-1], "PHONE_BIOMETRIC_FAILURE_CODE screenshot_internal_error")
        with self.assertRaises(probe.ProbeFailure) as layout:
            transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 12 assertions: AssertionError: Review controls and scroll area stay inside system insets; layoutGeometry=10,0,0,720,42,0 private text")
        self.assertEqual(layout.exception.diagnostics[-2:], ("PHONE_BIOMETRIC_FAILURE_REASON layout_bounds", "PHONE_BIOMETRIC_LAYOUT_GEOMETRY 10,0,0,720,42,0"))
        with self.assertRaises(probe.ProbeFailure) as foreground:
            transcript.feed("INSTRUMENTATION_RESULT: stream=FAIL after 30 assertions: AssertionError: app.launch changed actual foreground as expected private text")
        self.assertEqual(foreground.exception.diagnostics, ("PHONE_BIOMETRIC_FAILURE_ASSERTIONS 30", "PHONE_BIOMETRIC_FAILURE_REASON foreground_timeout"))

    def test_unknown_output_never_becomes_a_sensor_marker(self):
        transcript = probe.Transcript("full")
        for line in ("private text PHONE_BIOMETRIC_READY tap", "RuntimeException: app content", "PASS: anything"):
            self.assertIsNone(transcript.feed(line))
        with self.assertRaisesRegex(probe.ProbeFailure, "unexpected_ready_marker"):
            transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_BIOMETRIC_READY swipe")

    def test_silent_child_and_unterminated_line_cannot_block_deadline(self):
        started = time.monotonic()
        child = probe.BoundedProcess([sys.executable, "-u", "-c", "import sys,time;sys.stdout.write('partial');sys.stdout.flush();time.sleep(30)"])
        try:
            with self.assertRaisesRegex(probe.ProbeFailure, "deadline_exceeded"):
                probe.parse_chunks(child, time.monotonic() + 0.25, probe.Transcript("layout"), lambda _: self.fail("Unexpected marker"))
        finally:
            child.close()
        self.assertIsNotNone(child.process.poll())
        self.assertLess(time.monotonic() - started, 4)

    def test_flooded_output_is_bounded_and_child_reaped(self):
        child = probe.BoundedProcess([sys.executable, "-u", "-c", "import sys,time;sys.stdout.write('x'*1000000);sys.stdout.flush();time.sleep(30)"], output_cap=4096)
        try:
            with self.assertRaisesRegex(probe.ProbeFailure, "output_limit"):
                list(child.read_until(time.monotonic() + 3))
        finally:
            child.close()
        self.assertIsNotNone(child.process.poll())

    def test_failed_native_cleanup_still_reaps_owned_instrumentation_child(self):
        emitted = []
        child = Mock()
        with patch.object(probe, "capture", side_effect=[b"1\n", b"orchestrator-phone-control-qa\nOK\n", probe.ProbeFailure("deadline_exceeded")]) as adb, \
                patch.object(probe, "BoundedProcess", return_value=child), \
                patch.object(probe, "parse_chunks", side_effect=probe.ProbeFailure("deadline_exceeded")):
            with self.assertRaisesRegex(probe.ProbeFailure, "deadline_exceeded"):
                probe.run_probe("unused-adb", "emulator-5570", "layout", emitted.append)
            self.assertEqual(adb.call_args_list[-1].args[0][-3:], ["am", "force-stop", probe.APP])
            child.close.assert_called_once()
        self.assertEqual(emitted, ["PHONE_BIOMETRIC_CLEANUP_FAILED"])


if __name__ == "__main__":
    unittest.main()
