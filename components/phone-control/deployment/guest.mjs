// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { LOCAL_TOKEN, MAX_REQUEST, MAX_RESPONSE, readFrames, sendFrame, routeAllowed } from './protocol.mjs';

const pending = new Map(); let child; let initialized = false; let sequence = 0;
const send = (frame) => sendFrame(process.stdout, frame);
function fail() { child?.kill('SIGKILL'); process.exit(70); }
function respond(response, status, body, signature) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(signature ? { 'x-phone-response-signature': signature } : {}) });
  response.end(body);
}
const server = http.createServer(async (request, response) => {
  if (!routeAllowed(request.method, request.url) || request.headers.host !== '127.0.0.1:4421' || request.headers.origin || request.headers['sec-fetch-site']) { respond(response, 403, '{"error":{"code":"isolated_route_forbidden"}}'); return; }
  const chunks = []; let size = 0;
  try {
    for await (const chunk of request) { size += chunk.length; if (size > MAX_REQUEST) throw new Error(); chunks.push(chunk); }
    const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    let stop = false; try { stop = request.url === '/v1/call' && JSON.parse(body).method === 'stop'; } catch { /* The host and broker validate JSON. */ }
    if (pending.size >= (stop ? 16 : 8)) { respond(response, 429, '{"error":{"code":"isolated_capacity"}}'); return; }
    const id = randomUUID(); const timer = setTimeout(() => { pending.delete(id); respond(response, 502, '{"error":{"code":"outcome_unknown"}}'); }, 65_000);
    pending.set(id, { response, timer });
    send({ type: 'request', id, method: request.method, path: request.url, body, ...(request.headers['x-phone-request-nonce'] ? { nonce: request.headers['x-phone-request-nonce'] } : {}) });
  } catch { if (!response.headersSent) respond(response, 400, '{"error":{"code":"isolated_request_invalid"}}'); }
});
server.maxConnections = 16; server.requestTimeout = 10_000; server.headersTimeout = 10_000;
server.on('error', fail);

readFrames(process.stdin, (frame) => {
  if (frame.type === 'response') {
    const entry = pending.get(frame.id); if (!entry) return;
    if (!Number.isInteger(frame.status) || frame.status < 100 || frame.status > 599 || typeof frame.body !== 'string' || Buffer.byteLength(frame.body) > MAX_RESPONSE || (frame.signature && !/^[A-Za-z0-9_-]{1,256}$/u.test(frame.signature))) throw new Error();
    pending.delete(frame.id); clearTimeout(entry.timer); respond(entry.response, frame.status, frame.body, frame.signature);
  } else if (frame.type === 'initialize' && !initialized) {
    initialized = true;
    if (typeof frame.publicKey !== 'string' || frame.publicKey.length > 2048 || typeof frame.deviceId !== 'string' || typeof frame.sessionId !== 'string') throw new Error();
    writeFileSync('/workspace/broker-public.pem', frame.publicKey, { mode: 0o400 });
    process.env.PHONE_CONTROL_DEVICE = frame.deviceId; process.env.PHONE_CONTROL_SESSION = frame.sessionId;
    process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY = frame.publicKey;
    server.listen(4421, '127.0.0.1', () => send({ type: 'ready' }));
  } else if (frame.type === 'run' && initialized && !child) {
    if (typeof frame.source !== 'string' || Buffer.byteLength(frame.source) > 128 * 1024 || typeof frame.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(frame.id)) throw new Error();
    const path = `/workspace/source-${++sequence}.mjs`; writeFileSync(path, frame.source, { mode: 0o600 });
    const runId = frame.id; let outputBytes = 0;
    // The submitted program executes only here, under the container boundary.
    child = spawn('/usr/local/bin/node', [path], { cwd: '/workspace', env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/workspace', TMPDIR: '/tmp', PHONE_CONTROL_TOKEN: LOCAL_TOKEN, PHONE_CONTROL_DEVICE: process.env.PHONE_CONTROL_DEVICE, PHONE_CONTROL_SESSION: process.env.PHONE_CONTROL_SESSION, PHONE_CONTROL_BROKER_PUBLIC_KEY: process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) stream.on('data', (chunk) => { outputBytes += chunk.length; if (outputBytes > 1024 * 1024) { child?.kill('SIGKILL'); return; } send({ type: 'output', id: runId, stream: name, data: chunk.toString('base64') }); });
    child.on('error', fail);
    child.on('close', (code, signal) => { child = undefined; send({ type: 'exit', id: runId, code, signal, outputTruncated: outputBytes > 1024 * 1024 }); });
  } else throw new Error();
}, fail);
process.stdin.on('end', fail);
