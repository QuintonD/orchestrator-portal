import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryEvidence, recoverySummary, captureWarningCount } from './capture-recovery-evidence.mjs';

const facts = { retryCount: 1, initialError: 'screenshot_internal_error', initialStage: 'awaiting_callback', initialElapsedMs: 5004, totalElapsedMs: 5400 };
test('recovered logical success retains a failed first attempt', () => {
  const receipt = { status: 'observed', result: { captureRecovery: facts } };
  const captureRecovery = recoveryEvidence(receipt, 35);
  assert.notEqual(captureRecovery, facts);
  const result = recoverySummary([{ observed: true }, { observed: true, captureRecovery }, { observed: false, captureRecovery }, { observed: false }]);
  assert.equal(result.observationRequests, 4);
  assert.equal(result.firstAttemptFailures, 3);
  assert.equal(result.recoveryReads, 2);
  assert.equal(result.recoveredRequests, 1);
  assert.equal(result.terminalFailures, 2);
});
test('guard rejection after recovery retains initial callback failure', () => {
  assert.deepEqual(recoveryEvidence({ status: 'rejected', error: { code: 'stale_observation', details: { captureRecovery: facts } } }, 34), facts);
  assert.equal(recoveryEvidence({ status: 'observed', result: {} }, 36), undefined);
});
test('unknown, contradictory, oversized and wrong-platform facts fail evidence validation', () => {
  const invalid = [null, [], { ...facts, secret: 'untrusted' }, { ...facts, retryCount: 2 }, { ...facts, initialError: 'screenshot_secure_window' }, { ...facts, initialStage: 'encoding' }, { ...facts, initialElapsedMs: -1 }, { ...facts, initialElapsedMs: 0.5 }, { ...facts, totalElapsedMs: 60001 }, { ...facts, totalElapsedMs: 5003 }];
  for (const captureRecovery of invalid) assert.throws(() => recoveryEvidence({ status: 'observed', result: { captureRecovery } }, 35));
  for (const sdk of [33, 36, 37]) assert.throws(() => recoveryEvidence({ status: 'observed', result: { captureRecovery: facts } }, sdk));
});
test('capture warning counter exposes only the exact known message and process', () => {
  const expected = 'E/ScreenCapture( 123): ScreenCaptureListenerWrapper consumer not alive.';
  assert.equal(captureWarningCount([expected, expected, 'E/ScreenCapture( 456): ScreenCaptureListenerWrapper consumer not alive.', `private ${expected}`, `${expected} private`, 'E/ScreenCapture( 123): other private error'].join('\n'), 123), 2);
  assert.throws(() => captureWarningCount('x'.repeat(65537), 123));
  assert.throws(() => captureWarningCount(expected, 0));
  assert.throws(() => captureWarningCount(Array(201).fill(expected).join('\n'), 123));
});
