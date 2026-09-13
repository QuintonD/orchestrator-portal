// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { startMcp, CALL_SCHEMA, PARAM_SCHEMAS, PROTOCOL_VERSION } from '../src/mcp.mjs';
import { METHODS } from '../src/validation.mjs';
import { createClient } from '../src/client.mjs';
import { generateResponseIdentity } from '../src/response-proof.mjs';
import { harness as baseHarness, runningServer, APP, SECRET, deferred } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../bin/phone-control.mjs', import.meta.url));
const identity = generateResponseIdentity();
function harness(options) { const h = baseHarness(options); h.config.signingPrivateKey = identity.privateKey; h.config.signingPublicKey = identity.publicKey; return h; }
function command(args, secret, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { windowsHide: true, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PHONE_CONTROL_TOKEN: secret, PHONE_CONTROL_BROKER_PUBLIC_KEY: identity.publicKey } }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; }); child.on('error', reject); child.on('close', (code) => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
}
function memoryMcp(client) {
  const input = new PassThrough(); const output = new PassThrough(); const messages = []; const pending = new Map(); let buffer = ''; const adapter = startMcp({ input, output, client });
  output.on('data', (chunk) => { buffer += chunk; while (buffer.includes('\n')) { const index = buffer.indexOf('\n'); const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); messages.push(message); pending.get(message.id)?.(message); pending.delete(message.id); } });
  const request = (id, method, params) => new Promise((resolve) => { pending.set(id, resolve); input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`); });
  const notify = (method) => input.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  return { input, output, adapter, messages, request, notify };
}
async function initialize(mcp) { const result = await mcp.request(1, 'initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'test', version: '1' } }); assert.equal(result.result.protocolVersion, PROTOCOL_VERSION); mcp.notify('notifications/initialized'); }

test('MCP implements pinned lifecycle and exposes actionable per-method schemas without management tools', async () => {
  const mcp = memoryMcp(async () => ({})); const premature = await mcp.request(0, 'tools/list'); assert.equal(premature.error.code, -32602); await initialize(mcp);
  const list = await mcp.request(2, 'tools/list'); assert.deepEqual(list.result.tools.map((tool) => tool.name), ['phone_state', 'phone_call', 'phone_task_acquire', 'phone_task_status', 'phone_task_release', 'phone_receipt_status']); assert.equal(CALL_SCHEMA.oneOf.length, METHODS.length);
  for (const method of METHODS) assert.equal(PARAM_SCHEMAS[method].additionalProperties, false, method);
  assert.equal(PARAM_SCHEMAS.type.properties.text.maxLength, 2000); assert.equal(PARAM_SCHEMAS.swipe.properties.points.maxItems, 20); assert.equal(PARAM_SCHEMAS['node.click'].required.includes('nodeId'), true);
  assert.match(list.result.tools[1].description, /untrusted data/u); assert.equal((await mcp.request(3, 'resources/list')).error.code, -32601); mcp.adapter.close();
});

test('MCP validates envelopes, returns tool failures and keeps oversized messages bounded', async () => {
  let calls = 0; const mcp = memoryMcp(async () => { calls++; return { status: 'unknown', error: { code: 'outcome_unknown' } }; }); await initialize(mcp);
  const h = harness(); const unknown = await mcp.request(2, 'tools/call', { name: 'phone_call', arguments: h.makeCall('app.launch', { packageName: APP }) }); assert.equal(unknown.result.isError, true);
  const forged = await mcp.request(3, 'tools/call', { name: 'phone_call', arguments: { ...h.makeCall('observe'), admin: true } }); assert.equal(forged.result.isError, true); assert.equal(calls, 1);
  const grant = await mcp.request(4, 'tools/call', { name: 'credentials_create', arguments: {} }); assert.equal(grant.result.isError, true); assert.equal(calls, 1);
  mcp.input.write('x'.repeat(16385)); assert.equal(mcp.messages.at(-1).error.message, 'Message too large'); assert.equal(mcp.input.destroyed, true);
});

test('MCP rejects malformed handshake identities without entering initialized state', async () => {
  const mcp = memoryMcp(async () => ({}));
  for (const [index, fields] of [{ capabilities: [] }, { clientInfo: null }, { clientInfo: { name: 'missing version' } }, { clientInfo: { name: 123, version: '1' } }].entries()) {
    const result = await mcp.request(index + 10, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' }, ...fields });
    assert.equal(result.error.code, -32602);
  }
  await initialize(mcp); assert.equal((await mcp.request(20, 'tools/list')).result.tools.length, 6); mcp.adapter.close();
});

test('MCP rejects duplicate active request IDs before dispatch and correlates capacity refusals', async () => {
  const gate = deferred(); let calls = 0; const mcp = memoryMcp(async () => { calls++; return gate.promise; }); await initialize(mcp);
  const frame = (id) => `${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'phone_state', arguments: {} } })}\n`;
  mcp.input.write(frame(10)); mcp.input.write(frame(10));
  assert.equal(calls, 1); assert.equal(mcp.messages.at(-1).id, 10); assert.equal(mcp.messages.at(-1).error.message, 'Duplicate active request ID');
  for (let id = 11; id <= 17; id++) mcp.input.write(frame(id));
  mcp.input.write(frame(18)); assert.equal(calls, 8); assert.equal(mcp.messages.at(-1).id, 18); assert.equal(mcp.messages.at(-1).error.code, -32000);
  gate.resolve({}); await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await mcp.request(19, 'tools/list')).result.tools.length, 6); mcp.adapter.close();
});

test('MCP synchronous batches do not consume asynchronous concurrency capacity', async () => {
  const mcp = memoryMcp(async () => ({})); await initialize(mcp);
  mcp.input.write(Array.from({ length: 20 }, (_, index) => JSON.stringify({ jsonrpc: '2.0', id: index + 100, method: 'ping' })).join('\n') + '\n');
  assert.equal(mcp.messages.filter((message) => message.id >= 100 && message.result).length, 20); mcp.adapter.close();
});

test('CLI node-scroll carries the observed node and direction through the authenticated broker', async (t) => {
  const h = harness(); const { credential, actor, task } = h.grant(); const { port } = await runningServer(t, h);
  h.setHandler((body) => { if (body.method !== 'observe') return; const value = h.makeObservation(); Object.assign(value.nodes[0], { enabled: true, scrollable: true, actions: ['scrollForward'] }); return value; });
  const observed = await h.broker.call(actor, h.makeCall('observe'));
  const result = await command(['node-scroll', '--device', 'phone', '--session', h.session.id, '--task', task.id, '--observation', observed.result.observationId, '--node', 'n_0', '--direction', 'forward', '--request-id', 'scroll-forward-once', '--port', String(port)], credential.token);
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'completed'); assert.equal(h.calls.at(-1).method, 'node.scroll'); assert.equal(h.calls.at(-1).params.direction, 'forward');
});

test('MCP rejects invalid UTF-8 and bounds an unread output stream', async () => {
  const mcp = memoryMcp(async () => ({})); mcp.input.write(Buffer.from([255, 10])); assert.equal(mcp.messages.at(-1).error.code, -32700); mcp.adapter.close();
  const input = new PassThrough(); const output = new PassThrough(); startMcp({ input, output, client: async () => ({ payload: 'x'.repeat(3 * 1024 * 1024) }) });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'slow reader', version: '1' } } })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  for (let id = 2; id < 6; id++) input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'phone_state', arguments: {} } })}\n`);
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(input.destroyed, true); assert.equal(output.destroyed, true);
});

