// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PhonePilot } from '../src/pilot.mjs';
import { SourcePhoneTask, readTaskCheckpoint } from '../src/task.mjs';
import { securePath } from '../src/security.mjs';
import { generateResponseIdentity } from '../src/response-proof.mjs';
import { harness, runningServer, deferred, APP } from './helpers.mjs';

test('a relay cannot reuse a genuine signed denial for another body even with the original nonce', async (t) => {
  const h = harness(); const identity = generateResponseIdentity(); h.config.signingPrivateKey = identity.privateKey;
  const { credential, task } = h.grant(); const { port } = await runningServer(t, h);
  let changed = false;
  const pilot = new PhonePilot({ port, secret: credential.token, brokerPublicKey: identity.publicKey, deviceId: 'phone', sessionId: h.session.id, taskId: task.id, fetchImpl: async (url, options) => {
    const actual = await fetch(url, options);
    const input = JSON.parse(options.body);
    if (input.method !== 'app.launch') return actual;
    assert.equal((await actual.json()).status, 'completed');
    const rejected = await fetch(url, { ...options, body: JSON.stringify({ ...input, id: randomUUID(), params: { packageName: 'com.example.forbidden' } }) });
    assert.equal(rejected.status, 403); assert.ok(rejected.headers.get('x-phone-response-signature')); changed = true;
    return rejected;
  } });
  await assert.rejects(pilot.act('app.launch', { packageName: APP }), { code: 'outcome_unknown' });
  assert.equal(changed, true); assert.equal(pilot.uncertain, true);
  await assert.rejects(pilot.act('app.launch', { packageName: APP }), { code: 'outcome_unknown' });
  assert.equal(h.calls.filter((call) => call.method === 'app.launch').length, 1);
  assert.equal((await pilot.stop()).status, 'completed');
});

test('cancelling an actual pending broker mutation retains checkpoint uncertainty after late native completion', async (t) => {
  const dispatched = deferred(); const completion = deferred();
  const h = harness({ handler: (body) => { if (body.method === 'app.launch') { dispatched.resolve(); return completion.promise; } return { status: 'stopped' }; } });
  const identity = generateResponseIdentity(); h.config.signingPrivateKey = identity.privateKey;
  const { credential, task: lease } = h.grant(); const { port } = await runningServer(t, h);
  const directory = mkdtempSync(join(tmpdir(), 'phone-review-checkpoint-')); securePath(directory, true);
  t.after(() => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); });
  const checkpointFile = join(directory, 'task.json');
  const pilot = new PhonePilot({ port, secret: credential.token, brokerPublicKey: identity.publicKey, deviceId: 'phone', sessionId: h.session.id, taskId: lease.id });
  const task = new SourcePhoneTask({ pilot, checkpointFile });
  const action = task.act('app.launch', { packageName: APP }); const uncertain = assert.rejects(action, { code: 'outcome_unknown' });
  await dispatched.promise;
  assert.equal(readTaskCheckpoint(checkpointFile).actions[0].status, 'pending');
  const cancelled = await task.cancel(); assert.equal(cancelled.stop.status, 'completed');
  completion.resolve({ status: 'dispatched' }); await uncertain;
  assert.equal(pilot.uncertain, true); assert.equal(readTaskCheckpoint(checkpointFile).actions[0].status, 'unknown');
  await assert.rejects(task.act('app.launch', { packageName: APP }), { code: 'task_closed' });
  assert.throws(() => new SourcePhoneTask({ pilot, checkpointFile }), { code: 'task_reconciliation_required' });
  assert.equal(h.calls.filter((call) => call.method === 'app.launch').length, 1); assert.equal(h.calls.filter((call) => call.method === 'stop').length, 1);
});
