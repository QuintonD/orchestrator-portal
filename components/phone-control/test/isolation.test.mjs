// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import http from 'node:http';
import { once } from 'node:events';
import { generateResponseIdentity } from '../src/response-proof.mjs';
import { routeAllowed, validRequest, readFrames } from '../deployment/protocol.mjs';
import { containerArguments, assertContainerBoundary, brokerRequest, checkScopedCredential, isLocalDockerEndpoint } from '../deployment/host.mjs';
import { harness, runningServer, SECRET } from './helpers.mjs';

test('isolation relay accepts only fixed scoped HTTP routes, bounded bodies and a nonce header', () => {
  for (const [method, path] of [['GET', '/v1/state'], ['GET', '/v1/legal'], ['POST', '/v1/call'], ['POST', '/v1/tasks'], ['GET', '/v1/tasks/task-1'], ['DELETE', '/v1/tasks/task-1'], ['GET', '/v1/receipts/request-1']]) assert.equal(routeAllowed(method, path), true, path);
  for (const [method, path] of [['GET', 'http://127.0.0.1:5037/v1/state'], ['GET', '/v1/state?redirect=adb'], ['GET', '/v1/state/../audit'], ['CONNECT', '/v1/call'], ['POST', '/v1/devices/phone/stop'], ['GET', '/v1/audit'], ['GET', '/v1/credentials'], ['POST', '/v1/sessions'], ['GET', '/v1/tasks/%2e%2e'], ['GET', '/v1/tasks/task-1\r\nHost:evil']]) assert.equal(routeAllowed(method, path), false, path);
  const frame = { type: 'request', id: 'r', method: 'POST', path: '/v1/call', body: '{}', nonce: 'a-b_c' };
  assert.equal(validRequest(frame), true);
  for (const extra of [{ secret: 'owner' }, { port: 5037 }, { headers: { host: 'evil' } }, { body: 'a'.repeat(16385) }, { nonce: 'a\r\nx: y' }, { method: 'GET' }]) assert.equal(validRequest({ ...frame, ...extra }), false);
});

test('framing rejects malformed UTF-8, oversized partial frames and invalid JSON without echoing content', () => {
  for (const input of [Buffer.from([0xff, 10]), Buffer.from('x'.repeat(33)), Buffer.from('{bad}\n')]) {
    const stream = new PassThrough(); const frames = []; const errors = [];
    readFrames(stream, (frame) => frames.push(frame), (error) => errors.push(error.message), 32); stream.end(input);
    assert.deepEqual(frames, []); assert.deepEqual(errors, ['isolation_protocol_invalid']);
  }
  const stream = new PassThrough(); const frames = []; readFrames(stream, (frame) => frames.push(frame), assert.fail, 32);
  stream.write('{"id":'); stream.end('1}\n{"id":2}\n'); assert.deepEqual(frames, [{ id: 1 }, { id: 2 }]);
});

test('container boundary verification refuses networking, mounts, devices, privileges and resource-limit drift', () => {
  const image = `sha256:${'a'.repeat(64)}`;
  const valid = { Image: image, Config: { User: '1000:1000', Entrypoint: ['/usr/local/bin/node'], WorkingDir: '/workspace' }, Mounts: [], HostConfig: { NetworkMode: 'none', IpcMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges=true'], Tmpfs: { '/workspace': '', '/tmp': '' }, PidsLimit: 96, Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1000000000, LogConfig: { Type: 'none' } } };
  assert.equal(assertContainerBoundary(valid, image).network, 'none');
  for (const patch of [{ NetworkMode: 'bridge' }, { PidMode: 'host' }, { Privileged: true }, { Binds: ['/owner:/owner'] }, { Devices: [{ PathOnHost: '/dev/bus/usb' }] }, { DeviceRequests: [{}] }, { SecurityOpt: ['no-new-privileges=true', 'seccomp=unconfined'] }, { CapAdd: ['SYS_ADMIN'] }, { Memory: 0 }, { ReadonlyRootfs: false }]) assert.throws(() => assertContainerBoundary({ ...valid, HostConfig: { ...valid.HostConfig, ...patch } }, image));
  assert.throws(() => assertContainerBoundary({ ...valid, Mounts: [{ Type: 'bind', Destination: '/workspace' }] }, image));
  const args = containerArguments(image, 'phone-isolated-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(args.includes('--privileged'), false); assert.equal(args.includes('--mount'), false); assert.equal(args.includes('--volume'), false);
  assert.throws(() => containerArguments('node:latest', 'arbitrary'));
  for (const endpoint of ['unix:///var/run/docker.sock', 'unix:///run/user/1000/docker.sock', 'npipe:////./pipe/dockerDesktopLinuxEngine']) assert.equal(isLocalDockerEndpoint(endpoint), true);
  for (const endpoint of ['ssh://remote.example', 'tcp://127.0.0.1:2375', 'tcp://remote.example:2376', 'npipe:////other-host/pipe/docker_engine', undefined]) assert.equal(isLocalDockerEndpoint(endpoint), false);
});

test('relay preserves broker proof and status, replaces authority, and refuses redirects without following them', async (t) => {
  let received; let redirects = 0;
  const server = http.createServer((req, res) => {
    received = req.headers;
    if (req.url === '/redirect') { res.writeHead(302, { location: '/exfiltrate' }); res.end(); return; }
    if (req.url === '/exfiltrate') redirects++;
    res.writeHead(403, { 'x-phone-response-signature': 'proof-signed', 'content-type': 'application/json' }); res.end('{"error":{"code":"scope_forbidden"},"dispatch":{"state":"not_dispatched","requestHash":"hash"}}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); }); const port = server.address().port;
  const result = await brokerRequest({ port, secret: 'scoped-test-secret', method: 'GET', path: '/v1/state', nonce: 'nonce' });
  assert.equal(received.authorization, 'Bearer scoped-test-secret'); assert.equal(received['x-phone-request-nonce'], 'nonce'); assert.equal(received.host, `127.0.0.1:${port}`); assert.equal(result.status, 403); assert.equal(result.signature, 'proof-signed'); assert.equal(JSON.parse(result.body).dispatch.state, 'not_dispatched');
  const denied = await brokerRequest({ port, secret: 'scoped-test-secret', method: 'POST', path: '/redirect', body: '{}' });
  assert.equal(JSON.parse(denied.body).error.code, 'outcome_unknown'); assert.equal(denied.signature, undefined); assert.equal(redirects, 0);
  const untrusted = await brokerRequest({ port, secret: 'scoped-test-secret', publicKey: generateResponseIdentity().publicKey, method: 'POST', path: '/v1/call', body: '{}' });
  assert.equal(untrusted.status, 502); assert.equal(JSON.parse(untrusted.body).error.code, 'outcome_unknown'); assert.equal(untrusted.signature, undefined);
});

test('deployment preflight refuses owner, legacy broad, wrong-session, and non-Stop credentials', async (t) => {
  const h = harness(); const identity = generateResponseIdentity(); h.config.signingPrivateKey = identity.privateKey; const { port } = await runningServer(t, h); const config = { port, publicKey: identity.publicKey, deviceId: 'phone', sessionId: h.session.id };
  for (const secret of [SECRET, h.grant().credential.token, h.grant({ sessionIds: [h.session.id], operations: ['observe'] }).credential.token]) await assert.rejects(checkScopedCredential({ ...config, secret }));
  const secret = h.grant({ sessionIds: [h.session.id] }).credential.token;
  await checkScopedCredential({ ...config, secret });
  await assert.rejects(checkScopedCredential({ ...config, secret, sessionId: 'different' }));
});
