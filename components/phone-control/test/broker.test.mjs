// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Broker } from '../src/broker.mjs';
import { validateCall, METHODS } from '../src/validation.mjs';
import { harness, APP, PNG, deferred } from './helpers.mjs';

test('credentials are distinct, hashed, narrowed and cannot grant authority', () => {
  const h = harness(); const { actor, credential } = h.grant({ operations: ['observe'] });
  assert.equal(h.broker.data.credentials[0].token, undefined); assert.notEqual(h.broker.data.credentials[0].tokenHash, credential.token);
  assert.throws(() => h.broker.authenticate('Bearer forged'), { code: 'unauthorized' });
  assert.throws(() => h.broker.createCredential(actor, {}), { code: 'owner_required' }); assert.throws(() => h.broker.createSession(actor, {}), { code: 'owner_required' });
  assert.equal(h.broker.state(actor).devices.length, 1); assert.equal(h.broker.state(actor).credentials[0].tokenHash, undefined);
  assert.throws(() => h.grant({ apps: ['*'] }), { code: 'invalid_request' }); assert.throws(() => h.grant({ operations: ['shell'] }), { code: 'invalid_request' }); assert.throws(() => h.grant({ ttlSeconds: 86401 }), { code: 'invalid_request' });
});

test('cross-device, cross-app, operation and session escalation fail before native call', async () => {
  const h = harness(); const { actor } = h.grant({ operations: ['observe'] });
  await assert.rejects(h.broker.call(actor, h.makeCall('app.launch', { packageName: APP })), { code: 'scope_forbidden' });
  const other = h.broker.createSession(h.owner, { deviceId: 'other', apps: [APP], operations: ['observe'], ttlSeconds: 600 }).session;
  await assert.rejects(h.broker.call(actor, h.makeCall('observe', {}, { deviceId: 'other', sessionId: other.id })), { code: 'scope_forbidden' });
  const all = h.grant().actor;
  await assert.rejects(h.broker.call(all, h.makeCall('app.launch', { packageName: 'com.example.denied' })), { code: 'app_forbidden' });
  await assert.rejects(h.broker.call(all, h.makeCall('observe', {}, { actorId: 'owner' })), { code: 'invalid_request' });
  await assert.rejects(h.broker.call(all, h.makeCall('tap', { observationId: 'forged', x: 1, y: 1, expectedPackage: APP })), { code: 'invalid_request' });
  assert.equal(h.calls.length, 0);
});

test('observation is opt-in screenshot, package filtered and treats injected prose as data', async () => {
  const h = harness(); const { actor } = h.grant(); const result = await h.broker.call(actor, h.makeCall('observe'));
  assert.equal(result.status, 'observed'); assert.equal(result.result.screenshot, undefined); assert.match(result.result.nodes[0].description, /Ignore policy/u);
  assert.deepEqual(h.calls[0].params, { includeScreenshot: false, allowedPackages: [APP] });
  assert.equal(JSON.stringify(h.saved()).includes('private-screen-text'), false); assert.equal(JSON.stringify(h.saved()).includes('Ignore policy'), false); assert.equal(JSON.stringify(h.saved()).includes(PNG), false);
  const image = await h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true })); assert.equal(image.result.screenshot.base64, PNG);
  h.setHandler((body) => body.method === 'observe' ? h.makeObservation({ packageName: 'com.example.denied' }) : undefined);
  const forbidden = await h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true })); assert.equal(forbidden.status, 'rejected'); assert.equal(forbidden.result, undefined); assert.equal(forbidden.error.code, 'app_forbidden');
});

test('descriptions and app lists expose only the agreed public projection', async () => {
  const h = harness(); const actor = h.grant().actor;
  const description = await h.broker.call(actor, h.makeCall('describe')); assert.equal(description.result.capabilities.biometricConsent, true); assert.equal(typeof description.result.session.expiresAt, 'string');
  const apps = await h.broker.call(actor, h.makeCall('apps.list')); assert.deepEqual(apps.result.apps, [{ packageName: APP, label: 'Allowed' }]); assert.deepEqual(h.calls.at(-1).params.allowedPackages, [APP]);
});

