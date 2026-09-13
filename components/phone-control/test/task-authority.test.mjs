// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Broker } from '../src/broker.mjs';
import { generateResponseIdentity, requestHash, bodyHash, verifyHttpResponse } from '../src/response-proof.mjs';
import { harness, APP, PNG, SECRET, deferred, runningServer } from './helpers.mjs';

const start = (h, actor, overrides = {}) => h.broker.createTask(actor, { deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 60, maxActions: 4, ...overrides }).task;
const launch = (h, task, overrides = {}) => h.makeCall('app.launch', { packageName: APP }, { taskId: task.id, ...overrides });

test('screenshots need separate explicit owner session and credential disclosure grants, including owner calls', async () => {
  for (const sessionAllows of [false, true]) for (const credentialAllows of [false, true]) {
    const h = harness({ autoTasks: false, screenshots: sessionAllows });
    const { actor } = h.grant({ disclosure: { screenshots: credentialAllows } });
    const call = h.makeCall('observe', { includeScreenshot: true });
    if (sessionAllows && credentialAllows) assert.equal((await h.broker.call(actor, call)).result.screenshot.base64, PNG);
    else { await assert.rejects(h.broker.call(actor, call), { code: 'screenshot_forbidden' }); assert.equal(h.calls.length, 0); }
    assert.equal(h.broker.state(actor).sessions[0].disclosure.screenshots, sessionAllows && credentialAllows);
    const described = await h.broker.call(actor, h.makeCall('describe'));
    assert.equal(described.result.capabilities.screenshots, sessionAllows && credentialAllows);
  }
  const h = harness({ autoTasks: false, screenshots: false });
  const session = h.broker.createSession(h.owner, { deviceId: 'phone', apps: [APP], operations: ['observe'], ttlSeconds: 60 }).session;
  const credential = h.broker.createCredential(h.owner, { label: 'No disclosure grant', devices: ['phone'], apps: [APP], operations: ['observe'], ttlSeconds: 60 }).credential;
  assert.deepEqual(session.disclosure, { screenshots: false }); assert.deepEqual(credential.disclosure, { screenshots: false });
  await assert.rejects(h.broker.call(h.owner, h.makeCall('observe', { includeScreenshot: true })), { code: 'screenshot_forbidden' });
  const observed = await h.broker.call(h.broker.authenticate(`Bearer ${credential.token}`), h.makeCall('observe'));
  assert.equal(observed.result.screenshot, undefined); assert.equal(h.calls.at(-1).params.includeScreenshot, false);
  for (const disclosure of [true, {}, { screenshots: 'true' }, { screenshots: true, text: true }]) assert.throws(() => h.grant({ disclosure }), { code: 'invalid_request' });
});

test('revoked screenshot disclosure suppresses a capture already in flight', async () => {
  const gate = deferred(); const h = harness({ autoTasks: false, handler: () => gate.promise }); const { actor } = h.grant();
  const pending = h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true }));
  actor.credential.disclosure.screenshots = false; gate.resolve(h.makeObservation());
  const result = await pending; assert.equal(result.status, 'rejected'); assert.equal(result.error.code, 'screenshot_forbidden'); assert.equal(result.result, undefined);
  assert.equal(h.broker.observations.size, 0); assert.equal(JSON.stringify(h.saved()).includes(PNG), false);
});

