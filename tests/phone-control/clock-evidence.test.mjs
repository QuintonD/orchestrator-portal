import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { CLOCK_SAMPLE_TIMEOUT_MS, CLOCK_SAMPLE_MAX_BYTES, parseDeviceEpochMs, clockEvidence, sampleClock, observationClockEvidence } from './clock-evidence.mjs';

const now = 1789320000000;
const times = { hostStartedAtMs: now, hostFinishedAtMs: now + 25, monotonicStartedMs: 100, monotonicFinishedMs: 125 };
const reply = { stdout: `${now - 1500}\n`, stderr: '', status: 0, signal: null };

test('device date accepts one complete numeric reply with supported ADB line endings', () => {
  for (const end of ['\n', '\r\n', '\r\r\n']) {
    for (const n of [0, now, Number.MAX_SAFE_INTEGER]) assert.equal(parseDeviceEpochMs(`${n}${end}`), n);
  }
});

test('device date rejects ambiguous, truncated, injected and unsafe numeric output', () => {
  for (const output of [undefined, null, 123, Buffer.from(`${now}\n`), '', '\n', `${now}`, ` ${now}\n`, `${now} \n`,
    `0${now}\n`, '-1\n', '1.0\n', '1e3\n', 'NaN\n', 'Infinity\n', '9007199254740992\n', '9'.repeat(200),
    `${now}%3N\n`, `${now}\nprivate-output`, `${now}\n${now}\n`, `${now}\n\n`, `${now}\r\n\r\n`, `${now}\r\r\n\r\r\n`,
    `${now}\u2028\n`, `${now}\u2029\n`, `${now}\0\n`, `${now}\r\r\r\n`]) assert.equal(parseDeviceEpochMs(output), null);
});

test('one command brackets host-ahead and host-behind offsets without granting acceptance', () => {
  assert.deepEqual(clockEvidence(reply, times), {
    status: 'sampled', hostStartedAtMs: now, hostFinishedAtMs: now + 25, roundTripMs: 25,
    deviceEpochMs: now - 1500, hostMinusDeviceLowerMs: 1500, hostMinusDeviceUpperMs: 1525,
  });
  const ahead = clockEvidence({ ...reply, stdout: `${now + 2500}\n` }, times);
  assert.equal(ahead.hostMinusDeviceLowerMs, -2500);
  assert.equal(ahead.hostMinusDeviceUpperMs, -2475);
  assert.equal(ahead.passed, undefined);
});

test('partial success cannot survive nonzero exit, signal, spawn error or stderr', () => {
  const failures = [{ ...reply, status: 1 }, { ...reply, status: null }, { ...reply, signal: 'SIGTERM' },
    { ...reply, error: { code: 'ENOENT', message: 'private command path' } },
    { ...reply, error: { code: 'ENOBUFS', stdout: 'private data' } },
    { ...reply, stderr: 'private error' }, { ...reply, stderr: null }, { ...reply, stdout: `${now}\nprivate` }, null];
  for (const result of failures) {
    const facts = clockEvidence(result, times);
    assert.equal(facts.status, 'unavailable');
    assert.equal(facts.deviceEpochMs, undefined);
    assert.ok(!JSON.stringify(facts).includes('private'));
  }
});

test('elapsed deadline and explicit timeout discard even a canonical successful reply', () => {
  for (const elapsed of [CLOCK_SAMPLE_TIMEOUT_MS, CLOCK_SAMPLE_TIMEOUT_MS + 1, 2000]) {
    const facts = clockEvidence(reply, { ...times, hostFinishedAtMs: now + elapsed, monotonicFinishedMs: 100 + elapsed });
    assert.equal(facts.status, 'unavailable'); assert.equal(facts.reason, 'deadline');
    assert.equal(facts.deviceEpochMs, undefined);
  }
  assert.equal(clockEvidence({ ...reply, error: { code: 'ETIMEDOUT' } }, times).reason, 'deadline');
  assert.equal(clockEvidence(reply, { ...times, hostFinishedAtMs: now + 999, monotonicFinishedMs: 1099 }).status, 'sampled');
});

test('wall-clock jumps are distinguished from elapsed time and retain only timing facts', () => {
  for (const end of [now - 25, now + 500, now + 10000]) {
    const facts = clockEvidence(reply, { ...times, hostFinishedAtMs: end });
    assert.equal(facts.status, 'unavailable'); assert.equal(facts.reason, 'host_clock_changed');
    assert.equal(facts.hostFinishedAtMs, end); assert.equal(facts.roundTripMs, 25);
    assert.equal(facts.deviceEpochMs, undefined);
  }
  assert.equal(clockEvidence(reply, { ...times, hostFinishedAtMs: now - 1, monotonicFinishedMs: 100 }).reason, 'host_clock_changed');
});

