import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { parseInstallEvidence } from './install-evidence.mjs';

const apkPath = '/synthetic-private-directory/companion.apk';
const base = { role: 'companion', apkPath, elapsedMs: 425, exitCode: 0, signal: null, commandSucceeded: true, stdout: 'Performing Streamed Install\nSuccess\n', stderr: '' };
const failure = code => ({ ...base, commandSucceeded: false, exitCode: 1, stdout: 'Performing Streamed Install\n', stderr: `adb: failed to install ${apkPath}: Failure [${code}: synthetic-private-message]\n` });

test('install success requires the exact bounded adb protocol and successful command exit', () => {
  const expected = { role: 'companion', elapsedMs: 425, exitCode: 0, signal: null, passed: true, installCode: null, protocol: 'success' };
  for (const stdout of ['Success', 'Success\n', base.stdout, base.stdout.replaceAll('\n', '\r\n'), base.stdout.replaceAll('\n', '\r\r\n')]) assert.deepEqual(parseInstallEvidence({ ...base, stdout }), expected);
  for (const change of [{ commandSucceeded: false }, { commandSucceeded: undefined }, { exitCode: 1 }, { exitCode: null }, { signal: 'SIGTERM' }, { signal: 'unknown-private-signal' }, { stdout: '' }, { stdout: 'Success but private failure' }, { stdout: 'Success\nSuccess\n' }, { stderr: 'Failure [INSTALL_FAILED_INTERNAL_ERROR]\n' }, { stderr: 'private diagnostic' }]) assert.equal(parseInstallEvidence({ ...base, ...change }).passed, false);
});

test('official install and parse codes are retained only from canonical failure records', () => {
  for (const code of ['INSTALL_FAILED_INSUFFICIENT_STORAGE', 'INSTALL_FAILED_UPDATE_INCOMPATIBLE', 'INSTALL_FAILED_INTERNAL_ERROR', 'INSTALL_FAILED_TEST_ONLY', 'INSTALL_PARSE_FAILED_BAD_MANIFEST', 'INSTALL_PARSE_FAILED_NO_CERTIFICATES']) {
    const result = parseInstallEvidence(failure(code)); assert.equal(result.installCode, code); assert.equal(result.protocol, 'package_manager_failure'); assert.equal(result.passed, false);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(parseInstallEvidence({ ...failure(code), stdout: `Failure [${code}]\n`, stderr: '' }).installCode, code);
  }
});

test('unknown, prefixed, injected, contradictory and duplicate failures stay unclassified', () => {
  const code = 'INSTALL_FAILED_INTERNAL_ERROR'; const canonical = `Failure [${code}: private]\n`;
  for (const stderr of [`Failure [INSTALL_FAILED_PRIVATE_SECRET]\n`, `private prefix ${canonical}`, `private text ${code}\n`, `Failure [PRIVATE: ${code}]\n`,
    `adb: failed to install /different-private.apk: ${canonical}`, canonical + canonical, canonical + 'Success\n', canonical + 'private extra line\n',
    canonical.replace('Failure', 'FAILURE'), canonical.replace(': private]', '_PRIVATE]'), canonical.replace('private', 'private\ninjection'), canonical.replace(']', '] private'), 'Failure [INSTALL_PARSE_FAILED_PRIVATE]\n']) {
    const result = parseInstallEvidence({ ...failure(code), stderr });
    assert.equal(result.passed, false); assert.equal(result.installCode, null); assert.equal(JSON.stringify(result).includes('private'), false);
  }
  assert.equal(parseInstallEvidence({ ...failure(code), stdout: 'Performing Streamed Install\nPerforming Streamed Install\n' }).installCode, null);
});

test('oversized bytes and non-text output cannot supply success or a diagnostic code', () => {
  for (const stdout of ['x'.repeat(16385), 'é'.repeat(8193)]) {
    const result = parseInstallEvidence({ ...base, stdout }); assert.equal(result.protocol, 'oversized'); assert.equal(result.passed, false); assert.equal(result.installCode, null);
  }
  assert.equal(parseInstallEvidence({ ...base, stdout: 'Success\n', stderr: 'x'.repeat(16380) }).protocol, 'oversized');
  for (const stdout of [undefined, null, Buffer.from('Success\n'), {}, 1]) assert.equal(parseInstallEvidence({ ...base, stdout }).passed, false);
});

