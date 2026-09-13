import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { assertHostProbeStopped, parseHostProbeEvidence, parsePowerEvidence } from './host-probe-evidence.mjs';
import { createAdbTransportEvidence } from './adb-transport-evidence.mjs';

const ready = 'INSTRUMENTATION_STATUS: stream=PHONE_HOST_PROBE_READY (private test token; 180 second maximum)\n';
const terminal = reason => ['end_reason=' + reason, 'elapsed_ms=9241', 'lease_seconds=180', 'interactive=false', 'keyguard_locked=true'].map(field => 'INSTRUMENTATION_RESULT: phone_qa_probe_' + field).join('\n') + '\n';
const completed = ready + 'INSTRUMENTATION_STATUS_CODE: 1\n' + terminal('paired_host_stop')
  + 'INSTRUMENTATION_RESULT: stream=PASS: host probe stopped and private test credential removed.\n\nINSTRUMENTATION_CODE: -1\n';

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

test('the Stop gate requires raw metadata and exact successful framework completion', () => {
  assert.equal(assertHostProbeStopped(completed, 0).endReason, 'paired_host_stop');
  assert.equal(assertHostProbeStopped(completed.replaceAll('\n', '\r\r\n'), 0).terminalState, 'recorded');
  const formatted = 'PHONE_HOST_PROBE_READY (private test token; 180 second maximum)\nPASS: host probe stopped and private test credential removed.\n';
  const movedTerminal = 'INSTRUMENTATION_RESULT: phone_qa_probe_elapsed_ms=9241\n';
  for (const invalid of [formatted, completed.replace(terminal('paired_host_stop'), ''), completed.replace('paired_host_stop', 'screen_off'),
    completed.replace(ready, '') + ready, completed.replace(movedTerminal, '') + movedTerminal,
    completed.replace('INSTRUMENTATION_CODE: -1', 'INSTRUMENTATION_CODE: 0'), completed.replace('INSTRUMENTATION_CODE: -1', ''),
    completed + 'INSTRUMENTATION_CODE: -1\n', completed + 'INSTRUMENTATION_FAILED: synthetic-private-error\n',
    completed.replace('STATUS_CODE: 1', 'STATUS_CODE: -1'), completed.replace('stream=PASS:', 'stream=FAIL:'),
    completed.replace('INSTRUMENTATION_STATUS_CODE: 1\n', ''), completed.replace('INSTRUMENTATION_CODE: -1', 'INSTRUMENTATION_RESULT: phone_qa_failure_stage=host_probe\nINSTRUMENTATION_CODE: -1')]) {
    assert.throws(() => assertHostProbeStopped(invalid, 0), error => error.code === 'ERR_ASSERTION' && !JSON.stringify(error).includes('synthetic-private-error'));
  }
  assert.throws(() => assertHostProbeStopped(completed, 1));
  assert.throws(() => assertHostProbeStopped(completed, null));
});

