// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../../components/phone-control/ATTRIBUTION.md.
import assert from 'node:assert/strict';

// Independent QA projection: never count a recovered read as a first-pass success.
export function recoveryEvidence(receipt, sdk) {
  const value = receipt?.status === 'observed' ? receipt.result?.captureRecovery : receipt?.error?.details?.captureRecovery;
  if (value === undefined) return undefined;
  assert.ok(sdk === 34 || sdk === 35, 'Recovery is limited to Android 14/15');
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), ['initialElapsedMs', 'initialError', 'initialStage', 'retryCount', 'totalElapsedMs']);
  assert.equal(value.retryCount, 1);
  assert.equal(value.initialError, 'screenshot_internal_error');
  assert.equal(value.initialStage, 'awaiting_callback');
  for (const elapsed of [value.initialElapsedMs, value.totalElapsedMs]) assert.ok(Number.isInteger(elapsed) && elapsed >= 0 && elapsed <= 60000);
  assert.ok(value.totalElapsedMs >= value.initialElapsedMs);
  return { ...value };
}

export function recoverySummary(attempts) {
  const retried = attempts.filter((attempt) => attempt.captureRecovery);
  return {
    observationRequests: attempts.length,
    firstAttemptFailures: attempts.filter((attempt) => !attempt.observed || attempt.captureRecovery).length,
    recoveryReads: retried.length,
    recoveredRequests: retried.filter((attempt) => attempt.observed).length,
    terminalFailures: attempts.filter((attempt) => !attempt.observed).length,
    definition: 'One request may perform one bounded native read recovery on Android 14/15. First-attempt failures remain failures; recoveryReads counts fresh read attempts, not dispatched OS captures. No harness or mutation retry.',
  };
}

export function captureWarningCount(output, pid) {
  assert.ok(Number.isInteger(pid) && pid > 0 && pid <= 2147483647);
  assert.ok(typeof output === 'string' && Buffer.byteLength(output) <= 65536);
  const pattern = new RegExp(`^E/ScreenCapture\\( *${pid}\\): ScreenCaptureListenerWrapper consumer not alive\\.$`, 'u');
  const count = output.split(/\r?\n/u).filter((line) => pattern.test(line)).length;
  assert.ok(count <= 200, 'Diagnostic count exceeds its bounded sample');
  return count;
}
