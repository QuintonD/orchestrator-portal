// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, deferred, runningServer } from './helpers.mjs';
import { validateGrant, validateCall, intersectResourceScopes, narrowResourceScope, Fault } from '../src/validation.mjs';
import { PhonePilot } from '../src/pilot.mjs';
import { CALL_SCHEMA, RESOURCE_SCOPE_SCHEMA } from '../src/mcp.mjs';

const folder = (resourceIds = ['folder_a']) => ({ adapter: 'android.folder-drafts.v1', resourceIds, effects: ['draft.create'] });
const grant = resourceScope => ({ apps: [], operations: ['describe', 'stop', ...resourceScope.effects], resourceScope, ttlSeconds: 600 });
function setup({ sessionScope = folder(), credentialScope = folder(), ...options } = {}) {
  const h = harness({ autoTasks: false, ...options });
  const session = h.broker.createSession(h.owner, { deviceId: 'phone', ...grant(sessionScope) }).session;
  const credential = h.broker.createCredential(h.owner, { label: 'Draft agent', devices: ['phone'], sessionIds: [session.id], ...grant(credentialScope) }).credential;
  const actor = h.broker.authenticate(`Bearer ${credential.token}`);
  const acquire = (resourceScope, extra = {}) => h.broker.createTask(actor, { deviceId: 'phone', sessionId: session.id, ttlSeconds: 60, maxActions: 2, ...(resourceScope ? { resourceScope } : {}), ...extra }).task;
  const call = (method = 'draft.create', params = { resourceId: 'folder_a', text: 'Synthetic draft' }, taskId) => ({ id: randomUUID(), deviceId: 'phone', sessionId: session.id, method, params, ...(taskId ? { taskId } : {}) });
  return { ...h, session, credential, actor, acquire, call };
}

test('folder scopes grant only new drafts; broader operations and promises fail closed', () => {
  const input = { deviceId: 'phone', ...grant(folder()) };
  validateGrant(input, true);
  for (const patch of [
    { resourceScope: { ...folder(), effects: ['document.read'] } },
    { resourceScope: { ...folder(), effects: ['document.replace'] } },
    { resourceScope: { ...folder(), effects: ['draft.create', 'delete'] } },
    { resourceScope: { ...folder(), confirmation: false } },
    { resourceScope: { ...folder(), accountId: 'private' } },
    { resourceScope: folder(['*']) }, { apps: ['com.example.app'] },
    { operations: ['observe'] }, { operations: ['type'] },
    { disclosure: { screenshots: true } },
  ]) assert.throws(() => validateGrant({ ...input, ...patch }, true));
  for (const session of [true, false]) assert.throws(() => validateGrant({ ...(session ? { deviceId: 'phone' } : { label: 'Legacy', devices: ['phone'] }), apps: ['com.example.app'], operations: ['draft.create'], ttlSeconds: 600 }, session), { code: 'resource_scope_required' });
});

test('adapter identity is part of authority even when opaque resource handles match', () => {
  const document = { adapter: 'android.document.v1', resourceIds: ['folder_a'], effects: ['document.read'] };
  assert.throws(() => intersectResourceScopes(folder(), document), { code: 'resource_forbidden' });
  assert.throws(() => narrowResourceScope(folder(), document), { code: 'resource_scope_escalation' });
  const h = setup({ sessionScope: folder(['folder_a', 'folder_b']), credentialScope: folder(['folder_a', 'folder_c']) });
  assert.deepEqual(h.acquire().resourceScope, folder());
  assert.throws(() => h.acquire(folder(['folder_b'])), { code: 'resource_scope_escalation' });
  assert.throws(() => h.acquire(document), { code: 'resource_scope_escalation' });
  assert.deepEqual(h.broker.state(h.actor).sessions.find(item => item.id === h.session.id).resourceScope, folder());
});

test('folder create rejects names, paths, URIs, replacement flags and invalid text before native dispatch', async () => {
  const h = setup(); const task = h.acquire(); const input = h.call(undefined, undefined, task.id);
  for (const patch of [{ name: '../existing.txt' }, { uri: 'content://private' }, { path: '/existing' }, { overwrite: true }, { confirm: false }, { expectedRevision: '0'.repeat(64) }, { text: '\ud800' }, { text: 'a\0b' }, { text: 'x'.repeat(2001) }]) {
    await assert.rejects(h.broker.call(h.actor, { ...input, params: { ...input.params, ...patch } }));
  }
  validateCall({ ...input, params: { resourceId: 'folder_a', text: '😀\nDraft' } });
  assert.equal(h.calls.length, 0);
});

