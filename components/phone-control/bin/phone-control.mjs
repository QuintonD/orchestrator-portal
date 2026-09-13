#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { initialize, loadConfiguration, addDevice, updateDeviceToken, provisionBrokerIdentity, acquireLock, writePrivate, assertPrivate } from '../src/security.mjs';
import { Broker, createServer } from '../src/broker.mjs';
import { clientToken, createClient } from '../src/client.mjs';
import { startMcp } from '../src/mcp.mjs';
import { Fault, requireThat, publicError, validateCall, MAX_BODY_BYTES } from '../src/validation.mjs';

const NOTICE = 'Orchestrator Phone Control — created by the Orchestrator contributors.\nhttps://github.com/QuintonD/orchestrator-portal\nAGPL-3.0-only with attribution preservation (ATTRIBUTION.md). No warranty.';
const HELP = `${NOTICE}\n\nNode 24+. Tokens are read from --token-file or PHONE_CONTROL_TOKEN, never command arguments.\n\nOwner setup:\n  init [--dir PRIVATE_DIRECTORY] [--port 4421]\n  device-add --config PATH --id phone --label Phone --native-port 8837 --native-token-file PATH\n  serve --config PATH\n\nOwner management (JSON input from stdin or --input-file):\n  credentials-create --token-file PATH --out-token NEW_PRIVATE_FILE\n    input: {"label":"agent-a","devices":["phone"],"apps":["com.example.app"],"operations":["observe","tap"],"ttlSeconds":3600}\n  credentials-list | credentials-revoke --id ID\n  sessions-create\n    input: {"deviceId":"phone","apps":["com.example.app"],"operations":["observe","tap"],"ttlSeconds":600}\n  sessions-revoke --id ID | device-stop --device phone | audit\n\nScoped agent commands (--token-file PATH [--port 4421]):\n  state | legal | call [--input-file PRIVATE_JSON] | mcp\n  describe | observe [--screenshot] | apps | launch --package PACKAGE\n  tap --observation ID --x N --y N\n  long-press --observation ID --x N --y N --duration 500\n  swipe --observation ID --points-file JSON --duration 500\n  pinch --observation ID --x N --y N --scale 1.5 --duration 500\n  type --observation ID --node ID --text-file PRIVATE_TEXT\n  key --observation ID --key back|home\n  fixture-increment --observation ID | stop\n  Above method commands require --device ID --session ID [--request-id STABLE_ID].\n  call input: {"id":"unique-id","deviceId":"phone","sessionId":"ID","method":"observe","params":{"includeScreenshot":false}}\n\n--output PRIVATE_FILE saves returned private screen data without printing it.\nAfter an unknown mutation, do not retry with a new ID. Stop, rearm on phone and observe to reconcile.\nGeneric mutations require local biometric consent; fixture-increment only works in the signed harmless fixture.\n--version | --license | --help\n`;
const TASK_HELP = `\nBroker response authentication:\n  --broker-public-key-file OWNER_PROVISIONED_PEM or PHONE_CONTROL_BROKER_PUBLIC_KEY (raw PEM)\n  Required for every request except emergency Stop, whose response remains unconfirmed without a pin.\n  broker-identity --config PATH provisions keys for an older configuration while the broker is stopped.\n\nScoped task workflow:\n  tasks-create (JSON input: {"deviceId":"phone","sessionId":"ID","ttlSeconds":60,"maxActions":10})\n  tasks-get --id TASK_ID | tasks-release --id TASK_ID\n  Every mutation except Stop also requires --task TASK_ID (or taskId in call JSON).\n  receipt-status --id REQUEST_ID reads dispatch status only; it never retries or restores authority.\n  Observe again after acquiring a task. Completed dispatch or lease status is not verified task completion.\n  A fresh screenshot never clears an uncertain mutation; hand off to the owner.\n`;