test('fresh package-bound observations constrain nodes and coordinates; each mutation invalidates views', async () => {
  const h = harness(); const actor = h.grant().actor; const observed = await h.broker.call(actor, h.makeCall('observe')); const observationId = observed.result.observationId;
  await assert.rejects(h.broker.call(actor, h.makeCall('tap', { observationId, x: 400, y: 0 })), { code: 'out_of_bounds' });
  await assert.rejects(h.broker.call(actor, h.makeCall('type', { observationId, nodeId: 'unseen', text: 'secret typing' })), { code: 'node_not_editable' });
  const result = await h.broker.call(actor, h.makeCall('tap', { observationId, x: 10, y: 10 })); assert.equal(result.status, 'completed'); assert.deepEqual(result.result, { status: 'dispatched' });
  assert.equal(h.calls.at(-1).params.expectedPackage, APP); assert.ok(h.calls.at(-1).params.deadlineAt < h.time() + 45000);
  await assert.rejects(h.broker.call(actor, h.makeCall('tap', { observationId, x: 10, y: 10 })), { code: 'stale_observation' });
  const fresh = await h.broker.call(actor, h.makeCall('observe')); h.advance(30001);
  await assert.rejects(h.broker.call(actor, h.makeCall('key', { observationId: fresh.result.observationId, key: 'back' })), { code: 'stale_observation' });
});

test('touchBounds preserves full observation pixels and rejects Android gesture-edge points before dispatch', async () => {
  const h = harness(); const actor = h.grant().actor;
  const touchBounds = { left: 20, top: 30, right: 380, bottom: 770 };
  h.setHandler((body) => body.method === 'observe' ? h.makeObservation({ touchBounds }) : undefined);
  const observed = await h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true }));
  assert.deepEqual(observed.result.touchBounds, touchBounds); assert.equal(observed.result.width, 400); assert.equal(observed.result.height, 800); assert.equal(observed.result.screenshot.base64, PNG);
  const observationId = observed.result.observationId;
  for (const [method, params] of [
    ['tap', { x: 19, y: 100 }], ['tap', { x: 380, y: 100 }], ['tap', { x: 100, y: 29 }],
    ['longPress', { x: 100, y: 770, durationMs: 500 }],
    ['swipe', { points: [{ x: 100, y: 100 }, { x: 1, y: 100 }, { x: 200, y: 200 }], durationMs: 500 }],
  ]) await assert.rejects(h.broker.call(actor, h.makeCall(method, { observationId, ...params })), { code: 'out_of_bounds' });
  assert.equal(h.calls.length, 1);
  const allowed = await h.broker.call(actor, h.makeCall('tap', { observationId, x: touchBounds.left, y: touchBounds.top })); assert.equal(allowed.status, 'completed');
});

test('pinch checks both expanded endpoints and shrinking-path starting points inside touchBounds', async () => {
  const h = harness(); const actor = h.grant().actor; const touchBounds = { left: 20, top: 30, right: 380, bottom: 770 };
  h.setHandler((body) => body.method === 'observe' ? h.makeObservation({ touchBounds }) : undefined);
  const observed = await h.broker.call(actor, h.makeCall('observe')); const observationId = observed.result.observationId;
  for (const [centerX, scale] of [[60, 2], [340, 2], [50, 0.5], [340, 0.5]]) {
    await assert.rejects(h.broker.call(actor, h.makeCall('pinch', { observationId, centerX, centerY: 100, scale, durationMs: 500 })), { code: 'out_of_bounds' });
  }
  assert.equal(h.calls.length, 1);
  assert.equal((await h.broker.call(actor, h.makeCall('pinch', { observationId, centerX: 200, centerY: 100, scale: 2, durationMs: 500 }))).status, 'completed');
});