test('every writer needs its own bounded task and competitors cannot inject between calls', async () => {
  const h = harness({ autoTasks: false }); const a = h.grant(); const b = h.grant();
  await assert.rejects(h.broker.call(a.actor, h.makeCall('app.launch', { packageName: APP })), { code: 'task_required' });
  const task = start(h, a.actor, { label: 'Claimed task label' });
  assert.throws(() => start(h, b.actor), { code: 'task_busy' }); assert.throws(() => start(h, a.actor), { code: 'task_busy' });
  await assert.rejects(h.broker.call(b.actor, launch(h, task)), { code: 'task_forbidden' });
  assert.equal((await h.broker.call(b.actor, h.makeCall('observe'))).status, 'observed');
  const first = launch(h, task); assert.equal((await h.broker.call(a.actor, first)).status, 'completed');
  assert.equal(h.broker.taskStatus(a.actor, task.id).task.actionsUsed, 1);
  assert.equal((await h.broker.call(a.actor, first)).status, 'completed'); assert.equal(h.broker.taskStatus(a.actor, task.id).task.actionsUsed, 1);
  assert.throws(() => start(h, b.actor), { code: 'task_busy' });
  assert.throws(() => h.broker.taskStatus(b.actor, task.id), { code: 'task_not_found' });
  assert.throws(() => h.broker.releaseTask(b.actor, task.id), { code: 'task_not_found' });
  assert.deepEqual(h.broker.state(b.actor).tasks, []); assert.equal(h.broker.state(a.actor).tasks[0].actorId, undefined);
  assert.equal(h.broker.state(h.owner).tasks[0].actorId, a.actor.id);
  assert.equal(h.broker.releaseTask(a.actor, task.id).task.status, 'completed');
  const next = start(h, b.actor); assert.equal(next.status, 'active'); assert.equal(next.outcome, 'unverified');
  await assert.rejects(h.broker.call(a.actor, launch(h, task)), { code: 'task_expired' });
});

test('task creation cannot widen source authority or cross a device/session and rejects unbounded inputs', async () => {
  const h = harness({ autoTasks: false }); const reader = h.grant({ operations: ['observe', 'stop'] });
  assert.throws(() => start(h, reader.actor), { code: 'operation_forbidden' });
  const writer = h.grant({ sessionIds: [h.session.id] });
  const other = h.broker.createSession(h.owner, { deviceId: 'other', apps: [APP], operations: ['app.launch'], ttlSeconds: 60 }).session;
  assert.throws(() => start(h, writer.actor, { deviceId: 'other', sessionId: other.id }), { code: 'scope_forbidden' });
  for (const overrides of [{ ttlSeconds: 0 }, { ttlSeconds: 301 }, { maxActions: 0 }, { maxActions: 101 }, { label: 'x'.repeat(81) }, { actorId: 'owner' }, { resourceId: 'unchecked-document' }]) assert.throws(() => start(h, writer.actor, overrides), { code: 'invalid_request' });
  const task = start(h, writer.actor); const otherSession = h.broker.createSession(h.owner, { deviceId: 'phone', apps: [APP], operations: ['app.launch'], ttlSeconds: 60 }).session;
  await assert.rejects(h.broker.call(writer.actor, launch(h, task, { sessionId: otherSession.id })), { code: 'scope_forbidden' }); assert.equal(h.calls.length, 0);
});

test('task budget counts dispatch attempts once and exact replay cannot replenish it', async () => {
  const h = harness({ autoTasks: false }); const { actor } = h.grant(); const task = start(h, actor, { maxActions: 1 });
  const call = launch(h, task); await h.broker.call(actor, call);
  await assert.rejects(h.broker.call(actor, launch(h, task)), { code: 'task_budget_exhausted' });
  assert.equal((await h.broker.call(actor, call)).status, 'completed'); assert.equal(h.calls.length, 1);
  assert.equal(h.broker.taskStatus(actor, task.id).task.actionsUsed, 1);
});

test('lease expiry limits native deadlines, requires new authority and invalidates old targets', async () => {
  const h = harness({ autoTasks: false }); const { actor } = h.grant({ ttlSeconds: 60 }); const task = start(h, actor, { ttlSeconds: 300 });
  assert.equal(Date.parse(task.expiresAt), h.time() + 60_000);
  await h.broker.call(actor, launch(h, task)); assert.ok(h.calls[0].params.deadlineAt <= Date.parse(task.expiresAt));
  h.broker.releaseTask(actor, task.id); const short = start(h, actor, { ttlSeconds: 1 });
  const observed = await h.broker.call(actor, h.makeCall('observe')); h.advance(1001);
  await assert.rejects(h.broker.call(actor, launch(h, short)), { code: 'task_expired' });
  assert.equal(h.broker.taskStatus(actor, short.id).task.status, 'expired');
  const next = start(h, actor);
  await assert.rejects(h.broker.call(actor, h.makeCall('node.click', { observationId: observed.result.observationId, nodeId: 'n_0' }, { taskId: next.id })), { code: 'stale_observation' });
});