test('folder create requires task and exact folder; screen and existing-file access are denied', async () => {
  const h = setup(); const task = h.acquire();
  await assert.rejects(h.broker.call(h.actor, h.call()), { code: 'task_required' });
  await assert.rejects(h.broker.call(h.actor, h.call('draft.create', { resourceId: 'folder_b', text: 'x' }, task.id)), { code: 'resource_forbidden' });
  for (const [method, params] of [['document.read', { resourceId: 'folder_a' }], ['document.replace', { resourceId: 'folder_a', expectedRevision: '0'.repeat(64), text: 'x' }], ['observe', {}], ['app.launch', { packageName: 'com.example.app' }]]) {
    await assert.rejects(h.broker.call(h.actor, h.call(method, params, task.id)), { code: 'operation_forbidden' });
  }
  assert.equal(h.calls.length, 0);
  const described = await h.broker.call(h.actor, h.call('describe', {}));
  assert.deepEqual(described.result.methods.sort(), ['describe', 'draft.create', 'stop']);
  assert.equal(described.result.capabilities.resourceAdapter, 'android.folder-drafts.v1');
  assert.equal(described.result.capabilities.screenshots, false);
  assert.equal(described.result.capabilities.gestures, false);
});

test('new draft is one budgeted mutation with a deadline and no plaintext ledger or automatic replay', async () => {
  const h = setup({ handler: () => ({ status: 'completed', uri: 'private-provider-uri', text: 'private-provider-text' }) }); const task = h.acquire(undefined, { maxActions: 1 });
  const input = h.call('draft.create', { resourceId: 'folder_a', text: 'draft-content-canary' }, task.id);
  assert.deepEqual((await h.broker.call(h.actor, input)).result, { status: 'completed' });
  assert.equal((await h.broker.call(h.actor, input)).status, 'completed');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].params.deadlineAt > h.time(), true);
  await assert.rejects(h.broker.call(h.actor, { ...input, id: randomUUID() }), { code: 'task_budget_exhausted' });
  const persisted = JSON.stringify(h.saved());
  for (const canary of ['draft-content-canary', 'private-provider-uri', 'private-provider-text']) assert.equal(persisted.includes(canary), false);
  assert.equal(h.broker.readReceipts.size, 0);
});

test('lost or merely dispatched create acknowledgement latches uncertainty; Stop remains available', async () => {
  for (const result of [() => ({ status: 'dispatched' }), () => { throw new Error('lost acknowledgement'); }]) {
    const h = setup({ handler: body => body.method === 'stop' ? { status: 'stopped' } : result() }); const task = h.acquire();
    const input = h.call(undefined, undefined, task.id);
    assert.equal((await h.broker.call(h.actor, input)).status, 'unknown');
    assert.equal((await h.broker.call(h.actor, input)).status, 'unknown'); assert.equal(h.calls.length, 1);
    await assert.rejects(h.broker.call(h.actor, { ...input, id: randomUUID() }), { code: 'device_outcome_unknown' });
    assert.equal((await h.broker.call(h.actor, h.call('stop', {}))).status, 'completed');
  }
});

test('owner denial is a known rejection; revocation while creating cannot report success', async () => {
  const denied = setup({ handler: () => { throw new Fault('consent_denied', 422); } }); const deniedTask = denied.acquire();
  assert.equal((await denied.broker.call(denied.actor, denied.call(undefined, undefined, deniedTask.id))).status, 'rejected');
  assert.deepEqual(denied.broker.data.uncertainDevices, []);
  const waiting = deferred(); const h = setup({ handler: body => body.method === 'stop' ? { status: 'stopped' } : waiting.promise }); const task = h.acquire();
  const pending = h.broker.call(h.actor, h.call(undefined, undefined, task.id));
  await h.broker.revokeCredential(h.owner, h.credential.id); waiting.resolve({ status: 'completed' });
  assert.equal((await pending).status, 'unknown');
});

test('SDK creates signed scoped drafts without observing existing content', async t => {
  const h = setup({ handler: () => ({ status: 'completed' }) }); const { port } = await runningServer(t, h);
  const pilot = new PhonePilot({ port, secret: h.credential.token, brokerPublicKey: h.config.signingPublicKey, deviceId: 'phone', sessionId: h.session.id });
  assert.deepEqual((await pilot.acquireTask()).resourceScope, folder());
  assert.equal((await pilot.createDraft('folder_a', 'New draft')).status, 'completed');
  assert.deepEqual(h.calls.map(item => item.method), ['draft.create']);
  assert.equal(h.calls[0].params.observationId, undefined);
  assert.equal(pilot.usage.actions, 1); assert.equal(pilot.usage.observations, 0);
});

test('MCP publishes distinct strict adapters and requires task for draft creation', () => {
  assert.deepEqual(RESOURCE_SCOPE_SCHEMA.oneOf.map(item => item.properties.adapter.const), ['android.folder-drafts.v1', 'android.document.v1']);
  const branch = CALL_SCHEMA.oneOf.find(item => item.properties.method.const === 'draft.create');
  assert.equal(branch.required.includes('taskId'), true);
  assert.equal(branch.properties.params.additionalProperties, false);
  assert.deepEqual(Object.keys(branch.properties.params.properties), ['resourceId', 'text']);
});