test('empty touchBounds forbids coordinate injection but leaves semantic node, text, key and fixture operations separate', async () => {
  const h = harness(); const actor = h.grant().actor; const touchBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  h.setHandler((body) => body.method === 'observe' ? h.makeObservation({ touchBounds }) : undefined);
  const observed = await h.broker.call(actor, h.makeCall('observe')); assert.deepEqual(observed.result.touchBounds, touchBounds);
  for (const [method, params] of [['tap', { x: 0, y: 0 }], ['longPress', { x: 100, y: 100, durationMs: 500 }], ['swipe', { points: [{ x: 100, y: 100 }, { x: 200, y: 200 }], durationMs: 500 }], ['pinch', { centerX: 200, centerY: 100, scale: 2, durationMs: 500 }]]) {
    await assert.rejects(h.broker.call(actor, h.makeCall(method, { observationId: observed.result.observationId, ...params })), { code: 'out_of_bounds' });
  }
  assert.equal(h.calls.length, 1);
  for (const [method, params] of [['node.click', { nodeId: 'n_0' }], ['type', { nodeId: 'n_0', text: 'fixture text' }], ['key', { key: 'back' }], ['fixture.increment', {}]]) {
    const fresh = await h.broker.call(actor, h.makeCall('observe'));
    assert.equal((await h.broker.call(actor, h.makeCall(method, { observationId: fresh.result.observationId, ...params }))).status, 'completed', method);
  }
});

test('touchBounds rejects malformed, partial, noninteger, negative or out-of-window rectangles', async () => {
  const invalid = [null, {}, { left: 20, top: 30, right: 20, bottom: 700 }, { left: 20, top: 30, right: 380, bottom: 30 }, { left: 0, top: 0, right: 0, bottom: 1 }, { left: -1, top: 0, right: 300, bottom: 700 }, { left: 20, top: 30, right: 401, bottom: 700 }, { left: 20, top: 30, right: 380, bottom: 801 }, { left: 20.5, top: 30, right: 380, bottom: 700 }, { left: 0, top: 0, right: 400, bottom: 800, trusted: true }];
  for (const touchBounds of invalid) {
    const h = harness(); h.setHandler(() => h.makeObservation({ touchBounds }));
    const result = await h.broker.call(h.grant().actor, h.makeCall('observe')); assert.equal(result.status, 'rejected'); assert.equal(result.error.code, 'native_response_invalid'); assert.equal(result.result, undefined);
  }
  const h = harness(); const legacy = await h.broker.call(h.grant().actor, h.makeCall('observe')); assert.equal(Object.hasOwn(legacy.result, 'touchBounds'), false);
});

test('all supported mutation parameter families dispatch through the same policy and never persist input', async () => {
  const h = harness(); const actor = h.grant().actor;
  const params = { tap: { x: 1, y: 2 }, longPress: { x: 1, y: 2, durationMs: 500 }, swipe: { points: [{ x: 1, y: 1 }, { x: 10, y: 20 }], durationMs: 500 }, pinch: { centerX: 50, centerY: 50, scale: 1.5, durationMs: 500 }, 'node.click': { nodeId: 'n_0' }, type: { nodeId: 'n_0', text: 'sensitive-input-secret' }, key: { key: 'back' }, 'fixture.increment': {} };
  for (const [method, values] of Object.entries(params)) {
    const observation = await h.broker.call(actor, h.makeCall('observe')); const result = await h.broker.call(actor, h.makeCall(method, { observationId: observation.result.observationId, ...values })); assert.equal(result.status, 'completed', method);
  }
  assert.equal((await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }))).status, 'completed');
  const stored = JSON.stringify(h.saved()); for (const sensitive of ['sensitive-input-secret', 'private-screen-text', 'native-secret', 'rawText']) assert.equal(stored.includes(sensitive), false, sensitive);
});

