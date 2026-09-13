// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
import { spawn, execFileSync } from 'node:child_process';
import { createPublicKey, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPrivate } from '../src/security.mjs';
import { bodyHash, verifyHttpResponse } from '../src/response-proof.mjs';
import { MAX_RESPONSE, readFrames, sendFrame, validRequest } from './protocol.mjs';

const componentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE_IMAGE = 'node@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf';
const proxyNames = ['HTTP_PROXY', 'HTTPS_PROXY', 'FTP_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'ftp_proxy', 'no_proxy', 'all_proxy'];
const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/u.test(value);
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function requireThat(condition, code) { if (!condition) throw new Error(code); }
export function isLocalDockerEndpoint(value) {
  return typeof value === 'string' && (/^unix:\/\/\/[^\u0000\r\n]+$/u.test(value) || /^npipe:\/\/(?:\/\/)?\.\/pipe\/[A-Za-z0-9._-]+$/u.test(value));
}

export function engineCheck() {
  let info;
  try {
    const contextEndpoint = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
    const endpoint = process.env.DOCKER_CONTEXT ? contextEndpoint : process.env.DOCKER_HOST || contextEndpoint;
    requireThat(isLocalDockerEndpoint(endpoint), 'local_docker_socket_required');
    info = JSON.parse(docker(['info', '--format', '{{json .}}']));
  } catch (error) { if (error.message === 'local_docker_socket_required') throw error; throw new Error('linux_docker_engine_unavailable'); }
  requireThat(info.OSType === 'linux' && info.SecurityOptions?.some((value) => value.includes('name=seccomp')), 'docker_seccomp_required');
  return { os: info.OSType, serverVersion: info.ServerVersion, seccomp: true, localControlSocket: true };
}

export function buildImage() {
  engineCheck();
  const staging = mkdtempSync(join(tmpdir(), 'phone-isolation-build-'));
  try {
    mkdirSync(join(staging, 'src')); mkdirSync(join(staging, 'deployment'));
    // A positive allowlist prevents private repository/configuration files entering a build context.
    for (const entry of readdirSync(join(componentRoot, 'src'))) if (/^[a-z][a-z0-9-]*\.mjs$/u.test(entry)) {
      const source = join(componentRoot, 'src', entry); requireThat(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink(), 'unsafe_build_source'); cpSync(source, join(staging, 'src', entry));
    }
    for (const entry of ['LICENSE', 'NOTICE', 'ATTRIBUTION.md']) cpSync(join(componentRoot, entry), join(staging, entry));
    for (const entry of ['guest.mjs', 'protocol.mjs']) cpSync(join(componentRoot, 'deployment', entry), join(staging, 'deployment', entry));
    cpSync(join(componentRoot, 'deployment', 'Dockerfile'), join(staging, 'Dockerfile'));
    const output = execFileSync('docker', ['build', '--network=none', '--build-arg', `NODE_IMAGE=${NODE_IMAGE}`, ...proxyNames.flatMap((name) => ['--build-arg', `${name}=`]), '--quiet', staging], { encoding: 'utf8', windowsHide: true, timeout: 180_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const image = output.split(/\r?\n/u).at(-1); requireThat(/^sha256:[a-f0-9]{64}$/u.test(image), 'docker_build_failed'); return { image, base: NODE_IMAGE };
  } finally { requireThat(resolve(staging).startsWith(resolve(tmpdir()) + sep), 'unsafe_temporary_path'); rmSync(staging, { recursive: true, force: true }); }
}

export function containerArguments(image, name) {
  requireThat(/^sha256:[a-f0-9]{64}$/u.test(image) && /^phone-isolated-[a-f0-9-]{36}$/u.test(name), 'invalid_container_identity');
  return ['create', '--name', name, '--label', 'io.orchestrator.phone-isolation=1', '--interactive', '--network', 'none', '--ipc', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--pids-limit', '96', '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--ulimit', 'nofile=256:256', '--log-driver', 'none', '--no-healthcheck', ...proxyNames.flatMap((key) => ['--env', `${key}=`]), '--workdir', '/workspace', '--tmpfs', '/workspace:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000,mode=0700', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m,uid=1000,gid=1000,mode=0700', '--entrypoint', '/usr/local/bin/node', image, '/opt/phone/deployment/guest.mjs'];
}

export function assertContainerBoundary(container, image) {
  const h = container.HostConfig; const c = container.Config;
  requireThat(container.Image === image && c.User === '1000:1000' && c.Entrypoint?.[0] === '/usr/local/bin/node' && c.WorkingDir === '/workspace', 'container_identity_invalid');
  requireThat(h.NetworkMode === 'none' && h.IpcMode === 'none' && !h.PidMode && !h.UTSMode && !h.Privileged && h.ReadonlyRootfs && h.CapDrop?.includes('ALL') && !h.CapAdd?.length, 'container_isolation_invalid');
  requireThat(h.SecurityOpt?.includes('no-new-privileges=true') && !h.SecurityOpt.some((value) => value.includes('unconfined')), 'container_security_invalid');
  requireThat(!h.Binds?.length && !h.VolumesFrom?.length && !h.Devices?.length && !h.DeviceRequests?.length && !h.DeviceCgroupRules?.length && !h.ExtraHosts?.length && !Object.keys(h.PortBindings ?? {}).length && !Object.keys(c.Volumes ?? {}).length, 'container_host_access_forbidden');
  requireThat((container.Mounts ?? []).every((mount) => mount.Type === 'tmpfs' && ['/workspace', '/tmp'].includes(mount.Destination)) && Object.keys(h.Tmpfs ?? {}).sort().join(',') === '/tmp,/workspace', 'container_mounts_invalid');
  requireThat(h.PidsLimit === 96 && h.Memory === 512 * 1024 * 1024 && h.MemorySwap === h.Memory && h.NanoCpus === 1_000_000_000 && h.LogConfig?.Type === 'none', 'container_limits_invalid');
  requireThat(!(c.Env ?? []).some((entry) => proxyNames.includes(entry.split('=')[0]) && !entry.endsWith('=')), 'container_proxy_secret_forbidden');
  return { network: 'none', user: c.User, hostMounts: 0, devices: 0, readOnlyRoot: true, capabilities: [], noNewPrivileges: true, pidsLimit: h.PidsLimit, memoryBytes: h.Memory };
}

export async function brokerRequest({ port, secret, publicKey, method, path, body = '', nonce = randomUUID(), signal }) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, { method, redirect: 'error', headers: { authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(nonce ? { 'x-phone-request-nonce': nonce } : {}) }, ...(body ? { body } : {}), signal: signal ?? AbortSignal.timeout(60_000) });
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; requireThat(size <= MAX_RESPONSE, 'broker_response_too_large'); chunks.push(chunk); }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const signature = response.headers.get('x-phone-response-signature');
    requireThat(!signature || /^[A-Za-z0-9_-]{1,256}$/u.test(signature), 'broker_signature_invalid');
    if (publicKey) requireThat(verifyHttpResponse({ publicKey, nonce, method, path, requestHash: bodyHash(body), status: response.status, bodyHash: bodyHash(text), signature }), 'broker_response_untrusted');
    return { status: response.status, body: text, ...(signature ? { signature } : {}) };
  } catch { return { status: 502, body: JSON.stringify({ error: { code: method === 'GET' ? 'broker_unavailable' : 'outcome_unknown' } }) }; }
}

