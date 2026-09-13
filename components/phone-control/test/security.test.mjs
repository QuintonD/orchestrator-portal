// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, symlinkSync, readdirSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createPublicKey, randomBytes } from 'node:crypto';
import { initialize, loadConfiguration, provisionBrokerIdentity, addDevice, updateDeviceToken, acquireLock, securePath, assertPrivate, encrypt, decrypt, writePrivate, digest } from '../src/security.mjs';

function windowsFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'phone-windows-acl-'));
  t.after(() => { const path = resolve(directory); assert.ok(path.startsWith(resolve(tmpdir()) + sep)); rmSync(path, { recursive: true, force: true }); });
  return directory;
}
function windowsAcl(path) {
  const script = '$ErrorActionPreference="Stop"; $env:PSModulePath="$PSHOME\\Modules"; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1" -ErrorAction Stop; $a=Get-Acl -LiteralPath $env:PHONE_TEST_ACL_PATH; $i=[System.Security.Principal.WindowsIdentity]::GetCurrent(); $p=New-Object System.Security.Principal.WindowsPrincipal($i); @{ownedByCurrentUser=($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $i.User.Value); administrator=$p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)} | ConvertTo-Json -Compress';
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env: { ...process.env, PHONE_TEST_ACL_PATH: path }, windowsHide: true }));
}

test('Windows private paths belong to the current account even with an elevated administrator token', { skip: process.platform !== 'win32' }, (t) => {
  const directory = windowsFixture(t); const file = join(directory, 'synthetic.txt');
  for (const [path, isDirectory] of [[directory, true], [file, false]]) {
    if (!isDirectory) writeFileSync(file, 'synthetic');
    if (windowsAcl(path).administrator) {
      // Reproduce the hosted Windows runner's group-owned creation deterministically.
      execFileSync('icacls.exe', [path, '/setowner', '*S-1-5-32-544'], { stdio: 'ignore', windowsHide: true });
      assert.equal(windowsAcl(path).ownedByCurrentUser, false);
      assert.throws(() => assertPrivate(path), { code: 'insecure_private_file' });
      if (isDirectory) assert.throws(() => initialize(path), { code: 'insecure_private_file' });
    }
    securePath(path, isDirectory); assertPrivate(path); assert.equal(windowsAcl(path).ownedByCurrentUser, true);
  }
});

test('Windows private paths remove inherited access but still reject explicit foreign grants', { skip: process.platform !== 'win32' }, (t) => {
  const parent = windowsFixture(t); securePath(parent, true);
  execFileSync('icacls.exe', [parent, '/grant', '*S-1-1-0:(OI)(CI)R'], { stdio: 'ignore', windowsHide: true });
  const directory = join(parent, 'private'); mkdirSync(directory);
  assert.throws(() => assertPrivate(directory), { code: 'insecure_private_file' });
  securePath(directory, true); assertPrivate(directory);
  execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:R'], { stdio: 'ignore', windowsHide: true });
  assert.throws(() => assertPrivate(directory), { code: 'insecure_private_file' });
  securePath(directory, true);
  assert.throws(() => assertPrivate(directory), { code: 'insecure_private_file' });
  execFileSync('icacls.exe', [directory, '/remove:g', '*S-1-1-0'], { stdio: 'ignore', windowsHide: true });
  assertPrivate(directory);
});

test('Windows private-file validation ignores an incompatible inherited PowerShell module path', { skip: process.platform !== 'win32' }, (t) => {
  const directory = windowsFixture(t); securePath(directory, true);
  const modules = join(directory, 'modules'); const shadow = join(modules, 'Microsoft.PowerShell.Security'); mkdirSync(shadow, { recursive: true });
  writeFileSync(join(shadow, 'Microsoft.PowerShell.Security.psd1'), "@{ ModuleVersion='99.0'; PowerShellVersion='99.0'; FunctionsToExport=@('Get-Acl') }");
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath')), PSModulePath: modules, PHONE_TEST_ACL_PATH: directory };
  // Reproduce the hosted pwsh -> Node -> Windows PowerShell autoload failure.
  const control = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; Get-Acl -LiteralPath $env:PHONE_TEST_ACL_PATH'], { env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  assert.notEqual(control.status, 0); assert.match(control.stderr, /CouldNotAutoloadMatchingModule/u);
  const script = `import { mkdirSync } from 'node:fs'; import { join } from 'node:path';
    import { securePath, assertPrivate, initialize } from ${JSON.stringify(new URL('../src/security.mjs', import.meta.url).href)};
    const root = process.env.PHONE_TEST_ACL_PATH; assertPrivate(root);
    const existing = join(root, 'existing'); mkdirSync(existing); securePath(existing, true);
    const initialized = initialize(existing); assertPrivate(initialized.configPath);`;
  // This checks module isolation, not Windows shell-startup latency under CI load.
  const checked = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  assert.equal(checked.status, 0, 'Private initialization must use the Windows PowerShell built-in ACL module');
});

