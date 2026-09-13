// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker } from '../src/broker.mjs';
import { harness, APP, deferred } from './helpers.mjs';

test('restart durably revokes previous sessions and quarantines devices before any fresh dispatch', async () => {
  const h = harness(); const { credential } = h.grant(); let saved; let dispatches = 0;
  const broker = new Broker({ config: h.config, state: h.saved(), save: (state) => { saved = structuredClone(state); }, fetchImpl: async () => { dispatches++; throw new Error('must not dispatch'); } });
  const actor = broker.authenticate(`Bearer ${credential.token}`);
  assert.ok(saved.sessions[0].revokedAt); assert.deepEqual(saved.uncertainDevices, ['phone']);
  await assert.rejects(broker.call(actor, h.makeCall('app.launch', { packageName: APP })), { code: 'session_expired' });
  const next = broker.createSession(h.owner, { deviceId: 'phone', apps: [APP], operations: ['app.launch'], ttlSeconds: 600 }).session;
  await assert.rejects(broker.call(actor, h.makeCall('app.launch', { packageName: APP }, { sessionId: next.id })), { code: 'device_outcome_unknown' });
  assert.equal(dispatches, 0);
});

test('startup fails closed if previous authority cannot be revoked durably', () => {
  const h = harness();
  assert.throws(() => new Broker({ config: h.config, state: h.saved(), save: () => { throw new Error('secret disk failure'); } }), { code: 'persistence_unavailable' });
});

test('scoped Stop interrupts a pending read, clears private views and revokes device sessions', async () => {
  const gate = deferred(); let aborted = false;
  const h = harness({ handler: (body, init) => { if (body.method === 'stop') return { status: 'stopped' }; init.signal.addEventListener('abort', () => { aborted = true; }); return gate.promise; } });
  const actor = h.grant({ operations: ['observe', 'stop'] }).actor;
  const pending = h.broker.call(actor, h.makeCall('observe'));
  const stopped = await h.broker.call(actor, h.makeCall('stop'));
  assert.equal(stopped.status, 'completed'); assert.equal(aborted, true);
  assert.deepEqual(h.calls.map((call) => call.method), ['observe', 'stop']);
  gate.resolve(h.makeObservation()); assert.equal((await pending).status, 'rejected');
  assert.equal(h.broker.observations.size, 0); assert.ok(h.broker.data.sessions[0].revokedAt);
});

test('scoped Stop preserves unknown if the native gesture may finish or stop transport fails', async () => {
  for (const handler of [() => ({ status: 'stopped', inFlightGestureMayFinish: true }), () => { throw new Error('private transport text'); }]) {
    const h = harness({ handler }); const result = await h.broker.call(h.grant({ operations: ['stop'] }).actor, h.makeCall('stop'));
    assert.equal(result.status, 'unknown'); assert.equal(result.result, undefined); assert.equal(result.error.code, 'outcome_unknown');
    assert.equal(h.broker.state(h.owner).devices[0].actionState, 'unknown');
  }
});

test('scoped Stop bypasses failed persistence and ledger capacity while preserving authorization', async () => {
  let fail = false; const h = harness({ save: () => { if (fail) throw new Error('disk full'); } });
  const actor = h.grant({ operations: ['stop'] }).actor; const observer = h.grant({ operations: ['observe'] }).actor;
  h.broker.data.receipts = Array.from({ length: 4096 }, (_, index) => ({ key: `full${index}`, retainUntil: h.time() + 60000 }));
  fail = true; assert.throws(() => h.broker.persist(), { code: 'persistence_unavailable' });
  await assert.rejects(h.broker.call(observer, h.makeCall('stop')), { code: 'scope_forbidden' });
  const result = await h.broker.call(actor, h.makeCall('stop')); assert.equal(result.status, 'unknown');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, 'stop');
});

test('read replay expires from capture time, not delayed delivery time', async () => {
  const h = harness(); const actor = h.grant().actor;
  h.setHandler(() => h.makeObservation({ capturedAt: h.time() - 29000 }));
  const call = h.makeCall('observe'); const result = await h.broker.call(actor, call);
  assert.equal(result.status, 'observed'); h.advance(1001);
  await assert.rejects(h.broker.call(actor, call), { code: 'observation_expired' }); assert.equal(h.calls.length, 1);
});

test('optional session bindings cannot be widened by discovering a new matching session', async () => {
  const h = harness(); const { actor, credential } = h.grant({ sessionIds: [h.session.id] });
  const second = h.broker.createSession(h.owner, { deviceId: 'phone', apps: [APP], operations: ['describe', 'stop'], ttlSeconds: 600 }).session;
  assert.deepEqual(credential.sessionIds, [h.session.id]); assert.deepEqual(h.broker.state(actor).sessions.map((session) => session.id), [h.session.id]);
  assert.equal((await h.broker.call(actor, h.makeCall('describe'))).status, 'observed');
  for (const method of ['describe', 'stop']) await assert.rejects(h.broker.call(actor, h.makeCall(method, {}, { sessionId: second.id })), { code: 'scope_forbidden' });
  assert.equal(h.calls.length, 1);
  assert.equal((await h.broker.call(h.grant().actor, h.makeCall('describe', {}, { sessionId: second.id }))).status, 'observed');
});