test('the actual integration launch requests raw output and waits for stream drain before the Stop gate', async () => {
  const source = await readFile(new URL('./integration.mjs', import.meta.url), 'utf8');
  const launch = source.slice(source.indexOf('  instrument = start("adb"'), source.indexOf('  stage = "initialize standalone broker"'));
  const stopGate = source.slice(source.indexOf('  stage = "verify raw host probe terminal evidence"'), source.indexOf('\n} catch (error)', source.indexOf('  stage = "verify raw host probe terminal evidence"')));
  assert.ok(launch.length > 0 && stopGate.length > 0);
  const child = new EventEmitter(); child.exitCode = null; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => false;
  const instrumentTransport = createAdbTransportEvidence();
  let args; let terminalChecked = false; let recorded = false;
  const context = vm.createContext({ assert, serial: 'emulator-5574', runner: 'synthetic.test/SmokeTest', nativeOutput: '', instrumentClosed: false, instrumentOutputOverflow: false,
    probeTiming: {}, instrumentTransport, harnessStarted: performance.now(), performance, parseHostProbeEvidence, samplePower() {},
    start(command, argv) { assert.equal(command, 'adb'); args = argv; queueMicrotask(() => child.stdout.emit('data', args.includes('-r') ? ready + 'INSTRUMENTATION_STATUS_CODE: 1\n' : ready.replace('INSTRUMENTATION_STATUS: stream=', ''))); return child; },
    async eventually(check) { await Promise.resolve(); assert.equal(check(), true, 'Required raw readiness or stream close is absent'); },
    assertHostProbeStopped(output, code) { terminalChecked = true; assertHostProbeStopped(output, code); },
    record() { recorded = true; },
  });
  await vm.runInContext(`(async () => {${launch}})()`, context);
  assert.deepEqual(Array.from(args), ['-s', 'emulator-5574', 'shell', 'am', 'instrument', '-w', '-r', '-e', 'hostProbe', 'true', 'synthetic.test/SmokeTest']);
  child.exitCode = 0; child.emit('exit', 0);
  await assert.rejects(vm.runInContext(`(async () => {${stopGate}})()`, context));
  assert.equal(terminalChecked, false); assert.equal(recorded, false);
  child.stdout.emit('data', completed.slice(ready.length + 'INSTRUMENTATION_STATUS_CODE: 1\n'.length)); child.emit('close', 0);
  await vm.runInContext(`(async () => {${stopGate}})()`, context);
  assert.equal(terminalChecked, true); assert.equal(recorded, true);
  // A kill after process exit can fail; dropped late output must still fail the gate.
  terminalChecked = false; recorded = false;
  child.stdout.emit('data', 'x'.repeat(1024 * 1024 + 1));
  await assert.rejects(vm.runInContext(`(async () => {${stopGate}})()`, context));
  assert.equal(terminalChecked, false); assert.equal(recorded, false);
  context.instrumentOutputOverflow = false; child.exitCode = 255;
  child.stderr.emit('data', Buffer.from('adb: error: device offline\n'));
  assert.equal(instrumentTransport.finish().markers.device_offline, 1);
  await assert.rejects(vm.runInContext(`(async () => {${stopGate}})()`, context));
  assert.equal(recorded, false);
});

test('integration transport evidence reports incomplete stderr when failure exits before close', async () => {
  const source = await readFile(new URL('./integration.mjs', import.meta.url), 'utf8');
  const hooks = source.match(/^  instrument\.stderr\.on\("data", .*$/m)[0] + '\n'
    + source.match(/^  instrument\.once\("close", .*$/m)[0];
  const projection = source.match(/adbTransport: (\{ \.\.\.instrumentTransport\.finish\(\), streamClosed: instrumentClosed \})/)[1];
  for (const closeBeforeEvidence of [false, true]) {
    const instrument = new EventEmitter(); instrument.stderr = new EventEmitter();
    const context = vm.createContext({ instrument, instrumentClosed: false, instrumentTransport: createAdbTransportEvidence() });
    vm.runInContext(hooks, context);
    instrument.emit('exit', 255);
    assert.equal(context.instrumentClosed, false);
    if (closeBeforeEvidence) {
      instrument.stderr.emit('data', Buffer.from('adb: error: device offline\n')); instrument.emit('close', 255);
    }
    const result = vm.runInContext(`(${projection})`, context);
    assert.equal(result.streamClosed, closeBeforeEvidence);
    assert.equal(result.markers.device_offline, closeBeforeEvidence ? 1 : 0);
    if (!closeBeforeEvidence) {
      instrument.stderr.emit('data', Buffer.from('adb: error: device offline\n')); instrument.emit('close', 255);
      assert.equal(result.streamClosed, false);
      assert.equal(result.markers.device_offline, 0);
    }
    assert.throws(() => assertHostProbeStopped(completed, 255));
  }
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
