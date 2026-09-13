// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, symlinkSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, randomBytes } from 'node:crypto';
import { initialize, loadConfiguration, provisionBrokerIdentity, addDevice, updateDeviceToken, acquireLock, assertPrivate, encrypt, decrypt, writePrivate, digest } from '../src/security.mjs';

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