export async function checkScopedCredential({ port, secret, publicKey, deviceId, sessionId }) {
  requireThat(Number.isInteger(port) && port >= 1024 && port <= 65535 && typeof secret === 'string' && secret.length >= 24 && secret.length <= 256 && !/\s/u.test(secret) && safeId(deviceId) && safeId(sessionId), 'isolation_configuration_invalid');
  // This read-only owner route distinguishes an owner token even if only one grant exists.
  requireThat(typeof publicKey === 'string', 'broker_public_key_required');
  const audit = await brokerRequest({ port, secret, publicKey, method: 'GET', path: '/v1/audit' });
  requireThat(audit.status === 403, 'scoped_credential_required');
  const reply = await brokerRequest({ port, secret, publicKey, method: 'GET', path: '/v1/state' });
  requireThat(reply.status === 200, 'broker_preflight_failed'); const state = JSON.parse(reply.body);
  const credential = state.credentials?.[0]; const session = state.sessions?.find((entry) => entry.id === sessionId);
  requireThat(state.credentials?.length === 1 && credential?.devices?.length === 1 && credential.devices[0] === deviceId && credential.sessionIds?.length === 1 && credential.sessionIds[0] === sessionId && !credential.revokedAt && Date.parse(credential.expiresAt) > Date.now() && credential.operations?.includes('stop'), 'single_session_credential_required');
  requireThat(session?.deviceId === deviceId && !session.revokedAt && Date.parse(session.expiresAt) > Date.now() && session.operations?.includes('stop'), 'active_session_required');
}

