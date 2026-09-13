// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { harness, runningServer, SECRET, APP } from './helpers.mjs';

async function raw(origin, { method = 'GET', path = '/v1/state', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${origin}${path}`, { method, headers: { authorization: `Bearer ${SECRET}`, ...headers } }, (response) => { const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })); });
    request.on('error', reject); if (body !== undefined) request.write(body); request.end();
  });
}
test('loopback HTTP rejects Origin, hostile Host, forged authority, query routes and missing tokens', async (t) => {
  const h = harness(); const { origin } = await runningServer(t, h);
  for (const headers of [{ origin: 'http://localhost' }, { origin: 'null' }, { host: 'evil.test' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await raw(origin, { headers })).status, 403);
  assert.equal((await raw(origin, { headers: { authorization: 'Bearer fake' } })).status, 401);
  assert.equal((await raw(origin, { headers: { authorization: undefined } }).catch(() => ({ status: 'header invalid' }))).status, 'header invalid');
  assert.equal((await raw(origin, { path: '/v1/state?admin=true' })).status, 404);
  const state = await raw(origin); assert.equal(state.status, 200); assert.equal(state.headers['cache-control'], 'no-store'); assert.equal(state.headers['access-control-allow-origin'], undefined); assert.equal(JSON.stringify(state.body).includes('native-secret'), false);
});

test('scoped HTTP credentials cannot manage themselves or forge identity in call envelopes', async (t) => {
  const h = harness(); const { credential } = h.grant(); const { origin } = await runningServer(t, h); const headers = { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json' };
  for (const [method, path, body] of [['POST', '/v1/credentials', '{}'], ['POST', '/v1/sessions', '{}'], ['DELETE', `/v1/credentials/${credential.id}`, undefined], ['GET', '/v1/audit', undefined], ['POST', '/v1/devices/phone/stop', '{}']]) assert.equal((await raw(origin, { method, path, headers, body })).status, 403, path);
  const forged = h.makeCall('observe', {}, { actorId: 'owner', admin: true }); const result = await raw(origin, { method: 'POST', path: '/v1/call', headers, body: JSON.stringify(forged) }); assert.equal(result.status, 400); assert.equal(h.calls.length, 0);
});

test('HTTP rejects malformed, oversized and wrong-content-type bodies before native forwarding', async (t) => {
  const h = harness(); const { origin } = await runningServer(t, h);
  for (const [body, type, expected] of [['{', 'application/json', 400], ['[]', 'application/json', 400], ['null', 'application/json', 400], ['{}', 'text/plain', 415], ['a'.repeat(16385), 'application/json', 413], [JSON.stringify(h.makeCall('observe', { shell: 'rm -rf /' })), 'application/json', 400]]) {
    const result = await raw(origin, { method: 'POST', path: '/v1/call', headers: { 'content-type': type, 'content-length': Buffer.byteLength(body) }, body }); assert.equal(result.status, expected);
  }
  assert.equal(h.calls.length, 0);
  const invalidUtf8 = Buffer.concat([Buffer.from('{"data":"'), Buffer.from([255]), Buffer.from('"}')]);
  assert.equal((await raw(origin, { method: 'POST', path: '/v1/call', headers: { 'content-type': 'application/json', 'content-length': invalidUtf8.length }, body: invalidUtf8 })).status, 400);
});

test('rate limits are per credential and owner stop remains available after exhausting owner budget', async (t) => {
  const h = harness(); const { credential } = h.grant(); const { origin } = await runningServer(t, h);
  for (let index = 0; index < 30; index++) assert.equal((await raw(origin, { headers: { authorization: `Bearer ${credential.token}` } })).status, 200);
  assert.equal((await raw(origin, { headers: { authorization: `Bearer ${credential.token}` } })).status, 429);
  h.broker.rateBuckets.set('owner', { tokens: 0, at: h.time() }); assert.equal((await raw(origin)).status, 429);
  const stop = await raw(origin, { method: 'POST', path: '/v1/devices/phone/stop', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(stop.status, 200); assert.equal(stop.body.stopStatus, 'completed');
});

test('HTTP owner can create/list/revoke scopes and sessions without exposing persisted tokens', async (t) => {
  const h = harness(); const { origin } = await runningServer(t, h); const headers = { 'content-type': 'application/json' };
  const made = await raw(origin, { method: 'POST', path: '/v1/credentials', headers, body: JSON.stringify({ label: 'Console', devices: ['phone'], apps: [APP], operations: ['observe'], ttlSeconds: 600 }) }); assert.equal(made.status, 200); assert.ok(made.body.credential.token);
  const listed = await raw(origin, { path: '/v1/credentials' }); assert.equal(listed.body.credentials[0].token, undefined); assert.equal(listed.body.credentials[0].tokenHash, undefined);
  const grant = await raw(origin, { method: 'POST', path: '/v1/sessions', headers, body: JSON.stringify({ deviceId: 'phone', apps: [APP], operations: ['observe'], ttlSeconds: 600 }) }); assert.equal(grant.status, 200);
  assert.equal((await raw(origin, { method: 'DELETE', path: `/v1/credentials/${made.body.credential.id}` })).body.revoked, true);
  assert.equal((await raw(origin, { method: 'DELETE', path: `/v1/sessions/${grant.body.session.id}` })).body.revoked, true);
  const legal = await raw(origin, { path: '/v1/legal' }); assert.equal(legal.body.source, 'https://github.com/QuintonD/orchestrator-portal'); assert.equal(legal.body.license, 'AGPL-3.0-only');
});

test('authorized scoped HTTP Stop survives exhausted rate budget while other calls remain limited', async (t) => {
  const h = harness(); const { actor, credential } = h.grant(); const { origin } = await runningServer(t, h);
  h.broker.rateBuckets.set(actor.id, { tokens: 0, at: h.time() });
  const headers = { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json' };
  assert.equal((await raw(origin, { method: 'POST', path: '/v1/call', headers, body: JSON.stringify(h.makeCall('observe')) })).status, 429);
  const stop = await raw(origin, { method: 'POST', path: '/v1/call', headers, body: JSON.stringify(h.makeCall('stop')) });
  assert.equal(stop.status, 200); assert.equal(stop.body.status, 'completed'); assert.deepEqual(h.calls.map((call) => call.method), ['stop']);
});