test('standalone CLI and MCP are independent source clients with isolated snapshots and replay-safe mutations', async (t) => {
  const h = harness();
  const { port } = await runningServer(t, h); const a = h.grant({ label: 'Source A console' }); const b = h.grant({ label: 'Source B MCP' });
  const cli = await command(['observe', '--device', 'phone', '--session', h.session.id, '--port', String(port), '--request-id', 'source-a-observe'], a.credential.token);
  assert.equal(cli.code, 0, cli.stderr); const observedA = JSON.parse(cli.stdout); assert.equal(observedA.status, 'observed'); assert.equal(cli.stdout.includes(a.credential.token), false); assert.equal(cli.stderr, '');
  h.broker.releaseTask(a.actor, a.task.id);
  const taskB = h.broker.createTask(b.actor, { deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 300, maxActions: 10 }).task;
  const clientB = createClient({ port, secret: b.credential.token, brokerPublicKey: identity.publicKey }); const mcp = memoryMcp(clientB); await initialize(mcp);
  const cross = await mcp.request(2, 'tools/call', { name: 'phone_call', arguments: h.makeCall('node.click', { observationId: observedA.result.observationId, nodeId: 'n_0' }, { taskId: taskB.id }) }); assert.equal(cross.result.isError, true); assert.match(cross.result.content[0].text, /stale_observation/u);
  const observedB = await mcp.request(3, 'tools/call', { name: 'phone_call', arguments: h.makeCall('observe', { includeScreenshot: true }) }); assert.equal(observedB.result.content[1].type, 'image');
  const action = h.makeCall('fixture.increment', { observationId: observedB.result.structuredContent.result.observationId }, { taskId: taskB.id });
  const completed = await mcp.request(4, 'tools/call', { name: 'phone_call', arguments: action }); assert.equal(completed.result.isError, false); assert.equal(completed.result.structuredContent.status, 'completed');
  const replay = await mcp.request(5, 'tools/call', { name: 'phone_call', arguments: action }); assert.deepEqual(replay.result, completed.result); assert.equal(h.calls.filter((call) => call.method === 'fixture.increment').length, 1);
  await h.broker.revokeCredential(h.owner, b.credential.id); const revoked = await mcp.request(6, 'tools/call', { name: 'phone_state', arguments: {} }); assert.equal(revoked.result.isError, true); mcp.adapter.close();
  const forbiddenManagement = await command(['credentials-list', '--port', String(port)], a.credential.token); assert.equal(forbiddenManagement.code, 1); assert.match(forbiddenManagement.stderr, /owner_required/u);
});

