import test from 'node:test';
import assert from 'node:assert/strict';
import { avdConfiguration, below, diagnosticsSummary, downloadPinnedArchive, emulatorPin, executeCiCommand, graphicsProfile, hasDevices, optionalCleanupQuery, parseOptions, preTestBootCrashLocations, runLifecycle, snapshotReady, verifyPinnedEmulator, waitForEmulatorRetirement, waitForReady } from './android-emulator-ci.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const environment = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', RUNNER_TEMP: '/runner/temp', ANDROID_HOME: '/android/sdk' };
const args = ['--image', '36.1', '--test', 'tests/phone-control/native.mjs', '--test', 'tests/phone-control/integration.mjs'];
const ready = (pid = '201') => ({ boot: '1', qemu: '1', sdk: '36', sdkFull: '36.1', pid, services: { activity: true, package: true, input: true, window: true, settings: true }, settingsReadable: true, packageReadable: true, unlocked: true });
test('CI runner accepts only explicit CI platform, image and test allowlists', () => {
  assert.deepEqual(parseOptions(args, environment, 'linux'), { image: '36.1', tests: ['tests/phone-control/native.mjs', 'tests/phone-control/integration.mjs'], name: 'orchestrator-phone-control-ci-361-12345-2' });
  for (const invalid of [[], [...args, '--test', 'tests/phone-control/native.mjs'], ['--image', '36.2', '--test', 'tests/phone-control/native.mjs'], [...args, '--force', 'true'], ['--image', '36', '--test', '../private.mjs'], ['--image', '36', '--test', 'node -e code']]) assert.throws(() => parseOptions(invalid, environment, 'linux'));
  assert.throws(() => parseOptions(args, environment, 'win32'));
  assert.throws(() => parseOptions(args, { ...environment, GITHUB_ACTIONS: 'false' }, 'linux'));
  assert.throws(() => parseOptions(args, { ...environment, GITHUB_RUN_ID: '../other' }, 'linux'));
  assert.throws(() => parseOptions(args, { ...environment, RUNNER_TEMP: 'relative' }, 'linux'));
});
test('ownership checks exclude parent, sibling-prefix and pre-existing attached devices', () => {
  assert.equal(below('/temp/owned', '/temp/owned/new'), true);
  for (const child of ['/temp/owned', '/temp', '/temp/owned-other/new', '/private']) assert.equal(below('/temp/owned', child), false);
  assert.equal(hasDevices('List of devices attached\n\n'), false);
  assert.equal(hasDevices('List of devices attached\nemulator-5554\toffline\n'), true);
  assert.equal(hasDevices('List of devices attached\nphysical-device\tdevice\n'), true);
});
test('actual AVD hardware configuration contains one authoritative value for every LCD and resource key', () => {
  const text = avdConfiguration('hw.lcd.width=1080\r\nhw.lcd.width = 1440\r\nhw.lcd.height=2400\r\nhw.lcd.density=420\r\nhw.ramSize=4096\r\nhw.cpu.ncore=4\r\nimage.sysdir.1=system-images/android-36.1/google_apis/x86_64/\r\n');
  for (const [key, value] of Object.entries({ 'hw.lcd.width': '720', 'hw.lcd.height': '1600', 'hw.lcd.density': '280', 'hw.ramSize': '2048', 'hw.cpu.ncore': '2' })) assert.deepEqual(text.split('\n').filter((line) => line.startsWith(key + '=')), [`${key}=${value}`]);
  assert.match(text, /image\.sysdir\.1=system-images\/android-36\.1/u);
});
test('only QPR2 selects the explicit local-QA graphics profile', () => {
  assert.deepEqual(graphicsProfile('36.1'), { mode: 'swiftshader', vulkan: 'default', arguments: ['-gpu', 'swiftshader'] });
  for (const image of ['34', '35', '36']) assert.deepEqual(graphicsProfile(image), { mode: 'swangle', vulkan: 'disabled', arguments: ['-gpu', 'swangle', '-feature', '-Vulkan'] });
  for (const image of ['36.0', '36.2', '', undefined, '-gpu host']) assert.throws(() => graphicsProfile(image));
  graphicsProfile('36.1').arguments.push('-feature', '-Vulkan');
  assert.deepEqual(graphicsProfile('36.1').arguments, ['-gpu', 'swiftshader']);
});