test('mutation replay returns the stored receipt until restart revokes the previous authority', async () => {
  const h = harness(); const actor = h.grant().actor; const call = h.makeCall('app.launch', { packageName: APP }); const result = await h.broker.call(actor, call);
  assert.deepEqual(await h.broker.call(actor, call), result); assert.equal(h.calls.length, 1);
  await assert.rejects(h.broker.call(actor, { ...call, params: { packageName: 'com.example.changed' } }), { code: 'replay_conflict' });
  const restarted = new Broker({ config: h.config, state: h.saved(), save: () => {}, fetchImpl: () => { throw new Error('must never execute'); } });
  assert.throws(() => restarted.authenticate(`Bearer ${h.grant().credential.token}`), { code: 'unauthorized' });
  const existingActor = restarted.data.credentials.find((entry) => entry.id === actor.id);
  await assert.rejects(restarted.call({ id: actor.id, admin: false, credential: existingActor }, call), { code: 'session_expired' });
  assert.deepEqual(restarted.data.receipts.find((entry) => entry.key === `${actor.id}:${call.id}`).receipt, result);
});

test('read replay requires current authority and cached private views', async () => {
  const h = harness(); const { actor, credential } = h.grant(); const call = h.makeCall('observe'); const observed = await h.broker.call(actor, call);
  assert.deepEqual(await h.broker.call(actor, call), observed); assert.equal(h.calls.length, 1);
  await h.broker.revokeCredential(h.owner, credential.id); await assert.rejects(h.broker.call(actor, call), { code: 'unauthorized' }); assert.equal(h.broker.readReceipts.size, 0); assert.equal(h.broker.observations.size, 0);
});

test('one operation per device, duplicate pending IDs cannot dispatch twice', async () => {
  const gate = deferred(); const h = harness({ handler: () => gate.promise }); const actor = h.grant().actor; const call = h.makeCall('app.launch', { packageName: APP }); const pending = h.broker.call(actor, call);
  await assert.rejects(h.broker.call(actor, h.makeCall('observe')), { code: 'device_busy' }); assert.equal((await h.broker.call(actor, call)).status, 'unknown'); assert.equal(h.calls.length, 1);
  gate.resolve({ status: 'dispatched' }); assert.equal((await pending).status, 'completed'); assert.equal(h.broker.state(actor).devices[0].busy, false);
});

test('expiry after native dispatch is unknown, never a no-effect rejection', async () => {
  const h = harness(); const actor = h.grant({ ttlSeconds: 60 }).actor;
  h.setHandler(() => { h.advance(60001); return { status: 'dispatched' }; }); const result = await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }));
  assert.equal(result.status, 'unknown'); assert.equal(h.broker.state(h.owner).devices[0].actionState, 'unknown'); assert.equal(h.calls[0].params.deadlineAt <= h.time(), true);
});

test('revocation suppresses private read responses even after capture', async () => {
  const gate = deferred(); const h = harness({ handler: (body) => body.method === 'stop' ? { status: 'stopped' } : gate.promise }); const { actor, credential } = h.grant();
  const pending = h.broker.call(actor, h.makeCall('observe')); await h.broker.revokeCredential(h.owner, credential.id); gate.resolve(h.makeObservation());
  const result = await pending; assert.equal(result.status, 'rejected'); assert.equal(result.result, undefined); assert.equal(h.broker.observations.size, 0);
});

test('timeouts durably quarantine mutations until stop acknowledgement; timeout does not retry', async () => {
  const h = harness({ timeoutMs: 20, handler: (_body, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('private-native-debug')), { once: true }); }) }); const actor = h.grant().actor;
  const call = h.makeCall('app.launch', { packageName: APP }); const result = await h.broker.call(actor, call);
  assert.equal(result.status, 'unknown'); assert.equal(result.error.code, 'outcome_unknown'); assert.equal(h.calls.length, 1); assert.deepEqual(await h.broker.call(actor, call), result);
  await assert.rejects(h.broker.call(actor, h.makeCall('app.launch', { packageName: APP })), { code: 'device_outcome_unknown' });
  assert.equal(h.saved().uncertainDevices.includes('phone'), true); h.setHandler(() => ({ status: 'stopped' })); const stopped = await h.broker.stopDevice(h.owner, 'phone'); assert.equal(stopped.stopStatus, 'completed');
  assert.equal(h.broker.state(h.owner).devices[0].actionState, 'ready'); await assert.rejects(h.broker.call(actor, call), { code: 'session_expired' });
});