async function jsonInput(values) {
  let data;
  if (values['input-file']) { assertPrivate(values['input-file']); data = readFileSync(values['input-file']); }
  else { const chunks = []; let size = 0; for await (const chunk of process.stdin) { size += chunk.length; requireThat(size <= MAX_BODY_BYTES, 'request_too_large', 413); chunks.push(chunk); } data = Buffer.concat(chunks); }
  requireThat(data.length <= MAX_BODY_BYTES, 'request_too_large', 413); try { return JSON.parse(data.toString('utf8')); } catch { throw new Fault('invalid_json'); }
}
function privateText(path) { requireThat(path, 'file_required'); assertPrivate(path); return readFileSync(path, 'utf8'); }
async function guardedCall(client, input) {
  validateCall(input);
  try { return await client('/v1/call', 'POST', input); } catch (error) {
    if (error instanceof Fault && error.code === 'outcome_unknown') Object.assign(error, { requestId: input.id, deviceId: input.deviceId, sessionId: input.sessionId });
    throw error;
  }
}
async function main() {
  requireThat(Number(process.versions.node.split('.')[0]) >= 24, 'node_24_required', 500);
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: Object.fromEntries(['dir', 'config', 'port', 'id', 'label', 'native-port', 'native-token-file', 'token-file', 'broker-public-key-file', 'out-token', 'input-file', 'output', 'device', 'session', 'task', 'request-id', 'observation', 'x', 'y', 'duration', 'scale', 'points-file', 'package', 'node', 'text-file', 'key', 'direction'].map((name) => [name, { type: 'string' }]).concat(['help', 'version', 'license', 'screenshot'].map((name) => [name, { type: 'boolean' }]))) });
  if (values.help || !positionals.length && !values.version && !values.license) { process.stdout.write(`${HELP}${TASK_HELP}\n  node-click --observation ID --node ID (observed clickable element)\n  node-scroll --observation ID --node ID --direction forward|backward\n  device-token-update --config PATH --id phone --native-token-file PATH (broker stopped)\n`); return; }
  if (values.version) { process.stdout.write(`0.1.0-alpha.1\n${NOTICE}\n`); return; }
  if (values.license) { process.stdout.write(`${NOTICE}\n\n${readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')}\n${readFileSync(new URL('../ATTRIBUTION.md', import.meta.url), 'utf8')}\n`); return; }
  requireThat(positionals.length === 1, 'invalid_arguments'); const command = positionals[0]; const configPath = resolve(values.config ?? join(homedir(), '.orchestrator-phone-control', 'config.json'));
  let result;
  if (command === 'init') result = initialize(values.dir ?? join(homedir(), '.orchestrator-phone-control'), Number(values.port ?? 4421));
  else if (command === 'broker-identity') result = provisionBrokerIdentity(configPath);
  else if (command === 'device-add') result = addDevice(configPath, { id: values.id, label: values.label, port: Number(values['native-port'] ?? 8837), tokenFile: values['native-token-file'] });
  else if (command === 'device-token-update') result = updateDeviceToken(configPath, { id: values.id, tokenFile: values['native-token-file'] });
  else if (command === 'serve') {
    const loaded = loadConfiguration(configPath); const releaseLock = acquireLock(configPath); const broker = new Broker(loaded); const server = createServer(broker);
    process.once('exit', releaseLock);
    server.on('error', () => { releaseLock(); process.stderr.write('broker_start_failed\n'); process.exitCode = 1; });
    server.listen(loaded.config.port, '127.0.0.1', () => { process.stderr.write(`${NOTICE}\nListening at http://127.0.0.1:${loaded.config.port}\n`); });
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return; shuttingDown = true;
      for (const value of broker.inflight.values()) value.controller.abort(); server.close(); server.closeAllConnections();
      const devices = new Set(broker.data.sessions.filter((session) => !session.revokedAt && Date.parse(session.expiresAt) > Date.now()).map((session) => session.deviceId));
      const results = await Promise.allSettled([...devices].map((deviceId) => broker.stopDevice({ id: 'owner', admin: true }, deviceId)));
      if (results.some((item) => item.status === 'rejected' || item.value.stopStatus === 'unknown')) process.stderr.write('shutdown_stop_unknown: inspect the phone and use its local Stop control\n');
      releaseLock();
    };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); return;
  } else {
    const brokerPublicKey = values['broker-public-key-file'] ? readFileSync(values['broker-public-key-file'], 'utf8') : process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY;
    const client = createClient({ port: Number(values.port ?? 4421), secret: clientToken({ tokenFile: values['token-file'] }), brokerPublicKey });
    if (command === 'mcp') { startMcp({ client }); return; }
    if (command === 'state' || command === 'legal' || command === 'audit') result = await client(`/v1/${command}`);
    else if (command === 'credentials-list') result = await client('/v1/credentials');
    else if (command === 'credentials-create') {
      requireThat(values['out-token'], 'out_token_required'); const tokenPath = resolve(values['out-token']); requireThat(!existsSync(tokenPath), 'token_file_exists', 409); assertPrivate(dirname(tokenPath)); accessSync(dirname(tokenPath), constants.W_OK);
      result = await client('/v1/credentials', 'POST', await jsonInput(values));
      const secret = result.credential?.token; requireThat(typeof secret === 'string', 'broker_response_invalid', 502);
      try { writePrivate(tokenPath, secret, { exclusive: true }); } catch {
        let revoked = false; try { await client(`/v1/credentials/${result.credential.id}`, 'DELETE'); revoked = true; } catch { /* Surface the credential ID so the owner can revoke it. */ }
        process.stderr.write(`${JSON.stringify({ error: { code: 'credential_token_write_failed' }, credentialId: result.credential.id, revoked })}\n`); process.exitCode = 1; return;
      }
      delete result.credential.token; result.tokenFile = tokenPath;
    } else if (command === 'credentials-revoke') { requireThat(values.id, 'id_required'); result = await client(`/v1/credentials/${values.id}`, 'DELETE'); }
    else if (command === 'sessions-create') result = await client('/v1/sessions', 'POST', await jsonInput(values));
    else if (command === 'tasks-create') result = await client('/v1/tasks', 'POST', await jsonInput(values));
    else if (command === 'tasks-get' || command === 'tasks-release') { requireThat(values.id, 'id_required'); result = await client(`/v1/tasks/${values.id}`, command === 'tasks-get' ? 'GET' : 'DELETE'); }
    else if (command === 'receipt-status') { requireThat(values.id, 'id_required'); result = await client(`/v1/receipts/${values.id}`); }
    else if (command === 'sessions-revoke') { requireThat(values.id, 'id_required'); result = await client(`/v1/sessions/${values.id}`, 'DELETE'); }
    else if (command === 'device-stop') { requireThat(values.device, 'device_required'); result = await client(`/v1/devices/${values.device}/stop`, 'POST', {}); }
    else if (command === 'call') result = await guardedCall(client, await jsonInput(values));
    else {
      const method = ({ apps: 'apps.list', launch: 'app.launch', 'long-press': 'longPress', 'fixture-increment': 'fixture.increment', 'node-click': 'node.click', 'node-scroll': 'node.scroll' })[command] ?? command;
      let params;
      switch (method) {
        case 'describe': case 'apps.list': case 'stop': params = {}; break;
        case 'observe': params = { includeScreenshot: values.screenshot === true }; break;
        case 'app.launch': params = { packageName: values.package }; break;
        case 'tap': params = { observationId: values.observation, x: Number(values.x), y: Number(values.y) }; break;
        case 'longPress': params = { observationId: values.observation, x: Number(values.x), y: Number(values.y), durationMs: Number(values.duration) }; break;
        case 'swipe': params = { observationId: values.observation, points: JSON.parse(privateText(values['points-file'])), durationMs: Number(values.duration) }; break;
        case 'pinch': params = { observationId: values.observation, centerX: Number(values.x), centerY: Number(values.y), scale: Number(values.scale), durationMs: Number(values.duration) }; break;
        case 'type': params = { observationId: values.observation, nodeId: values.node, text: privateText(values['text-file']) }; break;
        case 'key': params = { observationId: values.observation, key: values.key }; break;
        case 'fixture.increment': params = { observationId: values.observation }; break;
        case 'node.click': params = { observationId: values.observation, nodeId: values.node }; break;
        case 'node.scroll': params = { observationId: values.observation, nodeId: values.node, direction: values.direction }; break;
        default: throw new Fault('unknown_command');
      }
      result = await guardedCall(client, { id: values['request-id'] ?? randomUUID(), deviceId: values.device, sessionId: values.session, ...(values.task ? { taskId: values.task } : {}), method, params });
    }
  }
  if (values.output) writePrivate(resolve(values.output), JSON.stringify(result, null, 2), { exclusive: true }); else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === 'unknown' || result?.status === 'rejected') process.exitCode = 2;
}
main().catch((error) => {
  const safe = error instanceof Fault ? error : new Fault(({ ENOENT: 'file_not_found', EACCES: 'permission_denied', EPERM: 'permission_denied', EEXIST: 'file_exists' })[error?.code] ?? (error?.code?.startsWith('ERR_PARSE_ARGS') ? 'invalid_arguments' : 'internal_error'));
  const attempt = error?.requestId ? { requestId: error.requestId, deviceId: error.deviceId, sessionId: error.sessionId } : {};
  process.stderr.write(`${JSON.stringify({ ...publicError(safe), ...attempt })}\n`); process.exitCode = safe.code === 'outcome_unknown' ? 2 : 1;
});