test('boot flag alone and wrong service, user, process or API facts never establish readiness', () => {
  assert.equal(snapshotReady(ready(), '36.1', true), true);
  for (const changed of [{ services: { ...ready().services, input: false } }, { services: { ...ready().services, settings: false } }, { settingsReadable: false }, { packageReadable: false }, { qemu: '0' }, { pid: '' }, { pid: '201 202' }, { sdk: '35' }, { unlocked: false }]) assert.equal(snapshotReady({ ...ready(), ...changed }, '36.1', true), false);
  assert.equal(snapshotReady({ ...ready(), sdkFull: '36.0' }, '36.1', true), false);
  assert.equal(snapshotReady({ ...ready(), sdkFull: '' }, '36.1', true), false);
  assert.equal(snapshotReady({ ...ready(), sdk: '34', sdkFull: '' }, '34', true), true);
});
test('readiness waits for required services and three consecutive samples of one system_server', async () => {
  const snapshots = [{ ...ready(), services: { ...ready().services, input: false } }, ready('201'), ready('201'), ready('202'), ready('202'), ready('202')];
  const seen = []; let clock = 0;
  const result = await waitForReady({ probe: async () => snapshots.shift(), image: '36.1', deadline: 20000, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: (sample) => seen.push(sample.stable) });
  assert.equal(result.pid, '202'); assert.deepEqual(seen, [0, 1, 2, 1, 2, 3]); assert.equal(clock, 10000);
});
test('readiness times out and never substitutes retries of tests for missing Android services', async () => {
  let clock = 0; let probes = 0;
  await assert.rejects(waitForReady({ probe: async () => { probes++; return { ...ready(), services: {} }; }, image: '36.1', deadline: 6000, now: () => clock, sleep: async (ms) => { clock += ms; } }), /android_services_readiness_timeout/u);
  assert.equal(probes, 3);
});
test('cleanup waits for stale ADB registration to retire after the owned process exits', async () => {
  let clock = 0; const seen = []; const registrations = [true, true, false];
  const result = await waitForEmulatorRetirement({ probe: async () => ({ processExited: true, adbReadable: true, registered: registrations.shift() }), deadline: 10000, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: (sample) => seen.push(sample.confirmed) });
  assert.deepEqual(seen, [false, false, true]); assert.equal(clock, 2000); assert.equal(result.confirmed, true); assert.equal(result.processExited, true); assert.equal(result.registered, false);
});
test('cleanup cannot substitute disappearance from ADB for owned process exit', async () => {
  let clock = 0; const seen = []; const exits = [false, false, true];
  const result = await waitForEmulatorRetirement({ probe: async () => ({ processExited: exits.shift(), adbReadable: true, registered: false }), deadline: 10000, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: (sample) => seen.push(sample.confirmed) });
  assert.deepEqual(seen, [false, false, true]); assert.equal(clock, 2000); assert.equal(result.confirmed, true);
});
test('cleanup remains unconfirmed at its deadline for a live process, stale ADB entry or unreadable ADB', async () => {
  for (const facts of [{ processExited: false, adbReadable: true, registered: false }, { processExited: true, adbReadable: true, registered: true }, { processExited: true, adbReadable: false, registered: null }, { spawnFailed: true, adbReadable: false, registered: false }, { processExited: true, adbReadable: true, registered: false, queryFailed: true }]) {
    let clock = 0; let probes = 0;
    const result = await waitForEmulatorRetirement({ probe: async () => { probes++; return facts; }, deadline: 3000, now: () => clock, sleep: async (ms) => { clock += ms; } });
    assert.equal(result.confirmed, false); assert.equal(probes, 3); assert.equal(clock, 3000);
  }
});
test('cleanup records only typed component facts and does not treat missing observations as absence', async () => {
  let clock = 0;
  const result = await waitForEmulatorRetirement({ probe: async () => ({ processExited: 'true', adbReadable: true, registered: undefined, private: 'token value' }), deadline: 1000, now: () => clock, sleep: async (ms) => { clock += ms; } });
  assert.deepEqual(result, { confirmed: false, processExited: false, spawnFailed: false, adbReadable: true, registered: null, queryFailed: false, diagnosticsFailed: false });
  assert.equal(JSON.stringify(result).includes('token'), false);
});
test('failed cleanup evidence writes do not stop retirement observation and remain recorded as failures', async () => {
  let clock = 0; let probes = 0;
  const result = await waitForEmulatorRetirement({ probe: async () => ({ processExited: ++probes >= 3, adbReadable: true, registered: false }), deadline: 5000, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: async () => { throw new Error('disk full'); } });
  assert.equal(probes, 3); assert.equal(result.confirmed, true); assert.equal(result.diagnosticsFailed, true); assert.equal(clock, 2000);
});
test('a rejected retirement probe is unreadable and observation continues until both facts are verified', async () => {
  let clock = 0; let probes = 0; const seen = [];
  const result = await waitForEmulatorRetirement({ probe: async () => { if (++probes === 1) throw new Error('private tool failure'); return { processExited: true, adbReadable: true, registered: false }; }, deadline: 5000, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: (sample) => seen.push(sample) });
  assert.equal(probes, 2); assert.equal(result.confirmed, true); assert.equal(seen[0].confirmed, false); assert.equal(seen[0].adbReadable, false); assert.equal(seen[0].registered, null); assert.equal(seen[0].queryFailed, true); assert.equal(JSON.stringify(seen).includes('private'), false);
});
test('persistent rejected retirement probes stay unconfirmed through the bounded wait', async () => {
  let clock = 0; let probes = 0;
  const result = await waitForEmulatorRetirement({ probe: async () => { probes++; throw new Error('spawn unavailable'); }, deadline: 3000, now: () => clock, sleep: async (ms) => { clock += ms; } });
  assert.equal(probes, 3); assert.equal(result.confirmed, false); assert.equal(result.queryFailed, true); assert.equal(result.registered, null);
});
test('optional cleanup ADB query rejection is typed and cannot throw before owned-process fallback', async () => {
  const result = await optionalCleanupQuery(async () => { throw new Error('private spawn or cancellation details'); });
  assert.deepEqual(result, { ok: false, stdout: '', exitCode: null, timedOut: false, queryFailed: true });
  const timeout = await optionalCleanupQuery(async () => ({ ok: false, stdout: '', stderr: 'private', exitCode: null, timedOut: true }));
  assert.equal(timeout.ok, false); assert.equal(timeout.timedOut, true); assert.equal(JSON.stringify(timeout).includes('private'), false);
});
test('lifecycle preserves startup failure, skips input/tests, and still diagnoses and stops', async () => {
  const calls = [];
  await assert.rejects(runLifecycle({ start: async () => calls.push('start'), ready: async () => { calls.push('ready'); throw new Error('services unavailable'); }, configure: async () => calls.push('input'), test: async () => calls.push('test'), diagnose: async () => calls.push('diagnose'), stop: async () => calls.push('stop') }, ['native']), /services unavailable/u);
  assert.deepEqual(calls, ['start', 'ready', 'diagnose', 'stop']);
});
test('lifecycle runs each test once, preserves test failure and cleans up even when diagnostics fail', async () => {
  const calls = [];
  await assert.rejects(runLifecycle({ start: async () => calls.push('start'), ready: async () => calls.push('ready'), configure: async () => calls.push('configure'), test: async (name) => { calls.push(name); throw new Error('test failed'); }, diagnose: async () => { calls.push('diagnose'); throw new Error('diagnostics failed'); }, stop: async () => calls.push('stop') }, ['native', 'integration']), /test failed/u);
  assert.deepEqual(calls, ['start', 'ready', 'configure', 'native', 'diagnose', 'stop']);
});
test('a successful test run fails if owned emulator cleanup cannot be confirmed', async () => {
  await assert.rejects(runLifecycle({ start: async () => {}, ready: async () => {}, configure: async () => {}, test: async () => {}, diagnose: async () => {}, stop: async () => { throw new Error('stop unconfirmed'); } }, ['native', 'integration']), /stop unconfirmed/u);
});
test('cancellation during final diagnostics cannot turn completed tests into a successful CI outcome', async () => {
  const controller = new AbortController(); let stopped = false;
  await assert.rejects(runLifecycle({ start: async () => {}, ready: async () => {}, configure: async () => {}, test: async () => {}, diagnose: async () => controller.abort(), stop: async () => { stopped = true; } }, ['native'], { signal: controller.signal }), /ci_cancelled/u);
  assert.equal(stopped, true);
});
test('diagnostics retain only fixed counters and discard arbitrary log text and credentials', () => {
  const summary = diagnosticsSummary("private-user-token-123 FATAL EXCEPTION\ncmd: Can't find service: input\nOutOfMemoryError: private message\nFatal signal 11\n");
  assert.equal(summary.fatalException, 1); assert.equal(summary.missingInputService, 1); assert.equal(summary.outOfMemory, 1); assert.equal(summary.nativeFatalSignal, 1);
  assert.equal(JSON.stringify(summary).includes('private'), false);
  assert.ok(Object.values(summary).every(Number.isInteger));
});
test('boot crash locations are allowed only before tests during Android readiness or initial configuration', () => {
  const text = 'java.lang.IllegalStateException: private message\n';
  for (const stage of ['wait_android_services', 'configure_ready_android']) {
    const result = preTestBootCrashLocations({ stage, tests: [] }, text);
    assert.equal(result.scope, 'pre_test_android_boot'); assert.deepEqual(result.exceptions, ['java.lang.IllegalStateException']); assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(preTestBootCrashLocations({ stage, tests: [{ passed: false }] }, text), undefined);
  }
  for (const stage of ['preflight', 'extract_pinned_emulator', 'tests/phone-control/native.mjs', 'tests/phone-control/integration.mjs', undefined]) assert.equal(preTestBootCrashLocations({ stage, tests: [] }, text), undefined);
  assert.equal(preTestBootCrashLocations({ stage: 'wait_android_services', tests: null }, text), undefined);
});
const archiveFixture = Buffer.from('synthetic pinned emulator ZIP fixture\n'.repeat(100));
async function archiveServer(t, handler) {
  const directory = await mkdtemp(path.join(tmpdir(), 'phone-ci-archive-test-')); const archive = path.join(directory, 'emulator.zip');
  const server = createServer(handler);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(archive, { force: true }); await rmdir(directory); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { archive, pin: { url: `http://127.0.0.1:${server.address().port}/emulator.zip`, bytes: archiveFixture.length, sha256: createHash('sha256').update(archiveFixture).digest('hex') } };
}
test('pinned archive verifies decoded bytes when HTTP gzip length differs from ZIP length', async (t) => {
  const encoded = gzipSync(archiveFixture); assert.notEqual(encoded.length, archiveFixture.length);
  const { archive, pin } = await archiveServer(t, (_request, response) => { response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': encoded.length }); response.end(encoded); });
  let seen; const result = await downloadPinnedArchive(pin, archive, { onResponse: (metadata) => { seen = metadata; } });
  assert.deepEqual(seen, { httpStatus: 200, contentLength: encoded.length, contentEncoding: 'gzip' });
  assert.equal(result.receivedBytes, pin.bytes); assert.equal(result.sha256, pin.sha256); assert.deepEqual(await readFile(archive), archiveFixture);
});
test('pinned archive accepts chunked HTTP without a length only after exact size and checksum', async (t) => {
  const { archive, pin } = await archiveServer(t, (_request, response) => { response.writeHead(200); response.write(archiveFixture.subarray(0, 10)); response.end(archiveFixture.subarray(10)); });
  const result = await downloadPinnedArchive(pin, archive);
  assert.equal(result.contentLength, null); assert.equal(result.contentEncoding, 'identity'); assert.equal(result.receivedBytes, pin.bytes); assert.deepEqual(await readFile(archive), archiveFixture);
});
test('pinned archive rejects unsuccessful or partial HTTP responses before creating an archive', async (t) => {
  for (const status of [206, 404]) await t.test(String(status), async (child) => {
    const { archive, pin } = await archiveServer(child, (_request, response) => { response.writeHead(status); response.end('private arbitrary error body'); });
    let seen; await assert.rejects(downloadPinnedArchive(pin, archive, { onResponse: (metadata) => { seen = metadata; } }), /pinned_emulator_download_invalid/u);
    assert.equal(seen.httpStatus, status); assert.equal(JSON.stringify(seen).includes('private'), false); await assert.rejects(readFile(archive), { code: 'ENOENT' });
  });
});
test('pinned archive rejects same-sized content with the wrong checksum', async (t) => {
  const wrong = Buffer.from(archiveFixture); wrong[0] ^= 1;
  const { archive, pin } = await archiveServer(t, (_request, response) => response.end(wrong));
  await assert.rejects(downloadPinnedArchive(pin, archive), /pinned_emulator_checksum_mismatch/u);
});
test('pinned archive caps decoded bytes even when gzip transport is smaller than the limit', async (t) => {
  const encoded = gzipSync(Buffer.concat([archiveFixture, Buffer.from('extra')]));
  const { archive, pin } = await archiveServer(t, (_request, response) => { response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': encoded.length }); response.end(encoded); });
  assert.ok(encoded.length < pin.bytes); await assert.rejects(downloadPinnedArchive(pin, archive), /pinned_emulator_download_oversize/u);
  assert.ok((await readFile(archive)).length <= pin.bytes);
});
test('pinned archive rejects a short decoded body despite successful HTTP transfer', async (t) => {
  const { archive, pin } = await archiveServer(t, (_request, response) => response.end(archiveFixture.subarray(0, -1)));
  await assert.rejects(downloadPinnedArchive(pin, archive), /pinned_emulator_checksum_mismatch/u);
});
test('pinned archive cancellation stops an incomplete response and cannot validate it', async (t) => {
  const { archive, pin } = await archiveServer(t, (_request, response) => { response.writeHead(200); response.write(archiveFixture.subarray(0, 10)); });
  await assert.rejects(downloadPinnedArchive(pin, archive, { signal: AbortSignal.timeout(100) }), /abort|timeout/iu);
});
const versionOutput = `Android emulator version ${emulatorPin.version} (build_id ${emulatorPin.build}) (CL:N/A)\n`;
test('version verification selects headless QEMU and still requires the pinned binary identity', async () => {
  const command = async (binary, argv, options) => {
    assert.equal(binary, '/owned/runtime/emulator'); assert.equal(options.allowFailure, true);
    return argv.length === 2 && argv[0] === '-no-window' && argv[1] === '-version' ? { ok: true, exitCode: 0, stdout: versionOutput } : { ok: false, exitCode: 127, stdout: '', stderr: 'GUI-only audio dependency unavailable' };
  };
  assert.deepEqual(await verifyPinnedEmulator('/owned/runtime/emulator', command), { version: emulatorPin.version, build: emulatorPin.build });
  for (const stdout of ['', versionOutput.replace(emulatorPin.version, '36.6.10.0'), versionOutput.replace(emulatorPin.build, '15507666')]) await assert.rejects(verifyPinnedEmulator('/owned/runtime/emulator', async () => ({ ok: true, exitCode: 0, stdout })), /pinned_emulator_version_mismatch/u);
});
test('failed or timed-out version commands cannot pass using their printed version and retain only typed failure facts', async () => {
  for (const result of [{ exitCode: 127, timedOut: false }, { exitCode: null, timedOut: true }, { exitCode: 0, timedOut: true }]) {
    await assert.rejects(verifyPinnedEmulator('/owned/runtime/emulator', async () => ({ ok: false, stdout: versionOutput, stderr: 'private arbitrary error text', ...result })), (error) => {
      assert.equal(error.code, 'pinned_emulator_version_command_failed'); assert.equal(error.exitCode, result.exitCode); assert.equal(error.timedOut, result.timedOut); assert.equal(JSON.stringify(error).includes('private'), false); return true;
    });
  }
});
async function requireProcessesGone(result) {
  const pids = ['parent', 'child'].map((name) => Number(result.stdout.match(new RegExp(`${name}-ready:(\\d+)`))?.[1]));
  assert.ok(pids.every((pid) => Number.isInteger(pid) && pid > 1), 'Both processes must have started and emitted readiness');
  const exists = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { assert.equal(error.code, 'ESRCH'); return false; } };
  for (let attempt = 0; attempt < 30 && pids.some(exists); attempt++) await delay(100);
  assert.deepEqual(pids.filter(exists), [], 'The owned parent and child must both be gone');
}
const linux = { skip: process.platform !== 'linux' ? 'Linux process-group regression; skipped on this platform' : false };
test('Linux retirement observes an actual owned process exit before waiting out delayed device registration', linux, async (t) => {
  const child = spawn(process.execPath, ['-e', "console.log('ready');setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'ignore'] });
  let exited = false; let exitedAt; child.on('exit', () => { exited = true; exitedAt = Date.now(); }); t.after(() => child.kill('SIGKILL'));
  await once(child.stdout, 'data'); const started = Date.now(); const seen = [];
  const timer = setTimeout(() => child.kill('SIGTERM'), 100); t.after(() => clearTimeout(timer));
  const result = await waitForEmulatorRetirement({ probe: async () => ({ processExited: exited, adbReadable: true, registered: !exited || Date.now() - exitedAt < 150 }), deadline: started + 5000, sleep: () => delay(10), onSample: (sample) => seen.push(sample) });
  assert.equal(result.confirmed, true); assert.equal(exited, true);
  assert.ok(seen.some((sample) => !sample.processExited && sample.registered));
  assert.ok(seen.some((sample) => sample.processExited && sample.registered && !sample.confirmed));
  assert.ok(Date.now() - exitedAt >= 150);
});
test('Linux subprocess timeout stops both the owned parent and its live child and remains failed', linux, async () => {
  const code = `const {spawn}=require('node:child_process'); console.log('parent-ready:'+process.pid); const child=spawn(process.execPath,['-e',"console.log('child-ready:'+process.pid);setInterval(()=>{},1000)"],{stdio:['ignore','pipe','ignore']}); child.stdout.pipe(process.stdout); setInterval(()=>{},1000);`;
  const result = await executeCiCommand(process.execPath, ['-e', code], { timeout: 1500, processGroup: true, allowFailure: true });
  assert.equal(result.ok, false); assert.equal(result.timedOut, true);
  await requireProcessesGone(result);
});
test('Linux subprocess output overflow is bounded, fails and stops the live owned process group', linux, async () => {
  const code = `const {spawn}=require('node:child_process');console.log('parent-ready:'+process.pid);const child=spawn(process.execPath,['-e',"console.log('child-ready:'+process.pid);setTimeout(()=>process.stdout.write('x'.repeat(5*1024*1024)),50);setInterval(()=>{},1000)"],{stdio:['ignore','pipe','ignore']});child.stdout.pipe(process.stdout);setInterval(()=>{},1000);`;
  const result = await executeCiCommand(process.execPath, ['-e', code], { timeout: 10000, processGroup: true, allowFailure: true });
  assert.equal(result.ok, false); assert.equal(result.timedOut, false);
  assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 4 * 1024 * 1024);
  await requireProcessesGone(result);
});
test('Linux process spawn errors fail closed without waiting for the command timeout', linux, async () => {
  const result = await executeCiCommand('/nonexistent-orchestrator-ci-test-command', [], { timeout: 10000, processGroup: true, allowFailure: true });
  assert.equal(result.ok, false); assert.equal(result.timedOut, false); assert.notEqual(result.exitCode, 0);
});