export class IsolatedSource {
  static async start({ image, port = 4421, secret, publicKey, deviceId, sessionId, lifetimeMs = 300_000 }) {
    requireThat(typeof image === 'string' && /^sha256:[a-f0-9]{64}$/u.test(image), 'pinned_image_required');
    requireThat(Number.isInteger(lifetimeMs) && lifetimeMs >= 1000 && lifetimeMs <= 1_800_000, 'isolation_lifetime_invalid');
    requireThat(typeof publicKey === 'string' && publicKey.length <= 2048 && createPublicKey(publicKey).asymmetricKeyType === 'ed25519', 'broker_public_key_required');
    engineCheck(); await checkScopedCredential({ port, secret, publicKey, deviceId, sessionId });
    const imageConfig = JSON.parse(docker(['image', 'inspect', image]))[0]; requireThat(!Object.keys(imageConfig.Config.Volumes ?? {}).length, 'image_volumes_forbidden');
    const name = `phone-isolated-${randomUUID()}`; const id = docker(containerArguments(image, name));
    requireThat(/^[a-f0-9]{64}$/u.test(id), 'container_create_failed');
    let source;
    try {
      const evidence = assertContainerBoundary(JSON.parse(docker(['inspect', id]))[0], image);
      source = new IsolatedSource({ id, port, secret, publicKey, deviceId, sessionId, evidence });
      source.process = spawn('docker', ['start', '--attach', '--interactive', id], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      source.process.stderr.on('data', () => {});
      source.process.on('error', () => source.fail()); source.process.on('close', () => source.fail());
      readFrames(source.process.stdout, (frame) => source.receive(frame), () => source.fail(), 256 * 1024);
      const ready = new Promise((yes, no) => { source.ready = { yes, no }; });
      source.timer = setTimeout(() => { void source.close().catch(() => {}); }, lifetimeMs);
      source.send({ type: 'initialize', publicKey, deviceId, sessionId });
      await Promise.race([ready, new Promise((_, reject) => { source.startTimer = setTimeout(() => reject(new Error('container_start_timeout')), 15_000); })]);
      clearTimeout(source.startTimer); return source;
    } catch (error) { if (source) await source.close(); else docker(['rm', '--force', id]); throw error; }
  }
  constructor({ id, port, secret, publicKey, deviceId, sessionId, evidence }) { this.id = id; this.port = port; this.secret = secret; this.publicKey = publicKey; this.deviceId = deviceId; this.sessionId = sessionId; this.evidence = evidence; this.inflight = new Map(); this.closed = false; }
  send(frame) { sendFrame(this.process.stdin, frame); }
  fail() { this.ready?.no(new Error('isolated_runtime_unavailable')); this.runPending?.no(new Error('isolated_runtime_unavailable')); void this.close().catch(() => {}); }
  receive(frame) {
    if (frame.type === 'request') { void this.relay(frame).catch(() => this.fail()); return; }
    if (frame.type === 'ready' && this.ready) { this.ready.yes(); this.ready = undefined; return; }
    const pending = this.runPending;
    if (!pending || frame.id !== pending.id) throw new Error('isolated_response_invalid');
    if (frame.type === 'output' && ['stdout', 'stderr'].includes(frame.stream) && typeof frame.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/u.test(frame.data)) {
      const bytes = Buffer.from(frame.data, 'base64'); pending.size += bytes.length;
      requireThat(pending.size <= 1024 * 1024, 'isolated_output_too_large'); pending[frame.stream].push(bytes); return;
    }
    if (frame.type === 'exit' && (frame.code === null || (Number.isInteger(frame.code) && frame.code >= 0 && frame.code <= 255)) && typeof frame.outputTruncated === 'boolean') {
      this.runPending = undefined; pending.yes({ code: frame.code, outputTruncated: frame.outputTruncated, stdout: Buffer.concat(pending.stdout).toString('utf8'), stderr: Buffer.concat(pending.stderr).toString('utf8') }); return;
    }
    throw new Error('isolated_response_invalid');
  }
  async relay(frame) {
    if (!validRequest(frame)) throw new Error('isolated_request_invalid');
    requireThat(!this.inflight.has(frame.id), 'isolated_request_duplicate');
    let stop = false;
    if (frame.method === 'POST') {
      let input; try { input = JSON.parse(frame.body); } catch { throw new Error('isolated_request_invalid'); }
      requireThat(input?.deviceId === this.deviceId && input?.sessionId === this.sessionId, 'isolated_scope_mismatch');
      stop = frame.path === '/v1/call' && input.method === 'stop';
    }
    if (this.inflight.size >= (stop ? 16 : 8)) { this.send({ type: 'response', id: frame.id, status: 429, body: '{"error":{"code":"isolated_capacity"}}' }); return; }
    const controller = new AbortController(); this.inflight.set(frame.id, controller);
    try {
      const response = await brokerRequest({ port: this.port, secret: this.secret, ...frame, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) });
      if (!this.closed) this.send({ type: 'response', id: frame.id, ...response });
    } finally { this.inflight.delete(frame.id); }
  }
  run(source) {
    requireThat(!this.closed && !this.runPending && typeof source === 'string' && Buffer.byteLength(source) <= 128 * 1024, 'isolated_run_invalid');
    const id = randomUUID();
    return new Promise((yes, no) => { this.runPending = { id, yes, no, stdout: [], stderr: [], size: 0 }; try { this.send({ type: 'run', id, source }); } catch (error) { this.runPending = undefined; no(error); } });
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true; clearTimeout(this.timer); clearTimeout(this.startTimer);
    this.ready?.no(new Error('isolated_runtime_closed')); this.runPending?.no(new Error('isolated_runtime_closed')); this.runPending = undefined;
    for (const controller of this.inflight.values()) controller.abort();
    this.closing = (async () => {
      const stop = await brokerRequest({ port: this.port, secret: this.secret, publicKey: this.publicKey, method: 'POST', path: '/v1/call', body: JSON.stringify({ id: randomUUID(), deviceId: this.deviceId, sessionId: this.sessionId, method: 'stop', params: {} }), signal: AbortSignal.timeout(10_000) });
      this.process?.stdin.destroy();
      try { docker(['rm', '--force', this.id]); } catch { throw new Error('container_cleanup_failed'); }
      let receipt; try { receipt = JSON.parse(stop.body); } catch { receipt = { status: 'unknown', error: { code: 'broker_response_invalid' } }; }
      return { nativeStopConfirmed: stop.status === 200 && receipt.status === 'completed' && receipt.result?.status === 'stopped', stopStatus: stop.status, stop: receipt };
    })();
    return this.closing;
  }
}