test('real MCP CLI subprocess writes only JSON-RPC on stdout', async (t) => {
  const h = harness(); const { port } = await runningServer(t, h); const { credential } = h.grant();
  const lines = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'client', version: '1' } } }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'phone_state', arguments: {} } }];
  const result = await command(['mcp', '--port', String(port)], credential.token, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`); assert.equal(result.code, 0, result.stderr); assert.equal(result.stderr, '');
  const messages = result.stdout.trim().split('\n').map((line) => JSON.parse(line)); assert.equal(messages.length, 3); assert.equal(messages.every((message) => message.jsonrpc === '2.0'), true); assert.equal(messages.find((message) => message.id === 3).result.structuredContent.devices[0].id, 'phone');
});

test('client forbids arbitrary destinations and has no mutation retries', async () => {
  let calls = 0; const client = createClient({ port: 4421, secret: 'opaque', brokerPublicKey: identity.publicKey, fetchImpl: async () => { calls++; throw new Error('native password'); } });
  await assert.rejects(client('https://attacker.test'), { code: 'invalid_route' }); assert.equal(calls, 0);
  await assert.rejects(client('/v1/call', 'POST', {}), { code: 'outcome_unknown' }); assert.equal(calls, 1);
  assert.throws(() => createClient({ port: 'http://attacker.test', secret: 'opaque' }), { code: 'invalid_request' });
});

test('lost or malformed response bodies after sending are unknown, never safe to retry with a new ID', async () => {
  for (const fetchImpl of [async () => new Response('{'), async () => new Response(null), async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('lost connection')); } }))]) {
    const client = createClient({ port: 4421, secret: 'opaque', brokerPublicKey: identity.publicKey, fetchImpl }); await assert.rejects(client('/v1/call', 'POST', {}), { code: 'outcome_unknown' });
  }
});

test('CLI version identifies independent alpha version, origin and license without credentials', async () => {
  const result = await command(['--version']); assert.equal(result.code, 0); assert.match(result.stdout, /0\.1\.0-alpha\.1/u); assert.match(result.stdout, /AGPL-3\.0-only/u); assert.match(result.stdout, /QuintonD\/orchestrator-portal/u); assert.match(result.stdout, /No warranty/u);
});

test('CLI refuses an existing token destination before issuing a credential', async (t) => {
  const h = harness(); const { port } = await runningServer(t, h); const root = mkdtempSync(join(tmpdir(), 'phone-cli-token-')); const output = join(root, 'existing.token'); writeFileSync(output, 'keep');
  const result = await command(['credentials-create', '--out-token', output, '--port', String(port)], SECRET, JSON.stringify({ label: 'must not be created', devices: ['phone'], apps: [APP], operations: ['observe'], ttlSeconds: 600 }));
  assert.equal(result.code, 1); assert.match(result.stderr, /token_file_exists/u); assert.equal(h.broker.data.credentials.length, 0); assert.equal(readFileSync(output, 'utf8'), 'keep');
});

test('CLI returns the generated request ID after a lost response, without echoing private parameters', async (t) => {
  let sent; const server = http.createServer((request, response) => { const chunks = []; request.on('data', (chunk) => chunks.push(chunk)); request.on('end', () => { sent = JSON.parse(Buffer.concat(chunks).toString('utf8')); response.destroy(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await command(['launch', '--device', 'phone', '--session', 'session', '--package', APP, '--port', String(server.address().port)], SECRET);
  assert.equal(result.code, 2); const failure = JSON.parse(result.stderr); assert.equal(failure.error.code, 'outcome_unknown'); assert.equal(failure.requestId, sent.id); assert.equal(failure.deviceId, 'phone'); assert.equal(result.stderr.includes(APP), false); assert.equal(result.stderr.includes(SECRET), false);
});

test('CLI exposes bounded task acquisition, metadata status, release and receipt reconciliation', async (t) => {
  const h = harness({ autoTasks: false }); const { credential } = h.grant(); const { port } = await runningServer(t, h);
  const acquired = await command(['tasks-create', '--port', String(port)], credential.token, JSON.stringify({ deviceId: 'phone', sessionId: h.session.id, ttlSeconds: 60, maxActions: 2 }));
  assert.equal(acquired.code, 0, acquired.stderr); const taskId = JSON.parse(acquired.stdout).task.id;
  const launched = await command(['launch', '--device', 'phone', '--session', h.session.id, '--task', taskId, '--package', APP, '--request-id', 'source-launch', '--port', String(port)], credential.token);
  assert.equal(launched.code, 0, launched.stderr);
  const status = await command(['receipt-status', '--id', 'source-launch', '--port', String(port)], credential.token);
  assert.equal(status.code, 0); assert.equal(JSON.parse(status.stdout).resumeAllowed, false); assert.equal(status.stdout.includes(APP), false);
  const inspected = await command(['tasks-get', '--id', taskId, '--port', String(port)], credential.token); assert.equal(inspected.code, 0); assert.equal(JSON.parse(inspected.stdout).task.actionsUsed, 1);
  const released = await command(['tasks-release', '--id', taskId, '--port', String(port)], credential.token); assert.equal(released.code, 0); assert.equal(JSON.parse(released.stdout).task.status, 'completed');
  assert.equal(h.calls.filter((input) => input.method === 'app.launch').length, 1);
});

test('MCP exposes narrow task tools while rejecting forged authority and path traversal', async () => {
  const calls = []; const mcp = memoryMcp(async (...args) => { calls.push(args); return { task: { id: 'task' } }; }); await initialize(mcp);
  const acquire = await mcp.request(2, 'tools/call', { name: 'phone_task_acquire', arguments: { deviceId: 'phone', sessionId: 'session', ttlSeconds: 60, maxActions: 2 } }); assert.equal(acquire.result.isError, false);
  for (const [id, name] of [[3, 'phone_task_status'], [4, 'phone_task_release'], [5, 'phone_receipt_status']]) {
    assert.equal((await mcp.request(id, 'tools/call', { name, arguments: { id: 'task' } })).result.isError, false);
  }
  assert.deepEqual(calls.map(([path, method]) => [path, method]), [['/v1/tasks', 'POST'], ['/v1/tasks/task', 'GET'], ['/v1/tasks/task', 'DELETE'], ['/v1/receipts/task', 'GET']]);
  for (const [id, name, args] of [[6, 'phone_task_status', { id: '../credentials' }], [7, 'phone_task_acquire', { deviceId: 'phone', sessionId: 'session', ttlSeconds: 301, maxActions: 2 }], [8, 'phone_task_acquire', { deviceId: 'phone', sessionId: 'session', ttlSeconds: 60, maxActions: 2, verified: true }]]) {
    assert.equal((await mcp.request(id, 'tools/call', { name, arguments: args })).result.isError, true);
  }
  assert.equal(calls.length, 4); mcp.adapter.close();
});

test('unsigned HTTP mutation refusals remain unknown for CLI and MCP clients', async () => {
  const client = createClient({ secret: SECRET, brokerPublicKey: identity.publicKey, fetchImpl: async () => Response.json({ error: { code: 'scope_forbidden' }, dispatch: { state: 'not_dispatched' } }, { status: 403 }) });
  await assert.rejects(client('/v1/call', 'POST', { method: 'app.launch' }), { code: 'outcome_unknown' });
  await assert.rejects(client('/v1/call', 'POST', { method: 'observe' }), { code: 'broker_response_untrusted' });
});

test('forged successful receipts, state and task authority fail full response authentication', async () => {
  const forged = { id: 'action', status: 'rejected', error: { code: 'scope_forbidden' }, task: { id: 'forged', status: 'active' }, state: { actionState: 'ready' }, resumeAllowed: true };
  const client = createClient({ secret: SECRET, brokerPublicKey: identity.publicKey, fetchImpl: async () => Response.json(forged) });
  for (const path of ['/v1/state', '/v1/tasks/task', '/v1/receipts/action']) await assert.rejects(client(path), { code: 'broker_response_untrusted' });
  await assert.rejects(client('/v1/call', 'POST', { id: 'action', method: 'app.launch' }), { code: 'outcome_unknown' });
  await assert.rejects(client('/v1/tasks', 'POST', { deviceId: 'phone' }), { code: 'outcome_unknown' });
  await assert.rejects(client('/v1/tasks/task', 'DELETE'), { code: 'outcome_unknown' });
});

test('missing pin refuses ordinary requests before sending but cannot prevent emergency Stop', async () => {
  let calls = 0; const client = createClient({ secret: SECRET, fetchImpl: async () => { calls++; return Response.json({ id: 'stop', status: 'completed', result: { status: 'stopped' } }); } });
  await assert.rejects(client('/v1/state'), { code: 'broker_public_key_required' });
  await assert.rejects(client('/v1/tasks', 'POST', {}), { code: 'broker_public_key_required' }); assert.equal(calls, 0);
  await assert.rejects(client('/v1/call', 'POST', { id: 'stop', method: 'stop' }), { code: 'outcome_unknown' }); assert.equal(calls, 1);
});
