// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
package io.github.quintond.orchestrator.phonecontrol;

/** A changed payload for the disposable replay-conflict check, independent of elapsed time. */
final class NativeReplayFixture {
    static long conflictingDeadline(long original) { return Math.subtractExact(original, 1); }
}