test('in-flight and unknown tasks cannot be released or replaced even after the lease expires', async () => {
  const gate = deferred(); const h = harness({ autoTasks: false, handler: (body) => body.method === 'stop' ? { status: 'stopped' } : gate.promise });
  const { actor } = h.grant(); const task = start(h, actor, { ttlSeconds: 1 }); const call = launch(h, task);
  const pending = h.broker.call(actor, call); assert.throws(() => h.broker.releaseTask(h.owner, task.id), { code: 'device_busy' });
  assert.equal(h.broker.receiptStatus(actor, call.id).receipt.status, 'unknown'); h.advance(1001);
  assert.throws(() => start(h, actor), { code: 'device_busy' }); gate.resolve({ status: 'dispatched' });
  assert.equal((await pending).status, 'unknown');
  assert.throws(() => start(h, actor), { code: 'device_outcome_unknown' });
  assert.throws(() => h.broker.releaseTask(actor, task.id), { code: 'device_outcome_unknown' });
  assert.equal(h.broker.receiptStatus(actor, call.id).resumeAllowed, false); assert.equal(h.broker.state(h.owner).devices[0].actionState, 'unknown');
  assert.equal((await h.broker.stopDevice(h.owner, 'phone')).stopStatus, 'completed');
  assert.throws(() => start(h, actor), { code: 'session_expired' });
});

test('owner Stop bypasses the lease, aborts in-flight work, and revokes all task/session authority', async () => {
  const gate = deferred(); let aborted = false;
  const h = harness({ autoTasks: false, handler: (body, init) => { if (body.method === 'stop') return { status: 'stopped' }; init.signal.addEventListener('abort', () => { aborted = true; }); return gate.promise; } });
  const { actor } = h.grant(); const task = start(h, actor); const pending = h.broker.call(actor, launch(h, task));
  assert.equal((await h.broker.stopDevice(h.owner, 'phone')).stopStatus, 'completed'); assert.equal(aborted, true);
  assert.equal(h.broker.taskStatus(actor, task.id).task.status, 'revoked'); gate.resolve({ status: 'dispatched' });
  assert.equal((await pending).status, 'unknown'); assert.throws(() => start(h, actor), { code: 'session_expired' });
});

test('credential revocation ends its task and restart never restores an old task lease', async () => {
  const h = harness({ autoTasks: false }); const a = h.grant(); const task = start(h, a.actor);
  const restarted = new Broker({ config: h.config, state: h.saved(), save: () => {} });
  assert.equal(restarted.taskStatus(a.actor, task.id).task.status, 'interrupted');
  assert.equal(restarted.state(h.owner).devices[0].actionState, 'unknown');
  assert.throws(() => restarted.createTask(a.actor, { deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 60, maxActions: 2 }), { code: 'session_expired' });
  await h.broker.revokeCredential(h.owner, a.credential.id);
  assert.equal(h.broker.state(h.owner).tasks[0].status, 'revoked'); assert.throws(() => h.broker.taskStatus(a.actor, task.id), { code: 'unauthorized' });
});