test('crash intent is never reinjected and survives expired private view loss', async () => {
  const h = harness(); const actor = h.grant().actor;
  h.setHandler(() => { throw new Error('crash-after-send'); }); const call = h.makeCall('app.launch', { packageName: APP }); await h.broker.call(actor, call);
  const restarted = new Broker({ config: h.config, state: h.saved(), save: () => {}, fetchImpl: () => { throw new Error('must not send'); } });
  await assert.rejects(restarted.call(actor, call), { code: 'session_expired' }); assert.equal(restarted.state(h.owner).devices[0].actionState, 'unknown');
});

test('native errors and malformed bodies never expose arbitrary text in receipts or audits', async () => {
  const h = harness(); const actor = h.grant().actor;
  h.setHandler((body) => Response.json({ id: body.id, error: { code: 'consent_denied', message: 'secret password' } })); const denied = await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP })); assert.equal(denied.status, 'rejected'); assert.equal(denied.error.message, 'consent denied');
  h.setHandler(() => Response.json({ id: 'wrong-id', result: { text: 'secret password' } })); const malformed = await h.broker.call(actor, h.makeCall('observe')); assert.equal(malformed.error.code, 'native_response_invalid');
  assert.equal(JSON.stringify(h.saved()).includes('secret password'), false);
});

test('observations reject stale, malformed, blocked, oversized or non-PNG native data', async () => {
  for (const override of [{ capturedAt: 1 }, { nodes: [{ id: 'bad.node' }] }, { blockedReason: 'secret contents' }, { screenshot: { mimeType: 'text/html', base64: 'PHNjcmlwdD4=' } }, { width: 1e9 }]) {
    const h = harness(); h.setHandler(() => h.makeObservation(override)); const result = await h.broker.call(h.grant().actor, h.makeCall('observe', { includeScreenshot: true })); assert.equal(result.status, 'rejected'); assert.equal(result.result, undefined);
  }
  const h = harness({ handler: () => new Response('a'.repeat(8 * 1024 * 1024 + 1)) }); const result = await h.broker.call(h.grant().actor, h.makeCall('observe')); assert.equal(result.error.code, 'native_response_too_large');
});

test('capture diagnostics preserve only whitelisted codes and never blocked screen data or arbitrary native messages', async () => {
  const codes = ['screenshot_rate_limited', 'screenshot_secure_window', 'screenshot_invalid_window', 'screenshot_invalid_display', 'screenshot_access_denied', 'screenshot_geometry_changed', 'screenshot_too_large', 'screenshot_timeout', 'screenshot_internal_error', 'screenshot_unavailable'];
  for (const code of codes) {
    const h = harness(); const actor = h.grant().actor;
    h.setHandler(() => h.makeObservation({ blockedReason: code })); const blocked = await h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true }));
    assert.equal(blocked.status, 'rejected'); assert.equal(blocked.error.code, code); assert.equal(blocked.result, undefined); assert.equal(JSON.stringify(h.saved()).includes('private-screen-text'), false);
    h.setHandler((body) => Response.json({ id: body.id, error: { code, message: 'private native debug contents' } })); const action = await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }));
    assert.equal(action.status, 'rejected'); assert.equal(action.error.code, code); assert.equal(JSON.stringify(action).includes('private native debug'), false);
  }
  const h = harness(); h.setHandler(() => h.makeObservation({ blockedReason: 'private-unrecognized-screen-details' }));
  const unknown = await h.broker.call(h.grant().actor, h.makeCall('observe')); assert.equal(unknown.error.code, 'observation_blocked'); assert.equal(JSON.stringify(h.saved()).includes('private-unrecognized-screen-details'), false);
});