test('session bindings reject empty, duplicate, nonexistent, expired and wrong-device grants', () => {
  const h = harness();
  for (const sessionIds of [[], [h.session.id, h.session.id]]) assert.throws(() => h.grant({ sessionIds }), { code: 'invalid_request' });
  for (const overrides of [{ sessionIds: ['missing'] }, { sessionIds: [h.session.id], devices: ['other'] }]) assert.throws(() => h.grant(overrides), { code: 'session_forbidden' });
  h.advance(600001); assert.throws(() => h.grant({ sessionIds: [h.session.id] }), { code: 'session_forbidden' });
});

const semantics = { resourceId: `${APP}:id/list`, className: 'android.widget.ScrollView', enabled: true, scrollable: true, checkable: true, selected: false, checkedState: 'mixed', stateDescription: 'untrusted-state-canary', hintText: 'untrusted-hint-canary', actions: ['scrollForward', 'scrollBackward'] };

test('contradictory native receipts and unrecognized errors cannot claim a mutation had no effect', async () => {
  for (const fields of [{ result: { status: 'dispatched' }, error: { code: 'consent_denied' } }, { error: { code: 'unknown_future_post_dispatch_failure', message: 'private-native-canary' } }]) {
    const h = harness({ handler: (body) => Response.json({ id: body.id, ...fields }) });
    const result = await h.broker.call(h.grant().actor, h.makeCall('app.launch', { packageName: APP }));
    assert.equal(result.status, 'unknown'); assert.equal(h.broker.state(h.owner).devices[0].actionState, 'unknown'); assert.equal(JSON.stringify(h.saved()).includes('private-native-canary'), false);
  }
});

test('bounded semantic observations preserve useful state without persisting untrusted content', async () => {
  const h = harness(); h.setHandler(() => { const value = h.makeObservation(); Object.assign(value.nodes[0], semantics, { arbitrary: 'discard' }); return value; });
  const result = await h.broker.call(h.grant().actor, h.makeCall('observe'));
  for (const [key, value] of Object.entries(semantics)) assert.deepEqual(result.result.nodes[0][key], value);
  assert.equal(result.result.nodes[0].arbitrary, undefined);
  assert.equal(JSON.stringify(h.saved()).includes('untrusted-state-canary'), false); assert.equal(JSON.stringify(h.saved()).includes('untrusted-hint-canary'), false);
});

test('malformed semantic states and action lists fail closed without returning partial screen data', async () => {
  for (const bad of [{ enabled: 'true' }, { scrollable: 1 }, { checkedState: 'maybe' }, { resourceId: 'x'.repeat(257) }, { stateDescription: 'x'.repeat(257) }, { actions: ['shell'] }, { actions: ['click', 'click'] }, { actions: null }]) {
    const h = harness(); h.setHandler(() => { const value = h.makeObservation(); Object.assign(value.nodes[0], bad); return value; });
    const result = await h.broker.call(h.grant().actor, h.makeCall('observe')); assert.equal(result.status, 'rejected'); assert.equal(result.error.code, 'native_response_invalid'); assert.equal(result.result, undefined);
  }
});

test('node.scroll requires explicit enabled, scrollable, direction-bound observed actions and invalidates snapshots', async () => {
  const h = harness(); h.setHandler((body) => { if (body.method !== 'observe') return; const value = h.makeObservation(); Object.assign(value.nodes[0], semantics, { actions: ['scrollForward'] }); return value; });
  const actor = h.grant().actor; const observed = await h.broker.call(actor, h.makeCall('observe')); const params = { observationId: observed.result.observationId, nodeId: 'n_0', direction: 'forward' };
  for (const overrides of [{ direction: 'backward' }, { nodeId: 'forged' }]) await assert.rejects(h.broker.call(actor, h.makeCall('node.scroll', { ...params, ...overrides })), { code: 'node_not_scrollable' });
  assert.equal((await h.broker.call(actor, h.makeCall('node.scroll', params))).status, 'completed');
  assert.equal(h.calls.at(-1).params.expectedPackage, APP); assert.ok(h.calls.at(-1).params.deadlineAt);
  await assert.rejects(h.broker.call(actor, h.makeCall('node.scroll', params)), { code: 'stale_observation' });
  for (const fields of [{ enabled: false }, { scrollable: false }, { actions: [] }]) {
    h.setHandler(() => { const value = h.makeObservation(); Object.assign(value.nodes[0], semantics, fields); return value; });
    const fresh = await h.broker.call(actor, h.makeCall('observe'));
    await assert.rejects(h.broker.call(actor, h.makeCall('node.scroll', { ...params, observationId: fresh.result.observationId })), { code: 'node_not_scrollable' });
  }
});