test('receipt reconciliation is requester-scoped, read-only and never returns private observations or input', async () => {
  const h = harness({ autoTasks: false }); const a = h.grant(); const b = h.grant(); const task = start(h, a.actor);
  const observedCall = h.makeCall('observe', { includeScreenshot: true }); const observed = await h.broker.call(a.actor, observedCall);
  const seen = h.broker.receiptStatus(a.actor, observedCall.id); assert.equal(seen.receipt.status, 'observed'); assert.equal(seen.receipt.error, undefined);
  const call = h.makeCall('type', { observationId: observed.result.observationId, nodeId: 'n_0', text: 'private-document-edit' }, { taskId: task.id }); await h.broker.call(a.actor, call);
  const before = h.calls.length; const status = h.broker.receiptStatus(a.actor, call.id);
  assert.deepEqual(status, { receipt: { id: call.id, deviceId: 'phone', sessionId: h.session.id, taskId: task.id, method: 'type', status: 'completed', recordedAt: new Date(h.time()).toISOString(), completedAt: new Date(h.time()).toISOString() }, reconciliation: 'status_only', resumeAllowed: false });
  assert.throws(() => h.broker.receiptStatus(b.actor, call.id), { code: 'receipt_not_found' });
  assert.throws(() => h.broker.receiptStatus(a.actor, 'missing'), { code: 'receipt_not_found' });
  assert.equal(h.calls.length, before); for (const privateValue of [PNG, 'private-document-edit', 'private-screen-text']) assert.equal(JSON.stringify([seen, status, h.saved()]).includes(privateValue), false);
  const restarted = new Broker({ config: h.config, state: h.saved(), save: () => {} });
  assert.equal(restarted.receiptStatus(a.actor, call.id).receipt.status, 'completed'); assert.equal(restarted.receiptStatus(a.actor, call.id).resumeAllowed, false);
});

