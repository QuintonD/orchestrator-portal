import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, statfs, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { bootCrashLocations } from './android-emulator-diagnostics.mjs';
import { guestStorageFacts, hostStorageFacts } from './android-emulator-storage.mjs';

// Official archive/checksum: https://developer.android.com/studio/emulator_archive
export const emulatorPin = Object.freeze({ build: '15507667', version: '36.6.11.0', bytes: 331232577, sha256: '1eade4cf2df6ea8eeead4902c635897ba12aaa32aac4389eaae0fdb498a5b830', url: 'https://dl.google.com/android/repository/emulator-linux_x64-15507667.zip' });
export const commandLineToolsPin = Object.freeze({ build: '12266719', version: '16.0' });
export const testsAllowed = ['tests/phone-control/native.mjs', 'tests/phone-control/integration.mjs'];
const services = ['activity', 'package', 'input', 'window', 'settings'];
class CiError extends Error { constructor(code) { super(code); this.code = code; } }
export function parseOptions(args, environment, platform) {
  assert.equal(platform, 'linux', 'This launcher operates only on disposable Linux CI runners');
  assert.equal(environment.GITHUB_ACTIONS, 'true', 'This launcher must not operate on a developer device');
  assert.match(environment.GITHUB_RUN_ID ?? '', /^\d+$/u); assert.match(environment.GITHUB_RUN_ATTEMPT ?? '', /^[1-9]\d*$/u);
  assert.ok(path.isAbsolute(environment.RUNNER_TEMP ?? '') && path.isAbsolute(environment.ANDROID_HOME ?? ''));
  const options = { tests: [] };
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = args.slice(index, index + 2);
    if (name === '--image' && !options.image && ['34', '35', '36', '36.1'].includes(value)) options.image = value;
    else if (name === '--test' && testsAllowed.includes(value) && !options.tests.includes(value)) options.tests.push(value);
    else throw new CiError('unsupported_ci_argument');
  }
  assert.ok(options.image && options.tests.length, 'An image and explicit allowlisted tests are required');
  options.name = `orchestrator-phone-control-ci-${options.image.replace('.', '')}-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}`;
  return options;
}
export function below(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export function hasDevices(output) { return output.split(/\r?\n/u).some((line) => line.trim() && !line.startsWith('List of devices attached') && !line.startsWith('*')); }
export function avdConfiguration(text) {
  const values = { 'hw.cpu.ncore': 2, 'hw.ramSize': 2048, 'hw.lcd.width': 720, 'hw.lcd.height': 1600, 'hw.lcd.density': 280, 'disk.dataPartition.size': '6G' };
  const retained = text.split(/\r?\n/u).filter((line) => !Object.hasOwn(values, line.split('=')[0].trim()));
  return [...retained, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)].join('\n') + '\n';
}
export function graphicsProfile(image) {
  assert.ok(['34', '35', '36', '36.1'].includes(image), 'Unsupported emulator image');
  // Use one explicit Linux software-rendering profile. Windows QA has a separate
  // profile; neither passing configuration identifies a prior crash's cause.
  return { mode: 'swangle', vulkan: 'disabled', arguments: ['-gpu', 'swangle', '-feature', '-Vulkan'] };
}
export function verifyCommandLineTools(properties) {
  if (typeof properties !== 'string' || properties.length > 16384) throw new CiError('command_line_tools_version_mismatch');
  const revisions = properties.split(/\r?\n/u).filter(line => /^\s*Pkg\.Revision\b/u.test(line));
  if (revisions.length !== 1 || revisions[0].trim() !== `Pkg.Revision=${commandLineToolsPin.version}`) throw new CiError('command_line_tools_version_mismatch');
  return { ...commandLineToolsPin };
}
export async function selectCommandLineTools(sdk, filesystem = { realpath, readFile }) {
  let directory;
  try { directory = await filesystem.realpath(path.join(sdk, 'cmdline-tools', commandLineToolsPin.version)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // setup-android may reuse latest when its revision already matches the pin.
    directory = await filesystem.realpath(path.join(sdk, 'cmdline-tools/latest'));
  }
  if (!below(sdk, directory)) throw new CiError('unowned_command_line_tools');
  const metadata = verifyCommandLineTools(await filesystem.readFile(path.join(directory, 'source.properties'), 'utf8'));
  return { directory, metadata };
}
export function snapshotReady(snapshot, image, unlocked = false) {
  const fullVersionMatches = image.includes('.') ? snapshot.sdkFull === image : !snapshot.sdkFull || [image, `${image}.0`].includes(snapshot.sdkFull);
  return snapshot.boot === '1' && snapshot.qemu === '1' && snapshot.sdk === image.split('.')[0] && fullVersionMatches && /^\d+$/u.test(snapshot.pid ?? '') && services.every((service) => snapshot.services?.[service] === true) && snapshot.settingsReadable === true && snapshot.packageReadable === true && (!unlocked || snapshot.unlocked === true);
}
export async function waitForReady({ probe, image, deadline, now = Date.now, sleep = delay, onSample = () => {}, unlocked = false }) {
  let previousPid; let stable = 0;
  while (now() < deadline) {
    const snapshot = await probe();
    const ready = snapshotReady(snapshot, image, unlocked);
    stable = ready ? snapshot.pid === previousPid ? stable + 1 : 1 : 0;
    previousPid = ready ? snapshot.pid : undefined;
    onSample({ ...snapshot, stable });
    if (stable >= 3) return snapshot;
    await sleep(2000);
  }
  throw new CiError('android_services_readiness_timeout');
}
export async function assessAndroidAfterTest({ probe, current, image, onSample = () => {} }) {
  let after;
  try { after = await probe(); } catch { return { androidStable: null, androidSnapshot: null }; }
  const androidStable = /^\d+$/u.test(after.pid ?? '') ? snapshotReady(after, image, true) && after.pid === current.pid : null;
  onSample({ ...after, stable: androidStable ? 3 : 0 });
  return { androidStable, androidSnapshot: after };
}
export async function waitForEmulatorRetirement({ probe, deadline, now = Date.now, sleep = delay, onSample = () => {} }) {
  let diagnosticsFailed = false;
  let result = { confirmed: false, processExited: false, spawnFailed: false, adbReadable: false, registered: null, queryFailed: false, diagnosticsFailed };
  while (now() < deadline) {
    let value; try { value = await probe() ?? {}; } catch { value = { queryFailed: true }; }
    const facts = { processExited: value.processExited === true, spawnFailed: value.spawnFailed === true, adbReadable: value.adbReadable === true, registered: typeof value.registered === 'boolean' ? value.registered : null };
    result = { confirmed: (facts.processExited || facts.spawnFailed) && facts.adbReadable && facts.registered === false && value.queryFailed !== true, ...facts, queryFailed: value.queryFailed === true, diagnosticsFailed };
    try { await onSample(result); } catch { diagnosticsFailed = true; result.diagnosticsFailed = true; }
    if (result.confirmed) return result;
    await sleep(1000);
  }
  return result;
}
export async function optionalCleanupQuery(query) {
  try { const result = await query(); return { ok: result.ok === true, stdout: typeof result.stdout === 'string' ? result.stdout : '', exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null, timedOut: result.timedOut === true, queryFailed: false }; }
  catch { return { ok: false, stdout: '', exitCode: null, timedOut: false, queryFailed: true }; }
}
export function diagnosticsSummary(text) {
  return Object.fromEntries([
    ['missingInputService', /Can't find service: input/gu], ['missingSettingsService', /Can't find service: settings/gu],
    ['fatalException', /FATAL EXCEPTION/gu], ['systemProcessCrash', /FATAL EXCEPTION IN SYSTEM PROCESS/gu],
    ['outOfMemory', /OutOfMemoryError/gu], ['nativeFatalSignal', /Fatal signal (?:6|11)\b/gu],
    ['systemServerWatchdog', /WATCHDOG KILLING SYSTEM PROCESS/gu], ['emulatorFatal', /\bFATAL\b/gu],
  ].map(([name, pattern]) => [name, [...String(text).matchAll(pattern)].length]));
}
export function preTestBootCrashLocations(evidence, text) {
  if (!Array.isArray(evidence.tests) || evidence.tests.length !== 0 || !['wait_android_services', 'configure_ready_android'].includes(evidence.stage)) return undefined;
  return { scope: 'pre_test_android_boot', ...bootCrashLocations(text) };
}
export async function downloadPinnedArchive(pin, archive, { signal, onResponse = () => {} } = {}) {
  const response = await fetch(pin.url, { redirect: 'error', signal });
  const length = response.headers.get('content-length'); const encoding = response.headers.get('content-encoding')?.toLowerCase() ?? 'identity';
  const metadata = { httpStatus: response.status, contentLength: /^\d{1,15}$/u.test(length ?? '') ? Number(length) : null, contentEncoding: ['identity', 'gzip', 'deflate', 'br'].includes(encoding) ? encoding : 'other' };
  await onResponse(metadata);
  if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new CiError('pinned_emulator_download_invalid'); }
  // fetch decodes HTTP content encoding. Content-Length describes the encoded
  // transfer, when present; only decoded archive bytes can satisfy the pin.
  const hash = createHash('sha256'); let size = 0;
  const meter = new Transform({ transform(chunk, encoding, callback) { size += chunk.length; if (size > pin.bytes) return callback(new CiError('pinned_emulator_download_oversize')); hash.update(chunk); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(archive, { flags: 'wx' }), { signal });
  const sha256 = hash.digest('hex');
  if (size !== pin.bytes || sha256 !== pin.sha256) throw new CiError('pinned_emulator_checksum_mismatch');
  return { ...metadata, receivedBytes: size, sha256 };
}
export async function verifyPinnedEmulator(binary, command) {
  // The GUI version command selects a different QEMU binary and can require
  // desktop audio libraries that the headless CI launch does not use.
  const result = await command(binary, ['-no-window', '-version'], { allowFailure: true });
  if (!result.ok) { const error = new CiError('pinned_emulator_version_command_failed'); error.exitCode = result.exitCode; error.timedOut = result.timedOut; throw error; }
  if (!result.stdout.includes(`Android emulator version ${emulatorPin.version} (build_id ${emulatorPin.build})`)) throw new CiError('pinned_emulator_version_mismatch');
  return { version: emulatorPin.version, build: emulatorPin.build };
}
export async function runLifecycle(operations, tests, { signal } = {}) {
  let failure;
  try {
    await operations.start(); await operations.ready(); await operations.configure();
    for (const test of tests) await operations.test(test);
  } catch (error) { failure = error; }
  finally {
    try { await operations.diagnose(); } catch (error) { failure ??= error; }
    try { await operations.stop(); } catch (error) { failure ??= error; }
  }
  if (!failure && signal?.aborted) failure = new CiError('ci_cancelled');
  if (failure) throw failure;
}

export function executeCiCommand(tool, argv, { cwd, env, timeout = 15000, input, allowFailure = false, signal, processGroup = false } = {}) {
  if (processGroup) assert.equal(process.platform, 'linux', 'Process-group cleanup requires Linux');
  return new Promise((resolve, reject) => {
    let escalationTimer; let timedOut = false; let failed = false; let capturedBytes = 0;
    const stdout = []; const stderr = [];
    // spawn forwards detached to the OS; execFile does not. The real Linux
    // parent/child timeout regression protects this process-group boundary.
    const child = spawn(tool, argv, { cwd, env, detached: processGroup, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const terminate = (value) => { if (child.pid) { try { if (processGroup) process.kill(-child.pid, value); else child.kill(value); } catch { /* The owned process/group may have already exited. */ } } };
    const stop = () => { terminate('SIGTERM'); escalationTimer ??= setTimeout(() => terminate('SIGKILL'), 2000); };
    const cancel = () => { failed = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', (bytes) => { capturedBytes += bytes.length; if (capturedBytes <= 4 * 1024 * 1024) chunks.push(bytes); else { failed = true; stop(); } });
    child.on('error', () => { failed = true; }); child.stdin.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(timer); clearTimeout(escalationTimer); signal?.removeEventListener('abort', cancel); if (processGroup) terminate('SIGKILL');
      const ok = code === 0 && !failed && !timedOut;
      if (!ok && !allowFailure) { const fault = new CiError('ci_command_failed'); fault.exitCode = code; fault.timedOut = timedOut; reject(fault); }
      else resolve({ ok, stdout: Buffer.concat(stdout).toString('utf8').trim(), stderr: Buffer.concat(stderr).toString('utf8').trim(), exitCode: code, timedOut });
    });
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    child.stdin.end(input);
  });
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args, process.env, process.platform);
  const root = fileURLToPath(new URL('../', import.meta.url)); const temporaryRoot = await realpath(process.env.RUNNER_TEMP);
  const work = await mkdtemp(path.join(temporaryRoot, 'phone-emulator-')); assert.ok(below(temporaryRoot, await realpath(work)));
  const output = path.join(root, 'test-results/phone-control', options.name.replace('orchestrator-phone-control-ci-', 'emulator-ci-'));
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // A previous attempt's diagnostics must never be replaced.
  const avdHome = path.join(work, 'avds'); const avdPath = path.join(avdHome, `${options.name}.avd`); await mkdir(avdHome);
  const sdk = await realpath(process.env.ANDROID_HOME); const adb = path.join(sdk, 'platform-tools/adb'); const serial = 'emulator-5554';
  const environment = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: avdHome, ANDROID_USER_HOME: path.join(work, 'android-user'), ANDROID_SERIAL: serial, PHONE_QA_SERIAL: serial };
  const abort = new AbortController(); const cancel = () => abort.abort(); process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  const evidence = { kind: 'owned-android-emulator-ci', image: options.image, name: options.name, serial, emulator: emulatorPin, startedAt: new Date().toISOString(), status: 'running', tests: [], samples: [], cleanup: { confirmed: false }, diagnostics: {} };
  const save = async () => writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
  let emulator; let emulatorExited = false; let emulatorFailed = false; let emulatorText = ''; let lastSnapshot; let deadline;
  function command(tool, argv, { timeout = 15000, input, allowFailure = false, cancellable = true, processGroup = false } = {}) {
    return executeCiCommand(tool, argv, { cwd: root, env: environment, timeout, input, allowFailure, signal: cancellable ? abort.signal : undefined, processGroup });
  }
  const device = (argv, extra) => command(adb, ['-s', serial, ...argv], extra);
  const hostStorage = async () => { try { return hostStorageFacts(await statfs(work, { bigint: true })); } catch { return null; } };
  const storageSnapshot = async () => {
    const [host, guest] = await Promise.all([
      hostStorage(),
      optionalCleanupQuery(() => device(['shell', 'stat', '-f', '-c', '%S:%b:%a', '/data'], { timeout: 5000, allowFailure: true, cancellable: false })),
    ]);
    return { host, guest: guest.ok ? guestStorageFacts(guest.stdout) : null };
  };
  async function probe() {
    if (emulatorExited || emulatorFailed) throw new CiError('owned_emulator_exited_before_tests');
    const queries = [['boot', ['shell', 'getprop', 'sys.boot_completed']], ['qemu', ['shell', 'getprop', 'ro.kernel.qemu']], ['sdk', ['shell', 'getprop', 'ro.build.version.sdk']], ['sdkFull', ['shell', 'getprop', 'ro.build.version.sdk_full']], ['fingerprint', ['shell', 'getprop', 'ro.build.fingerprint']], ['pid', ['shell', 'pidof', 'system_server']], ['settings', ['shell', 'settings', 'get', 'global', 'device_provisioned']], ['package', ['shell', 'cmd', 'package', 'path', 'android']], ['users', ['shell', 'dumpsys', 'user']], ...services.map((service) => [`service:${service}`, ['shell', 'service', 'check', service]])];
    const results = Object.fromEntries(await Promise.all(queries.map(async ([name, argv]) => [name, await device(argv, { timeout: 10000, allowFailure: true })])));
    const value = (name) => results[name].ok ? results[name].stdout : '';
    return { boot: value('boot'), qemu: value('qemu'), sdk: value('sdk'), sdkFull: value('sdkFull'), fingerprint: /^[A-Za-z0-9._:/+-]{1,200}$/u.test(value('fingerprint')) ? value('fingerprint') : '', pid: /^\d+$/u.test(value('pid')) ? value('pid') : '', services: Object.fromEntries(services.map((service) => [service, value(`service:${service}`) === `Service ${service}: found`])), settingsReadable: results.settings.ok && /^(?:null|\d+)$/u.test(value('settings')), packageReadable: results.package.ok && /^package:\/[^\r\n]+$/u.test(value('package')), unlocked: /Started users state: \[0=RUNNING_UNLOCKED\]/u.test(value('users')) };
  }
  const sample = (value) => { lastSnapshot = value; evidence.samples.push({ ...value, elapsedMs: Date.now() - (deadline - 600000) }); if (evidence.samples.length > 320) evidence.samples.shift(); };
  try {
    await runLifecycle({
      start: async () => {
        evidence.stage = 'preflight'; await save();
        if (hasDevices((await command(adb, ['devices'])).stdout)) throw new CiError('existing_devices_forbidden');
        for (const port of [5554, 5555]) await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', () => reject(new CiError('reserved_emulator_port_in_use'))); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
        const imageDirectory = path.join(sdk, 'system-images', `android-${options.image}`, 'google_apis', 'x86_64'); await realpath(imageDirectory);
        evidence.stage = 'download_pinned_emulator'; await save();
        const archive = path.join(work, 'emulator.zip');
        evidence.download = await downloadPinnedArchive(emulatorPin, archive, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]), onResponse: async (metadata) => { evidence.download = metadata; await save(); } });
        evidence.stage = 'extract_pinned_emulator'; await save();
        const runtime = path.join(work, 'runtime'); await mkdir(runtime); await command('unzip', ['-q', archive, '-d', runtime], { timeout: 60000 });
        const binary = path.join(runtime, 'emulator/emulator');
        evidence.stage = 'verify_pinned_emulator'; await save();
        evidence.emulatorVerification = await verifyPinnedEmulator(binary, command);
        evidence.stage = 'verify_command_line_tools'; await save();
        const selectedTools = await selectCommandLineTools(sdk);
        evidence.commandLineTools = selectedTools.metadata;
        evidence.stage = 'create_owned_avd'; await save();
        await command(path.join(selectedTools.directory, 'bin/avdmanager'), ['create', 'avd', '--name', options.name, '--package', `system-images;android-${options.image};google_apis;x86_64`, '--device', 'pixel_7', '--path', avdPath], { input: 'no\n', timeout: 60000 });
        if (!below(work, await realpath(avdPath))) throw new CiError('unowned_avd_path');
        const configuration = path.join(avdPath, 'config.ini'); await writeFile(configuration, avdConfiguration(await readFile(configuration, 'utf8')));
        evidence.configuredDataPartitionBytes = 6 * 1024 ** 3;
        evidence.graphics = graphicsProfile(options.image);
        evidence.storage = { beforeLaunch: { host: await hostStorage() } }; await save();
        emulator = spawn(binary, ['-avd', options.name, '-port', '5554', '-no-window', ...evidence.graphics.arguments, '-cores', '2', '-memory', '2048', '-skin', '720x1600', '-noaudio', '-no-boot-anim', '-no-snapshot'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
        emulator.on('error', () => { emulatorFailed = true; }); emulator.on('exit', () => { emulatorExited = true; });
        for (const stream of [emulator.stdout, emulator.stderr]) stream.on('data', (bytes) => { emulatorText = (emulatorText + bytes.toString('utf8')).slice(-1024 * 1024); });
        deadline = Date.now() + 600000; await save();
      },
      ready: async () => {
        evidence.stage = 'wait_android_services'; await save();
        await waitForReady({ probe, image: options.image, deadline, onSample: sample, sleep: (ms) => delay(ms, undefined, { signal: abort.signal }) });
        const name = (await device(['emu', 'avd', 'name'])).stdout.split('\n')[0].trim(); if (name !== options.name) throw new CiError('unexpected_emulator_identity');
      },
      configure: async () => {
        evidence.stage = 'configure_ready_android'; evidence.configureStep = 'unlock_display'; await save();
        await device(['shell', 'input', 'keyevent', '82']);
        for (const field of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
          evidence.configureStep = field; await save();
          await device(['shell', 'settings', 'put', 'global', field, '0.0']);
        }
        evidence.configureStep = 'wait_unlocked'; await save();
        await waitForReady({ probe, image: options.image, deadline, unlocked: true, onSample: sample, sleep: (ms) => delay(ms, undefined, { signal: abort.signal }) });
        evidence.configureStep = 'observe_storage'; await save();
        evidence.storage.beforeTests = await storageSnapshot(); evidence.configureStep = 'complete'; await save();
      },
      test: async (name) => {
        evidence.stage = name; await save();
        const current = await probe(); if (!snapshotReady(current, options.image, true) || current.pid !== lastSnapshot.pid) throw new CiError('android_restarted_before_test');
        const file = await realpath(path.join(root, name)); if (!below(root, file)) throw new CiError('unowned_test_path');
        const result = await command(process.execPath, [file], { timeout: 900000, allowFailure: true, processGroup: true });
        const after = await assessAndroidAfterTest({ probe, current, image: options.image, onSample: sample });
        const passed = result.ok && after.androidStable === true;
        evidence.tests.push({ name, exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null, timedOut: result.timedOut, ...after, passed });
        if (!passed) evidence.storage.afterTestFailure = await storageSnapshot();
        await save();
        if (!result.ok) throw new CiError('phone_test_failed');
        if (after.androidStable !== true) throw new CiError('android_post_test_unverified');
      },
      diagnose: async () => {
        const crash = emulator ? await optionalCleanupQuery(() => device(['logcat', '-d', '-b', 'crash', '-t', '400'], { timeout: 10000, allowFailure: true, cancellable: false })) : { stdout: '' };
        evidence.diagnostics = diagnosticsSummary(emulatorText + '\n' + crash.stdout);
        evidence.diagnostics.bootCrashLocations = preTestBootCrashLocations(evidence, crash.stdout);
        if (emulator && preTestBootCrashLocations(evidence, '')) {
          evidence.storage.afterBootFailure = await storageSnapshot();
        }
        evidence.diagnostics.lastSnapshot = lastSnapshot ?? null; await save();
      },
      stop: async () => {
        if (!emulator) { evidence.cleanup = { confirmed: true, emulatorStarted: false }; return; }
        const started = Date.now(); const samples = []; let cleanupEvidenceFailed = false;
        const cleanupDevice = (argv) => optionalCleanupQuery(() => device(argv, { timeout: 5000, allowFailure: true, cancellable: false }));
        const identity = await cleanupDevice(['emu', 'avd', 'name']);
        const identityVerified = identity.ok && identity.stdout.split('\n')[0].trim() === options.name;
        evidence.cleanup = { confirmed: false, emulatorStarted: true, dataRetained: true, identityVerified, identityQueryFailed: identity.queryFailed, killRequested: identityVerified, samples };
        if (identityVerified) { const killed = await cleanupDevice(['emu', 'kill']); evidence.cleanup.killCommand = { ok: killed.ok, exitCode: killed.exitCode, timedOut: killed.timedOut, queryFailed: killed.queryFailed }; }
        const processGone = () => emulatorExited || (emulatorFailed && !emulator.pid);
        const retire = async (duration) => {
          const result = await waitForEmulatorRetirement({
            deadline: Date.now() + duration,
            probe: async () => {
              const devices = await optionalCleanupQuery(() => command(adb, ['devices'], { timeout: 5000, allowFailure: true, cancellable: false }));
              const adbReadable = devices.ok && /^List of devices attached(?:\r?\n|$)/u.test(devices.stdout);
              return { processExited: emulatorExited, spawnFailed: emulatorFailed && !emulator.pid, adbReadable, registered: adbReadable ? /^emulator-5554\s/mu.test(devices.stdout) : null, queryFailed: devices.queryFailed };
            },
            onSample: async (value) => { samples.push({ ...value, elapsedMs: Date.now() - started }); if (samples.length > 64) samples.shift(); evidence.cleanup = { ...evidence.cleanup, ...value }; await save(); },
          });
          cleanupEvidenceFailed ||= result.diagnosticsFailed;
          return result;
        };
        // Process exit and ADB retirement are independent observations. A stale
        // registration or failed ADB query cannot confirm that cleanup finished.
        let retired = await retire(20000);
        if (!retired.confirmed) {
          if (!processGone()) { emulator.kill('SIGTERM'); await delay(3000); }
          if (!processGone()) emulator.kill('SIGKILL');
          retired = await retire(10000);
        }
        evidence.cleanup = { ...evidence.cleanup, ...retired, diagnosticsFailed: cleanupEvidenceFailed };
        if (!evidence.cleanup.confirmed) throw new CiError('owned_emulator_stop_unconfirmed');
        if (cleanupEvidenceFailed) throw new CiError('cleanup_evidence_write_failed');
      },
    }, options.tests, { signal: abort.signal });
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed'; evidence.failure = error instanceof CiError ? error.code : abort.signal.aborted ? 'ci_cancelled' : 'ci_setup_failed';
    if (error instanceof CiError && Object.hasOwn(error, 'exitCode')) evidence.commandFailure = { exitCode: Number.isInteger(error.exitCode) ? error.exitCode : null, timedOut: error.timedOut === true };
    process.exitCode = 1;
  }
  finally { evidence.finishedAt = new Date().toISOString(); await save(); process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel); }
  console.log(JSON.stringify({ status: evidence.status, failure: evidence.failure, tests: evidence.tests, cleanup: evidence.cleanup, results: path.relative(root, path.join(output, 'results.json')) }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