async function main(args) {
  if (args[0] === 'build' && args.length === 1) { console.log(JSON.stringify(buildImage())); return; }
  requireThat(args[0] === 'run' && args.length % 2 === 1, 'usage_build_or_run_flags');
  const options = {};
  for (let index = 1; index < args.length; index += 2) { const key = args[index]; requireThat(['--image', '--token-file', '--public-key-file', '--source-file', '--device-id', '--session-id', '--port'].includes(key) && !Object.hasOwn(options, key), 'invalid_option'); options[key] = args[index + 1]; }
  assertPrivate(options['--token-file']);
  const source = await IsolatedSource.start({ image: options['--image'], secret: readFileSync(options['--token-file'], 'utf8').trim(), publicKey: readFileSync(options['--public-key-file'], 'utf8'), deviceId: options['--device-id'], sessionId: options['--session-id'], port: Number(options['--port'] ?? 4421) });
  const stop = () => { void source.close().finally(() => process.exit(130)); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { const result = await source.run(readFileSync(options['--source-file'], 'utf8')); console.log(JSON.stringify({ ...result, evidence: source.evidence })); if (result.code !== 0 || result.outputTruncated) process.exitCode = 1; }
  finally { const result = await source.close(); console.log(JSON.stringify({ cleanup: result })); if (!result.nativeStopConfirmed) process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).catch((error) => { console.error(JSON.stringify({ error: /^[a-z_]+$/u.test(error.message) ? error.message : 'isolated_deployment_failed' })); process.exitCode = 1; });