test('fresh broker-known predispatch refusals carry a signed marker bound to the entire HTTP exchange', async (t) => {
  const h = harness({ autoTasks: false }); const identity = generateResponseIdentity(); h.config.signingPrivateKey = identity.privateKey;
  const { actor, credential } = h.grant({ operations: ['observe'] }); const { origin } = await runningServer(t, h);
  const input = h.makeCall('app.launch', { packageName: APP }); const nonce = randomUUID();
  const response = await fetch(`${origin}/v1/call`, { method: 'POST', headers: { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json', 'x-phone-request-nonce': nonce }, body: JSON.stringify(input) });
  const text = await response.text(); const body = JSON.parse(text); const signature = response.headers.get('x-phone-response-signature');
  assert.equal(response.status, 403); assert.deepEqual(body.dispatch, { state: 'not_dispatched', requestHash: requestHash(input) });
  const fields = { publicKey: identity.publicKey, nonce, method: 'POST', path: '/v1/call', requestHash: requestHash(input), status: 403, bodyHash: bodyHash(text), signature };
  assert.equal(verifyHttpResponse(fields), true); assert.equal(verifyHttpResponse({ ...fields, nonce: randomUUID() }), false);
  assert.equal(verifyHttpResponse({ ...fields, requestHash: requestHash({ ...input, id: randomUUID() }) }), false);
  assert.equal(verifyHttpResponse({ ...fields, publicKey: generateResponseIdentity().publicKey }), false); assert.equal(h.calls.length, 0);
  assert.throws(() => h.broker.receiptStatus(actor, input.id), { code: 'receipt_not_found' });
});

test('a lost acknowledgement or replay conflict cannot become proof of no dispatch', async (t) => {
  const h = harness({ autoTasks: false }); h.config.signingPrivateKey = generateResponseIdentity().privateKey;
  const { actor, credential } = h.grant(); const task = start(h, actor); const input = launch(h, task);
  h.setHandler(() => { throw new Error('connection lost after possible dispatch'); }); assert.equal((await h.broker.call(actor, input)).status, 'unknown');
  const { origin } = await runningServer(t, h);
  for (const request of [{ ...input, params: { packageName: 'com.example.changed' } }, { ...input, sessionId: 'expired-session' }]) {
    const response = await fetch(`${origin}/v1/call`, { method: 'POST', headers: { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json', 'x-phone-request-nonce': randomUUID() }, body: JSON.stringify(request) });
    assert.ok(response.headers.get('x-phone-response-signature')); assert.equal((await response.json()).dispatch, undefined);
  }
  assert.equal(h.broker.receiptStatus(actor, input.id).receipt.status, 'unknown'); assert.equal(h.calls.length, 1);
});

test('HTTP task and receipt routes enforce requester scoping with no native forwarding', async (t) => {
  const h = harness({ autoTasks: false }); const a = h.grant(); const b = h.grant(); const { origin } = await runningServer(t, h);
  const headers = { authorization: `Bearer ${a.credential.token}`, 'content-type': 'application/json' };
  const created = await fetch(`${origin}/v1/tasks`, { method: 'POST', headers, body: JSON.stringify({ deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 5, maxActions: 1 }) }); const { task } = await created.json(); assert.equal(created.status, 200);
  const own = await fetch(`${origin}/v1/tasks/${task.id}`, { headers }); assert.equal((await own.json()).task.id, task.id);
  for (const path of [`tasks/${task.id}`, 'receipts/missing']) assert.equal((await fetch(`${origin}/v1/${path}`, { headers: { authorization: `Bearer ${b.credential.token}` } })).status, 404);
  const released = await fetch(`${origin}/v1/tasks/${task.id}`, { method: 'DELETE', headers }); assert.equal((await released.json()).task.status, 'completed'); assert.equal(h.calls.length, 0);
});

test('expired session requests remain unproven after their old ledger entries retire', async (t) => {
  const h = harness({ autoTasks: false }); h.config.signingPrivateKey = generateResponseIdentity().privateKey;
  const task = start(h, h.owner); const input = launch(h, task); await h.broker.call(h.owner, input);
  h.advance(86_400_000 + 600_001); h.broker.prune(); assert.equal(h.broker.data.receipts.length, 0);
  const { origin } = await runningServer(t, h);
  const response = await fetch(`${origin}/v1/call`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', 'x-phone-request-nonce': randomUUID() }, body: JSON.stringify(input) });
  assert.equal(response.status, 403); assert.ok(response.headers.get('x-phone-response-signature')); assert.equal((await response.json()).dispatch, undefined); assert.equal(h.calls.length, 1);
});

test('all state, task, receipt and mutation response bodies are authenticated before callers trust their authority', async (t) => {
  const h = harness({ autoTasks: false }); const { actor, credential } = h.grant(); const { origin } = await runningServer(t, h);
  const signed = async (path, method = 'GET', input) => {
    const nonce = randomUUID(); const request = input === undefined ? undefined : JSON.stringify(input, null, 2);
    const response = await fetch(`${origin}${path}`, { method, headers: { authorization: `Bearer ${credential.token}`, 'x-phone-request-nonce': nonce, ...(request ? { 'content-type': 'application/json' } : {}) }, ...(request ? { body: request } : {}) });
    const text = await response.text(); const fields = { publicKey: h.config.signingPublicKey, nonce, method, path, requestHash: bodyHash(request ?? ''), status: response.status, bodyHash: bodyHash(text), signature: response.headers.get('x-phone-response-signature') };
    assert.equal(verifyHttpResponse(fields), true, `${method} ${path}`);
    for (const tampered of [{ method: method === 'GET' ? 'POST' : 'GET' }, { path: '/v1/legal' }, { status: 403 }, { bodyHash: bodyHash('{}') }, { requestHash: bodyHash('altered input') }]) assert.equal(verifyHttpResponse({ ...fields, ...tampered }), false);
    return JSON.parse(text);
  };
  await signed('/v1/state');
  const { task } = await signed('/v1/tasks', 'POST', { deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 60, maxActions: 2 });
  await signed(`/v1/tasks/${task.id}`);
  const request = launch(h, task); assert.equal((await signed('/v1/call', 'POST', request)).status, 'completed');
  assert.equal((await signed(`/v1/receipts/${request.id}`)).receipt.status, 'completed');
  assert.equal((await signed(`/v1/tasks/${task.id}`, 'DELETE')).task.status, 'completed');
  assert.equal(h.broker.taskStatus(actor, task.id).task.outcome, 'unverified');
});
