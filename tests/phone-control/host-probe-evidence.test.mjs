import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHostProbeEvidence, parsePowerEvidence } from './host-probe-evidence.mjs';

const ready = 'INSTRUMENTATION_STATUS: stream=PHONE_HOST_PROBE_READY (private test token; 180 second maximum)\n';
const terminal = reason => ['end_reason=' + reason, 'elapsed_ms=9241', 'lease_seconds=180', 'interactive=false', 'keyguard_locked=true'].map(field => 'INSTRUMENTATION_RESULT: phone_qa_probe_' + field).join('\n') + '\n';

test('host probe projects bounded native elapsed time, lease and lifecycle facts without claiming success', () => {
  const result = parseHostProbeEvidence(ready + terminal('screen_off'), 0);
  assert.deepEqual(result, { adbExitCode: 0, readyLeaseSeconds: 180, terminalState: 'recorded', endReason: 'screen_off', nativeElapsedMs: 9241, leaseSeconds: 180, interactive: false, keyguardLocked: true });
  assert.equal(result.passed, undefined);
  assert.deepEqual(parseHostProbeEvidence((ready + terminal('screen_off')).replaceAll('\n', '\r\r\n'), 0), result);
});

test('all explicit host and native terminal categories are accepted as diagnostics', () => {
  for (const reason of ['probe_error', 'probe_deadline', 'host_stop_file', 'screen_off', 'accessibility_interrupted', 'accessibility_disconnected', 'accessibility_disabled', 'session_deadline', 'listener_unavailable', 'paired_host_stop', 'owner_stop', 'policy_changed', 'other_session_end']) {
    const result = parseHostProbeEvidence(ready + terminal(reason), 1);
    assert.equal(result.endReason, reason); assert.equal(result.adbExitCode, 1); assert.equal(result.passed, undefined);
  }
  const live = parseHostProbeEvidence((ready + terminal('paired_host_stop')).replaceAll('180', '360'), 0);
  assert.equal(live.leaseSeconds, 360);
});

test('missing terminal output records uncertainty even if unrelated output says PASS', () => {
  assert.deepEqual(parseHostProbeEvidence('PASS: host probe stopped\n', null), { adbExitCode: null, readyLeaseSeconds: null, terminalState: 'missing' });
  assert.equal(parseHostProbeEvidence(ready, 0).terminalState, 'missing');
});

test('unknown, injected, duplicate and contradictory terminal values are not exported', () => {
  const secret = 'synthetic-private-status-or-token';
  const valid = ready + terminal('screen_off');
  for (const output of [
    ready + terminal(secret), ready + terminal('screen_off ' + secret),
    valid.replace('elapsed_ms=9241', 'elapsed_ms=-1'), valid.replace('elapsed_ms=9241', 'elapsed_ms=1.5'),
    valid.replace('elapsed_ms=9241', 'elapsed_ms=86400001'), valid.replace('elapsed_ms=9241', 'elapsed_ms=0009241'),
    valid.replace('interactive=false', 'interactive=' + secret), valid.replace('keyguard_locked=true', 'keyguard_locked=1'),
    valid.replace('lease_seconds=180', 'lease_seconds=360'), valid.replace('lease_seconds=180', 'lease_seconds=600'),
    valid + 'INSTRUMENTATION_RESULT: phone_qa_probe_end_reason=paired_host_stop\n',
    ready + valid, terminal('screen_off'),
  ]) {
    const result = parseHostProbeEvidence(output, 0);
    assert.equal(result.terminalState, 'invalid'); assert.equal(result.endReason, undefined);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('only exact framework fields qualify and arbitrary diagnostic text stays private', () => {
  const secret = 'synthetic-private-screen';
  const result = parseHostProbeEvidence(`arbitrary prefix ${terminal('screen_off')}\nINSTRUMENTATION_RESULT: private_field=${secret}\n`, 0);
  assert.notEqual(result.terminalState, 'recorded'); assert.equal(JSON.stringify(result).includes(secret), false);
  const valid = parseHostProbeEvidence(`${ready}${terminal('paired_host_stop')}arbitrary ${secret}\n`, 0);
  assert.equal(valid.terminalState, 'recorded'); assert.equal(JSON.stringify(valid).includes(secret), false);
});

test('power facts permit only unique exact Android fields and fixed values', () => {
  assert.deepEqual(parsePowerEvidence('  mWakefulness=Awake\n  mIsPowered=true\n'), { wakefulness: 'Awake', powered: true });
  for (const wakefulness of ['Awake', 'Asleep', 'Dozing', 'Dreaming']) assert.equal(parsePowerEvidence(`mWakefulness=${wakefulness}\nmIsPowered=false`).wakefulness, wakefulness);
  assert.deepEqual(parsePowerEvidence('  mWakefulness=Asleep\r\r\n  mIsPowered=false\r\r\n'), { wakefulness: 'Asleep', powered: false });
});

test('power redaction rejects duplicate, prefixed, unknown and coerced values', () => {
  const secret = 'synthetic-private-window';
  for (const text of ['', `mWakefulness=${secret}\nmIsPowered=${secret}`, 'prefix mWakefulness=Awake\nprefix mIsPowered=true', 'mWakefulness=Awake\nmWakefulness=Asleep\nmIsPowered=true\nmIsPowered=false', 'mWakefulness=Awake private\nmIsPowered=1']) {
    const result = parsePowerEvidence(text); assert.deepEqual(result, { wakefulness: null, powered: null });
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.deepEqual(parsePowerEvidence(`mWakefulness=Awake\nmIsPowered=true\nprivate ${secret}`), { wakefulness: 'Awake', powered: true });
});