test('capture failures expose only fixed stages and bounded elapsed times in both native response forms', async () => {
  for (const captureStage of ['queued', 'awaiting_callback', 'encoding']) {
    const h = harness(); const actor = h.grant().actor;
    const details = { captureStage, captureElapsedMs: 5000, privateMessage: 'secret capture content' };
    h.setHandler(() => h.makeObservation({ blockedReason: 'screenshot_timeout', ...details }));
    const blocked = await h.broker.call(actor, h.makeCall('observe', { includeScreenshot: true }));
    assert.equal(blocked.status, 'rejected'); assert.equal(blocked.result, undefined);
    assert.deepEqual(blocked.error.details, { captureStage, captureElapsedMs: 5000 });
    h.setHandler((body) => Response.json({ id: body.id, error: { code: 'screenshot_timeout', details } }));
    const action = await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }));
    assert.equal(action.status, 'rejected'); assert.deepEqual(action.error.details, blocked.error.details);
    assert.equal(JSON.stringify(h.saved()).includes('secret capture content'), false);
    assert.equal(JSON.stringify(h.saved()).includes('private-screen-text'), false);
    assert.ok(h.saved().audit.every((event) => !('details' in event)));
  }
});

test('malformed capture diagnostics and diagnostics on unrelated failures are discarded', async () => {
  for (const details of [{ captureStage: 'secret message', captureElapsedMs: -1 }, { captureStage: ['encoding'], captureElapsedMs: 60001 }, { captureStage: 'Encoding', captureElapsedMs: 1.5 }, { captureElapsedMs: '5000' }, ['encoding'], null]) {
    const h = harness(); const actor = h.grant().actor;
    h.setHandler((body) => Response.json({ id: body.id, error: { code: 'screenshot_timeout', details } }));
    const action = await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }));
    assert.equal(action.error.code, 'screenshot_timeout'); assert.equal(action.error.details, undefined);
  }
  const h = harness(); const actor = h.grant().actor; const details = { captureStage: 'encoding', captureElapsedMs: 60000 };
  h.setHandler((body) => Response.json({ id: body.id, error: { code: 'consent_denied', details } }));
  assert.equal((await h.broker.call(actor, h.makeCall('app.launch', { packageName: APP }))).error.details, undefined);
  h.setHandler(() => h.makeObservation({ blockedReason: 'unrecognized secret error', ...details }));
  assert.equal((await h.broker.call(actor, h.makeCall('observe'))).error.details, undefined);
});

test('private memory is bounded and latest observation replaces earlier actor views', async () => {
  const h = harness(); const actor = h.grant().actor;
  for (let index = 0; index < 40; index++) await h.broker.call(actor, h.makeCall('observe'));
  assert.equal(h.broker.observations.size, 1); assert.equal(h.broker.readReceipts.size, 1);
  for (let index = 0; index < 40; index++) await h.broker.call(actor, h.makeCall('describe'));
  assert.ok(h.broker.readReceipts.size <= 32); assert.ok([...h.broker.readReceipts.values()].reduce((sum, entry) => sum + entry.bytes, 0) <= 16 * 1024 * 1024);
  h.advance(30001); h.broker.prune(); assert.equal(h.broker.readReceipts.size, 0); assert.equal(h.broker.data.receipts.length, 0);
});

test('large private screenshots evict entire old views when the total byte limit is reached', async () => {
  const image = Buffer.alloc(4_300_000); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image); const base64 = image.toString('base64');
  const h = harness(); h.setHandler(() => h.makeObservation({ screenshot: { mimeType: 'image/png', base64 } })); const actors = [h.grant().actor, h.grant().actor, h.grant().actor];
  const calls = actors.map(() => h.makeCall('observe', { includeScreenshot: true }));
  for (let index = 0; index < actors.length; index++) assert.equal((await h.broker.call(actors[index], calls[index])).status, 'observed');
  assert.equal(h.broker.readReceipts.size, 2); assert.equal(h.broker.observations.size, 2); assert.ok([...h.broker.readReceipts.values()].reduce((sum, entry) => sum + entry.bytes, 0) <= 16 * 1024 * 1024);
  await assert.rejects(h.broker.call(actors[0], calls[0]), { code: 'observation_expired' }); assert.equal(JSON.stringify(h.saved()).includes(base64.slice(0, 128)), false);
});