test('roles, elapsed time, exit codes and signals are typed and bounded without leaking values', () => {
  for (const role of ['companion', 'fixture', 'instrumentation']) assert.equal(parseInstallEvidence({ ...base, role }).role, role);
  for (const change of [{ role: 'private-role' }, { elapsedMs: -1 }, { elapsedMs: 1.5 }, { elapsedMs: 60001 }, { elapsedMs: Infinity }, { exitCode: 'private-code' }, { exitCode: 4294967296 }, { exitCode: -2147483649 }, { signal: 'private-signal' }]) {
    const result = parseInstallEvidence({ ...base, ...change }); assert.equal(result[Object.keys(change)[0]], null); assert.equal(result.passed, false); assert.equal(JSON.stringify(result).includes('private'), false);
  }
  assert.equal(parseInstallEvidence({ ...base, exitCode: 3221225477 }).exitCode, 3221225477);
  assert.equal(parseInstallEvidence({ ...base, exitCode: null, signal: 'SIGTERM', commandSucceeded: false, elapsedMs: 30005 }).signal, 'SIGTERM');
});

test('the actual native install loop preserves roles, install-r argv, failed attempts and fail-fast order', async () => {
  const source = await readFile(new URL('./native.mjs', import.meta.url), 'utf8');
  const loop = source.slice(source.indexOf('  for (const [role, apk]'), source.indexOf('  stage = "verify emulator credential storage is unlocked"'));
  assert.ok(loop.length > 0);
  for (const failedIndex of [-1, 0, 1, 2]) {
    const installs = []; const calls = []; const context = vm.createContext({ assert, join, root: '/synthetic-root', serial: 'emulator-5574', performance, parseInstallEvidence, installs,
      spawnSync(command, args, options) {
        assert.equal(command, 'adb'); assert.deepEqual(Array.from(args.slice(0, 4)), ['-s', 'emulator-5574', 'install', '-r']); assert.equal(args.length, 5);
        assert.equal(options.timeout, 30000); assert.equal(options.maxBuffer, 16384); assert.equal(options.windowsHide, true);
        const index = calls.push(args[4]) - 1;
        return index === failedIndex ? { status: 1, signal: null, stdout: 'Performing Streamed Install\n', stderr: `adb: failed to install ${args[4]}: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE: private]\n` } : { status: 0, signal: null, stdout: base.stdout, stderr: '' };
      },
    });
    if (failedIndex === -1) vm.runInContext(loop, context); else assert.throws(() => vm.runInContext(loop, context), { code: 'ERR_ASSERTION' });
    const expectedCount = failedIndex === -1 ? 3 : failedIndex + 1; assert.equal(calls.length, expectedCount); assert.equal(installs.length, expectedCount);
    assert.deepEqual(installs.map(item => item.role), ['companion', 'fixture', 'instrumentation'].slice(0, expectedCount));
    assert.ok(installs.slice(0, failedIndex === -1 ? 3 : failedIndex).every(item => item.passed));
    if (failedIndex !== -1) { assert.equal(installs.at(-1).passed, false); assert.equal(installs.at(-1).installCode, 'INSTALL_FAILED_INSUFFICIENT_STORAGE'); }
  }
});

test('the native loop retains timeout and overflow failures even if partial output looks successful', async () => {
  const source = await readFile(new URL('./native.mjs', import.meta.url), 'utf8');
  const loop = source.slice(source.indexOf('  for (const [role, apk]'), source.indexOf('  stage = "verify emulator credential storage is unlocked"'));
  for (const result of [
    { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: base.stdout, stderr: '' },
    { status: 0, signal: null, error: { code: 'ENOBUFS' }, stdout: base.stdout, stderr: '' },
    { status: null, signal: null, error: { code: 'ENOENT' }, stdout: null, stderr: null },
  ]) {
    const installs = []; let calls = 0;
    const context = vm.createContext({ assert, join, root: '/synthetic-root', serial: 'emulator-5574', performance, parseInstallEvidence, installs, spawnSync() { calls++; return result; } });
    assert.throws(() => vm.runInContext(loop, context), { code: 'ERR_ASSERTION' }); assert.equal(calls, 1); assert.equal(installs.length, 1); assert.equal(installs[0].role, 'companion'); assert.equal(installs[0].passed, false);
  }
});