test('AES-GCM detects tampering and key substitution', () => {
  const key = randomBytes(32); const value = encrypt({ secret: 'sensitive-native-token' }, key); assert.equal(JSON.stringify(value).includes('sensitive-native-token'), false); assert.deepEqual(decrypt(value, key), { secret: 'sensitive-native-token' });
  assert.throws(() => decrypt(value, randomBytes(32)), { code: 'encrypted_state_invalid' }); assert.throws(() => decrypt({ ...value, tag: randomBytes(16).toString('base64') }, key), { code: 'encrypted_state_invalid' });
});

test('initialization refuses an existing nonempty directory before changing permissions', () => {
  const root = mkdtempSync(join(tmpdir(), 'phone-preserve-')); const file = join(root, 'existing.txt'); writeFileSync(file, 'keep'); const mode = statSync(root).mode;
  assert.throws(() => initialize(root), { code: 'private_directory_not_empty' }); assert.equal(statSync(root).mode, mode); assert.equal(readFileSync(file, 'utf8'), 'keep'); assert.deepEqual(readdirSync(root), ['existing.txt']);
});

test('initialization rejects symlink or junction directories before modifying the target', () => {
  const root = mkdtempSync(join(tmpdir(), 'phone-link-')); const target = mkdtempSync(join(tmpdir(), 'phone-target-')); const link = join(root, 'link'); symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const mode = statSync(target).mode; assert.throws(() => initialize(link), { code: 'insecure_private_file' }); assert.equal(statSync(target).mode, mode); assert.deepEqual(readdirSync(target), []);
});

test('private setup encrypts native tokens and state; rotation revokes sessions and requires stopped broker', () => {
  const parent = mkdtempSync(join(tmpdir(), 'phone-private-')); const root = join(parent, 'private'); const initialized = initialize(root); assertPrivate(root); assertPrivate(initialized.configPath); assertPrivate(initialized.adminTokenFile);
  const secret = readFileSync(initialized.adminTokenFile, 'utf8'); let loaded = loadConfiguration(initialized.configPath); assert.equal(loaded.config.adminTokenHash, digest(secret)); assert.equal(loaded.config.port, 4421);
  assertPrivate(join(root, 'broker-signing.pem')); assertPrivate(initialized.brokerPublicKeyFile);
  assert.equal(loaded.config.signingPublicKey, readFileSync(initialized.brokerPublicKeyFile, 'utf8'));
  assert.equal(createPublicKey(loaded.config.signingPrivateKey).export({ type: 'spki', format: 'pem' }), loaded.config.signingPublicKey);
  assert.equal(readFileSync(initialized.configPath, 'utf8').includes('PRIVATE KEY'), false);
  const originalPublic = loaded.config.signingPublicKey; assert.equal(provisionBrokerIdentity(initialized.configPath).brokerPublicKeyFile, initialized.brokerPublicKeyFile);
  assert.equal(loadConfiguration(initialized.configPath).config.signingPublicKey, originalPublic);
  unlinkSync(join(root, 'broker-signing.pem')); assert.throws(() => provisionBrokerIdentity(initialized.configPath), { code: 'broker_identity_incomplete' });
  unlinkSync(initialized.brokerPublicKeyFile); assert.equal(loadConfiguration(initialized.configPath).config.signingPrivateKey, undefined);
  provisionBrokerIdentity(initialized.configPath); assert.notEqual(loadConfiguration(initialized.configPath).config.signingPublicKey, originalPublic);
  const tokenFile = join(root, 'native.token'); writePrivate(tokenFile, 'native-secret-with-at-least-thirty-two-characters', { exclusive: true });
  addDevice(initialized.configPath, { id: 'phone', label: 'Phone', port: 8837, tokenFile }); loaded = loadConfiguration(initialized.configPath); assert.equal(loaded.config.devices[0].token, readFileSync(tokenFile, 'utf8')); assert.equal(readFileSync(initialized.configPath, 'utf8').includes('native-secret'), false);
  loaded.state.sessions.push({ id: 'session', deviceId: 'phone', expiresAt: new Date(Date.now() + 60000).toISOString() }); loaded.save(loaded.state); assert.equal(readFileSync(join(root, 'state.enc.json'), 'utf8').includes('session'), false);
  const unlock = acquireLock(initialized.configPath); assert.throws(() => updateDeviceToken(initialized.configPath, { id: 'phone', tokenFile }), { code: 'broker_must_be_stopped' }); assert.throws(() => provisionBrokerIdentity(initialized.configPath), { code: 'broker_must_be_stopped' }); unlock();
  writePrivate(tokenFile, 'rotated-secret-with-at-least-thirty-two-characters'); updateDeviceToken(initialized.configPath, { id: 'phone', tokenFile }); loaded = loadConfiguration(initialized.configPath); assert.ok(loaded.state.sessions[0].revokedAt); assert.match(loaded.config.devices[0].token, /^rotated/u);
  assert.equal(readdirSync(root).some((name) => name.endsWith('.tmp')), false);
});

test('exclusive private writes never overwrite existing owner data', () => {
  const root = mkdtempSync(join(tmpdir(), 'phone-exclusive-')); const file = join(root, 'keep.token'); writePrivate(file, 'keep', { exclusive: true }); assert.throws(() => writePrivate(file, 'replace', { exclusive: true })); assert.equal(readFileSync(file, 'utf8'), 'keep');
});