test('strict schemas reject code execution, forged deadlines, duplicate scopes and invalid gestures', () => {
  const h = harness();
  for (const call of [h.makeCall('shell', { command: 'id' }), h.makeCall('observe', { allowedPackages: ['com.secret.app'] }), h.makeCall('app.launch', { packageName: APP, deadlineAt: Date.now() }), h.makeCall('pinch', { observationId: 'obs', centerX: 1, centerY: 1, scale: 1, durationMs: 500 }), h.makeCall('type', { observationId: 'obs', nodeId: 'node', text: 'x'.repeat(2001) }), h.makeCall('tap', { observationId: 'obs', x: NaN, y: 1 }), h.makeCall('key', { observationId: 'obs', key: 'enter' })]) assert.throws(() => validateCall(call), { code: 'invalid_request' });
  assert.throws(() => h.grant({ operations: ['observe', 'observe'] }), { code: 'invalid_request' }); assert.equal(METHODS.includes('node.click'), true);
});

test('redacted audit retention is bounded and connection freshness never claims ongoing connectivity', async () => {
  const h = harness(); assert.equal(h.broker.state(h.owner).devices[0].connection, 'unknown'); const actor = h.grant().actor;
  await h.broker.call(actor, h.makeCall('observe')); assert.equal(h.broker.state(actor).devices[0].connection, 'recently_observed'); h.advance(60001); assert.equal(h.broker.state(actor).devices[0].connection, 'unknown');
  for (let index = 0; index < 510; index++) h.broker.audit(actor.id, 'rejected', { code: 'invalid_request' }); assert.equal(h.broker.data.audit.length, 500); assert.equal(h.broker.data.audit.every((event) => !('text' in event) && !('token' in event)), true);
});

test('disk failure cannot prevent emergency native stop or cancellation and fails closed afterward', async () => {
  let fail = false; let aborted = false; const gate = deferred();
  const h = harness({ save: () => { if (fail) throw new Error('disk full'); }, handler: (body, init) => { if (body.method === 'stop') return { status: 'stopped' }; init.signal.addEventListener('abort', () => { aborted = true; }, { once: true }); return gate.promise; } });
  const actor = h.grant().actor; const pending = h.broker.call(actor, h.makeCall('app.launch', { packageName: APP })); fail = true;
  const result = await h.broker.stopDevice(h.owner, 'phone'); assert.equal(aborted, true); assert.equal(h.calls.at(-1).method, 'stop'); assert.equal(result.stopStatus, 'unknown'); assert.equal(h.broker.state(h.owner).storageState, 'unavailable');
  gate.resolve({ status: 'dispatched' }); assert.equal((await pending).status, 'unknown');
  await assert.rejects(h.broker.call(actor, h.makeCall('observe')), { code: 'persistence_unavailable' }); assert.throws(() => h.grant(), { code: 'persistence_unavailable' });
});

test('failed durable credential revocation still stops every scoped native device', async () => {
  let fail = false; const h = harness({ save: () => { if (fail) throw new Error('disk full'); } }); const { credential } = h.grant({ devices: ['phone', 'other'] }); fail = true;
  await assert.rejects(h.broker.revokeCredential(h.owner, credential.id), { code: 'persistence_unavailable' }); assert.deepEqual(h.calls.map((call) => call.method), ['stop', 'stop']); assert.equal(h.broker.state(h.owner).storageState, 'unavailable');
});

test('a stop acknowledgement that permits an in-flight gesture to finish remains unknown', async () => {
  const h = harness({ handler: () => ({ status: 'stopped', inFlightGestureMayFinish: true }) }); const result = await h.broker.stopDevice(h.owner, 'phone'); assert.equal(result.stopStatus, 'unknown'); assert.equal(h.broker.state(h.owner).devices[0].actionState, 'unknown');
});
