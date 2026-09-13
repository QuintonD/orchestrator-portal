// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { createHash, createPublicKey, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, renameSync, statSync, chmodSync, existsSync, lstatSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Fault, requireThat, identifier, string, number, object } from './validation.mjs';
import { generateResponseIdentity } from './response-proof.mjs';

export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function token() { return randomBytes(32).toString('base64url'); }
export function tokenMatches(candidate, hash) {
  if (typeof candidate !== 'string' || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) return false;
  return timingSafeEqual(Buffer.from(digest(candidate), 'hex'), Buffer.from(hash, 'hex'));
}
function windowsIdentity() {
  return execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).trim().match(/"(S-1-[0-9-]+)"\s*$/u)?.[1];
}
export function securePath(path, directory = false) {
  if (process.platform === 'win32') {
    const sid = windowsIdentity(); requireThat(sid, 'private_permissions_unavailable', 500);
    execFileSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${sid}:${directory ? '(OI)(CI)' : ''}F`], { stdio: 'ignore', windowsHide: true });
  } else chmodSync(path, directory ? 0o700 : 0o600);
}
export function assertPrivate(path) {
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) { requireThat(!lstatSync(ancestor).isSymbolicLink(), 'insecure_private_file', 500); if (dirname(ancestor) === ancestor) break; }
  if (process.platform === 'win32') {
    const script = '$a=Get-Acl -LiteralPath $env:PHONE_CONTROL_PRIVATE_PATH; $u=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $o=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $bad=@($a.Access | Where-Object { $_.AccessControlType -eq "Allow" -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin @($u,"S-1-5-18","S-1-5-32-544") }); if($o -ne $u -or $bad.Count -ne 0){exit 2}';
    try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PHONE_CONTROL_PRIVATE_PATH: resolve(path) }, stdio: 'ignore', windowsHide: true }); }
    catch { throw new Fault('insecure_private_file', 500); }
  } else {
    const stat = statSync(path); requireThat((stat.mode & 0o077) === 0 && (process.getuid === undefined || stat.uid === process.getuid()), 'insecure_private_file', 500);
  }
}
export function writePrivate(path, text, { exclusive = false } = {}) {
  if (exclusive) { writeFileSync(path, text, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true }); try { securePath(path); } catch (error) { unlinkSync(path); throw error; } return; }
  const temp = join(dirname(path), `.${basename(path)}.${token()}.tmp`);
  writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
  try { securePath(temp); renameSync(temp, path); } catch (error) { if (existsSync(temp)) unlinkSync(temp); throw error; }
}
export function encrypt(value, key) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: bytes.toString('base64') };
}
export function decrypt(value, key) {
  try { object(value, ['version', 'iv', 'tag', 'data']); requireThat(value.version === 1); const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64')); decipher.setAuthTag(Buffer.from(value.tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8')); }
  catch { throw new Fault('encrypted_state_invalid', 500); }
}
export function initialize(directory, port = 4421) {
  const root = resolve(directory); number(port, 1024, 65535);
  for (let ancestor = root; ; ancestor = dirname(ancestor)) { if (existsSync(ancestor)) requireThat(!lstatSync(ancestor).isSymbolicLink(), 'insecure_private_file', 500); if (dirname(ancestor) === ancestor) break; }
  if (existsSync(root)) {
    requireThat(lstatSync(root).isDirectory() && readdirSync(root).length === 0, 'private_directory_not_empty', 409);
    if (process.platform === 'win32') {
      const script = '$a=Get-Acl -LiteralPath $env:PHONE_CONTROL_PRIVATE_PATH; if($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value){exit 2}';
      try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PHONE_CONTROL_PRIVATE_PATH: root }, stdio: 'ignore', windowsHide: true }); } catch { throw new Fault('insecure_private_file', 500); }
    } else requireThat(statSync(root).uid === process.getuid(), 'insecure_private_file', 500);
  }
  mkdirSync(root, { recursive: true, mode: 0o700 }); securePath(root, true); assertPrivate(root);
  const configPath = join(root, 'config.json'); requireThat(!existsSync(configPath), 'configuration_exists', 409);
  const adminToken = token(); const key = randomBytes(32);
  writePrivate(join(root, 'key'), key.toString('base64'), { exclusive: true });
  writePrivate(join(root, 'admin.token'), adminToken, { exclusive: true });
  const identity = generateResponseIdentity();
  writePrivate(join(root, 'broker-signing.pem'), identity.privateKey, { exclusive: true });
  writePrivate(join(root, 'broker-public.pem'), identity.publicKey, { exclusive: true });
  writePrivate(configPath, JSON.stringify({ version: 1, port, adminTokenHash: digest(adminToken), devices: [] }, null, 2), { exclusive: true });
  writePrivate(join(root, 'state.enc.json'), JSON.stringify(encrypt({ credentials: [], sessions: [], tasks: [], receipts: [], audit: [], uncertainDevices: [] }, key)), { exclusive: true });
  return { configPath, adminTokenFile: join(root, 'admin.token'), brokerPublicKeyFile: join(root, 'broker-public.pem') };
}
export function loadConfiguration(configPath) {
  const path = resolve(configPath); const root = dirname(path); assertPrivate(root); assertPrivate(path); assertPrivate(join(root, 'key')); assertPrivate(join(root, 'state.enc.json'));
  const config = JSON.parse(readFileSync(path, 'utf8')); object(config, ['version', 'port', 'adminTokenHash', 'devices']); requireThat(config.version === 1, 'configuration_invalid', 500); number(config.port, 1024, 65535); requireThat(/^[a-f0-9]{64}$/u.test(config.adminTokenHash));
  requireThat(Array.isArray(config.devices) && config.devices.length <= 16); const key = Buffer.from(readFileSync(join(root, 'key'), 'utf8').trim(), 'base64'); requireThat(key.length === 32, 'configuration_invalid', 500);
  const ids = new Set();
  config.devices = config.devices.map((device) => {
    object(device, ['id', 'label', 'port', 'encryptedToken']); identifier(device.id); string(device.label, 80); number(device.port, 1024, 65535); requireThat(!ids.has(device.id)); ids.add(device.id);
    const nativeToken = decrypt(device.encryptedToken, key); requireThat(typeof nativeToken === 'string' && nativeToken.length >= 24 && nativeToken.length <= 256 && !/\s/u.test(nativeToken), 'configuration_invalid', 500);
    return { id: device.id, label: device.label, origin: `http://127.0.0.1:${device.port}`, token: nativeToken };
  });
  const statePath = join(root, 'state.enc.json'); const state = decrypt(JSON.parse(readFileSync(statePath, 'utf8')), key);
  object(state, ['credentials', 'sessions', 'tasks', 'receipts', 'audit', 'uncertainDevices'], ['credentials', 'sessions', 'receipts', 'audit', 'uncertainDevices']); for (const list of Object.values(state)) requireThat(Array.isArray(list), 'encrypted_state_invalid', 500);
  if (existsSync(join(root, 'broker-signing.pem'))) { assertPrivate(join(root, 'broker-signing.pem')); config.signingPrivateKey = readFileSync(join(root, 'broker-signing.pem'), 'utf8'); }
  if (existsSync(join(root, 'broker-public.pem'))) { assertPrivate(join(root, 'broker-public.pem')); config.signingPublicKey = readFileSync(join(root, 'broker-public.pem'), 'utf8'); }
  return { config, state, save: (next) => writePrivate(statePath, JSON.stringify(encrypt(next, key))) };
}
/** Owner-only offline migration; existing identity material is never rotated implicitly. */
export function provisionBrokerIdentity(configPath) {
  const path = resolve(configPath); assertOffline(path); const loaded = loadConfiguration(path); const root = dirname(path);
  const privatePath = join(root, 'broker-signing.pem'); const publicPath = join(root, 'broker-public.pem');
  requireThat(existsSync(privatePath) === existsSync(publicPath), 'broker_identity_incomplete', 409);
  if (existsSync(privatePath)) {
    let matches = false; try { matches = createPublicKey(loaded.config.signingPrivateKey).export({ type: 'spki', format: 'pem' }) === loaded.config.signingPublicKey; } catch { /* Refuse damaged identity files without replacing them. */ }
    requireThat(matches, 'broker_identity_invalid', 409);
  } else {
    const identity = generateResponseIdentity();
    writePrivate(privatePath, identity.privateKey, { exclusive: true }); writePrivate(publicPath, identity.publicKey, { exclusive: true });
  }
  return { brokerPublicKeyFile: publicPath, restartRequired: true };
}
export function addDevice(configPath, { id, label, port, tokenFile }) {
  identifier(id); string(label, 80); number(port, 1024, 65535); const path = resolve(configPath); assertOffline(path); const loaded = loadConfiguration(path); requireThat(!loaded.config.devices.some((device) => device.id === id), 'device_exists', 409); requireThat(loaded.config.devices.length < 16, 'device_limit', 409);
  assertPrivate(tokenFile); const nativeToken = readFileSync(tokenFile, 'utf8').trim(); requireThat(nativeToken.length >= 24 && nativeToken.length <= 256 && !/\s/u.test(nativeToken), 'invalid_token');
  const raw = JSON.parse(readFileSync(path, 'utf8')); const key = Buffer.from(readFileSync(join(dirname(path), 'key'), 'utf8').trim(), 'base64');
  raw.devices.push({ id, label, port, encryptedToken: encrypt(nativeToken, key) }); writePrivate(path, JSON.stringify(raw, null, 2));
  return { id, label, restartRequired: true };
}
export function assertOffline(configPath) {
  const lock = join(dirname(resolve(configPath)), 'broker.lock'); if (!existsSync(lock)) return;
  assertPrivate(lock); let pid; try { pid = JSON.parse(readFileSync(lock, 'utf8')).pid; requireThat(Number.isInteger(pid) && pid > 0); } catch { throw new Fault('broker_lock_invalid', 409); }
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { unlinkSync(lock); return; } }
  throw new Fault('broker_must_be_stopped', 409);
}
export function acquireLock(configPath) {
  assertOffline(configPath); const path = join(dirname(resolve(configPath)), 'broker.lock'); writePrivate(path, JSON.stringify({ pid: process.pid }), { exclusive: true }); let released = false;
  return () => { if (!released) { released = true; unlinkSync(path); } };
}
export function updateDeviceToken(configPath, { id, tokenFile }) {
  identifier(id); const path = resolve(configPath); assertOffline(path); const loaded = loadConfiguration(path); requireThat(loaded.config.devices.some((device) => device.id === id), 'device_not_found', 404);
  assertPrivate(tokenFile); const nativeToken = readFileSync(tokenFile, 'utf8').trim(); requireThat(nativeToken.length >= 24 && nativeToken.length <= 256 && !/\s/u.test(nativeToken), 'invalid_token');
  for (const session of loaded.state.sessions) if (session.deviceId === id && !session.revokedAt) session.revokedAt = new Date().toISOString(); loaded.save(loaded.state);
  const raw = JSON.parse(readFileSync(path, 'utf8')); const key = Buffer.from(readFileSync(join(dirname(path), 'key'), 'utf8').trim(), 'base64'); raw.devices.find((device) => device.id === id).encryptedToken = encrypt(nativeToken, key); writePrivate(path, JSON.stringify(raw, null, 2));
  return { id, sessionsRevoked: true, restartRequired: true };
}
