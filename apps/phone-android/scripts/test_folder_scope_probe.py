# SPDX-License-Identifier: AGPL-3.0-only
# Required origin notice: see ATTRIBUTION.md.
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("folder_probe", Path(__file__).with_name("folder-scope-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class FolderProtocolTest(unittest.TestCase):
    def test_every_mode_needs_one_sensor_and_exact_summary(self):
        for mode in probe.COUNTS:
            transcript = probe.Transcript(mode)
            transcript.feed(probe.READY)
            self.assertEqual(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), "create")
            transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARIES[mode])
            transcript.feed("INSTRUMENTATION_CODE: -1")
            transcript.finish(0)
    def test_duplicate_ready_and_missing_sensor_fail_closed(self):
        transcript = probe.Transcript()
        transcript.feed(probe.READY)
        with self.assertRaises(probe.bio.ProbeFailure): transcript.feed(probe.READY)
        with self.assertRaises(probe.bio.ProbeFailure): probe.Transcript().feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARIES["folder-full"])
    def test_wrong_count_is_not_a_pass(self):
        transcript = probe.Transcript()
        transcript.feed(probe.READY)
        transcript.feed("INSTRUMENTATION_STATUS_CODE: 2")
        with self.assertRaises(probe.bio.ProbeFailure): transcript.feed("INSTRUMENTATION_RESULT: stream=" + probe.SUMMARIES["folder-full"].replace("19", "17"))

if __name__ == "__main__": unittest.main()