test('invalid timing never emits unsafe or unbounded numeric facts', () => {
  for (const changed of [undefined, null, {}, { ...times, hostStartedAtMs: -1 }, { ...times, hostFinishedAtMs: 1.5 },
    { ...times, hostStartedAtMs: Number.MAX_SAFE_INTEGER + 1 }, { ...times, monotonicStartedMs: '100' },
    { ...times, monotonicFinishedMs: NaN }, { ...times, monotonicFinishedMs: Infinity },
    { ...times, monotonicFinishedMs: 99 }, { ...times, monotonicFinishedMs: 60200 }]) {
    assert.deepEqual(clockEvidence(reply, changed), { status: 'unavailable', reason: 'invalid_timing' });
  }
});

test('sampling invokes the read once and never retries failed or late commands', () => {
  for (const scenario of ['success', 'throw', 'timeout']) {
    let calls = 0;
    const wall = [now, now + (scenario === 'timeout' ? 1000 : 25)];
    const mono = [100, scenario === 'timeout' ? 1100 : 125];
    const facts = sampleClock(() => { calls++; if (scenario === 'throw') throw new Error('private failure'); return reply; },
      { wallNow: () => wall.shift(), monotonicNow: () => mono.shift() });
    assert.equal(calls, 1); assert.equal(facts.status, scenario === 'success' ? 'sampled' : 'unavailable');
    assert.ok(!JSON.stringify(facts).includes('private'));
  }
});

test('initial observation timing projects only canonical capture time and its host bracket', () => {
  const facts = observationClockEvidence(new Date(now - 100).toISOString(), times);
  assert.deepEqual(facts, { status: 'sampled', hostStartedAtMs: now, hostFinishedAtMs: now + 25, roundTripMs: 25,
    capturedAtMs: now - 100, hostMinusCaptureLowerMs: 100, hostMinusCaptureUpperMs: 125 });
  for (const value of [null, now, 'private text', '2026-02-31T00:00:00.000Z', '2026-09-13T00:00:00Z',
    new Date(now).toISOString() + '\n', '2026-09-13T00:00:00.000+00:00']) {
    assert.equal(observationClockEvidence(value, times).reason, 'invalid_capture_time');
  }
  assert.equal(observationClockEvidence(new Date(now).toISOString(), { ...times, hostFinishedAtMs: now + 500 }).reason, 'host_clock_changed');
  assert.equal(observationClockEvidence(new Date(now).toISOString(), { ...times, hostFinishedAtMs: now + 60000, monotonicFinishedMs: 60100 }).reason, 'deadline');
});

test('actual integration sampling uses only fixed bounded read argv and cannot change action outcome', async () => {
  const source = await readFile(new URL('./integration.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function sampleDeviceClock(phase) {');
  const end = source.indexOf('\nfunction sampleCaptureWarnings', start);
  assert.ok(start >= 0 && end > start);
  for (const result of [reply, { ...reply, error: { code: 'ETIMEDOUT' } }]) {
    const calls = []; const samples = [];
    const context = vm.createContext({ clockSamples: samples, serial: 'emulator-5576', CLOCK_SAMPLE_TIMEOUT_MS, CLOCK_SAMPLE_MAX_BYTES,
      sampleClock: query => sampleClock(query, { wallNow: (() => { const v = [now, now + 25]; return () => v.shift(); })(), monotonicNow: (() => { const v = [100, 125]; return () => v.shift(); })() }),
      spawnSync: (...args) => { calls.push(args); return result; } });
    vm.runInContext(source.slice(start, end) + '\nsampleDeviceClock("before_cli_fixture_action");', context);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['adb', ['-s', 'emulator-5576', 'shell', 'date', '+%s%3N'], {
      encoding: 'utf8', windowsHide: true, timeout: 1000, maxBuffer: 128, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'],
    }]);
    assert.equal(samples.length, 1); assert.equal(samples[0].phase, 'before_cli_fixture_action');
    assert.equal(samples[0].status, result.error ? 'unavailable' : 'sampled');
  }
  assert.equal((source.match(/sampleDeviceClock\("probe_ready"\)/g) ?? []).length, 1);
  assert.equal((source.match(/sampleDeviceClock\("before_cli_fixture_action"\)/g) ?? []).length, 1);
  assert.match(source, /sampleDeviceClock\("probe_ready"\);\s*await run\(\["init"/);
  assert.match(source, /sampleDeviceClock\("before_cli_fixture_action"\);\s*const acted = await run\(actionArgs\); assert\.equal\(acted\.status, "completed"\)/);
  assert.ok(!source.includes('clockSamples.every') && !source.includes('initialObservationClock.status'));
});
