// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
// Explicit integration command: this runs real Docker containers and never contacts a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { IsolatedSource, buildImage, engineCheck } from '../deployment/host.mjs';
import { harness, runningServer } from './helpers.mjs';

test('real isolated source cannot reach owner files/processes/devices/network and can use only its scoped broker', { timeout: 180_000 }, async (t) => {
  const engine = engineCheck(); const built = buildImage();
  const h = harness({ screenshots: false }); const { port } = await runningServer(t, h);
  const { credential } = h.grant({ sessionIds: [h.session.id], operations: ['observe', 'describe', 'stop'] });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519'); const pem = publicKey.export({ type: 'spki', format: 'pem' }); h.config.signingPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const ownerDir = mkdtempSync(join(tmpdir(), 'phone-isolation-owner-canary-'));
  const canary = randomUUID(); const marker = `owner-process-canary-${randomUUID()}`;
  for (const name of ['admin.token', 'native.token', 'key', 'state.enc.json']) writeFileSync(join(ownerDir, name), canary, { mode: 0o600 });
  const ownerProcess = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', marker], { windowsHide: true, stdio: 'ignore' });
  t.after(() => { ownerProcess.kill(); rmSync(ownerDir, { recursive: true, force: true }); });
  const isolated = await IsolatedSource.start({ image: built.image, port, secret: credential.token, publicKey: pem, deviceId: 'phone', sessionId: h.session.id, lifetimeMs: 120_000 });
  t.after(() => isolated.close());
  const paths = ['admin.token', 'native.token', 'key', 'state.enc.json'].flatMap((name) => {
    const full = join(ownerDir, name); const unix = full.replaceAll('\\', '/');
    return [full, unix, ...(process.platform === 'win32' ? [`/mnt/${unix[0].toLowerCase()}${unix.slice(2)}`, `/host_mnt/${unix[0].toLowerCase()}${unix.slice(2)}`, `/run/desktop/mnt/host/${unix[0].toLowerCase()}${unix.slice(2)}`] : [])];
  });
  const probe = await isolated.run(`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createClient, isDefiniteRejection } from '/opt/phone/src/client.mjs';
const checks = {};
const inaccessible = path => { try { fs.readFileSync(path); return false; } catch (error) { return ['ENOENT','EACCES','EPERM','EISDIR','ENOTDIR','ENXIO'].includes(error.code); } };
checks.ownerFilesDenied = ${JSON.stringify(paths)}.every(inaccessible);
checks.hostSocketsAbsent = ['/var/run/docker.sock','/run/docker.sock','/run/host-services/ssh-auth.sock','/root/.ssh/id_rsa','/root/.android/adbkey'].every(path => !fs.existsSync(path));
checks.usbAndDevicesAbsent = ['/dev/bus/usb','/dev/kvm','/dev/mem','/dev/dri','/dev/fuse','/dev/ttyUSB0','/dev/ttyACM0'].every(path => !fs.existsSync(path));
checks.onlyLoopback = Object.keys(os.networkInterfaces()).every(name => name === 'lo');
checks.noRoute = fs.readFileSync('/proc/net/route','utf8').trim().split('\\n').length === 1;
const procStatus = fs.readFileSync('/proc/self/status','utf8');
checks.unprivileged = process.getuid() === 1000 && /CapEff:\\s+0+\\n/.test(procStatus) && /NoNewPrivs:\\s+1/.test(procStatus) && /Seccomp:\\s+2/.test(procStatus);
checks.ownerProcessHidden = fs.readdirSync('/proc').filter(name => /^\\d+$/.test(name)).every(name => { try { return !fs.readFileSync('/proc/'+name+'/cmdline','utf8').includes(${JSON.stringify(marker)}); } catch { return true; } });
checks.hostProcessToolsUnavailable = ['powershell.exe','cmd.exe','adb','docker','wsl.exe'].every(name => { try { execFileSync(name,['--version'],{stdio:'ignore',timeout:1000}); return false; } catch (error) { return error.code === 'ENOENT'; } });
checks.rootReadOnly = (() => { try { fs.writeFileSync('/opt/phone/escape','x'); return false; } catch(error) { return ['EROFS','EACCES'].includes(error.code); } })();
checks.noOwnerTokenInGuestEnvironment = !fs.readFileSync('/proc/1/environ','utf8').includes('PHONE_CONTROL_TOKEN=') && Object.keys(process.env).every(name => ['PATH','HOME','TMPDIR','PHONE_CONTROL_TOKEN','PHONE_CONTROL_DEVICE','PHONE_CONTROL_SESSION','PHONE_CONTROL_BROKER_PUBLIC_KEY'].includes(name)) && process.env.PHONE_CONTROL_TOKEN === 'isolated-channel-no-bearer-secret';
const blocked = (host, port) => new Promise(resolve => { const socket = net.connect({host,port}); const finish = value => { socket.destroy(); resolve(value); }; socket.setTimeout(500,()=>finish(true)); socket.once('error',()=>finish(true)); socket.once('connect',()=>finish(false)); });
checks.adbAndNativeDenied = (await Promise.all([['127.0.0.1',5037],['127.0.0.1',8837],['192.168.65.254',5037],['192.168.65.254',8837],['172.17.0.1',5037],['172.17.0.1',8837]].map(([host,port])=>blocked(host,port)))).every(Boolean);
checks.hostBrokerDirectDenied = await blocked('192.168.65.254',${port});
checks.arbitraryEgressDenied = (await Promise.all([blocked('1.1.1.1',443),blocked('8.8.8.8',53),blocked('169.254.169.254',80)])).every(Boolean);
const client = createClient({ secret: process.env.PHONE_CONTROL_TOKEN, brokerPublicKey: process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY });
const call = (method,params={}) => client('/v1/call','POST',{id:crypto.randomUUID(),deviceId:process.env.PHONE_CONTROL_DEVICE,sessionId:process.env.PHONE_CONTROL_SESSION,method,params});
checks.scopedObservation = (await call('observe')).status === 'observed';
checks.operationDeniedWithPinnedProof = await call('app.launch',{packageName:'com.example.allowed'}).then(()=>false,error=>error.code==='scope_forbidden' && isDefiniteRejection(error));
checks.screenshotDenied = await call('observe',{includeScreenshot:true}).then(()=>false,error=>error.code==='screenshot_forbidden');
checks.ownerRouteDenied = (await fetch('http://127.0.0.1:4421/v1/audit')).status === 403;
checks.absoluteUrlDenied = await new Promise(resolve => { import('node:http').then(({request}) => { const q=request({host:'127.0.0.1',port:4421,path:'http://192.168.65.254:5037/v1/state'},r=>{r.resume();resolve(r.statusCode===403)}); q.on('error',()=>resolve(false));q.end(); }); });
fs.writeFileSync('/workspace/checkpoint.json',JSON.stringify({phase:'observed'}),{mode:0o600});
console.log(JSON.stringify(checks));
assert.ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
`);
  assert.equal(probe.code, 0, probe.stderr); assert.equal(probe.outputTruncated, false); const checks = JSON.parse(probe.stdout.trim()); assert.ok(Object.values(checks).every(Boolean));
  const persistence = await isolated.run(`import fs from 'node:fs'; import assert from 'node:assert/strict'; assert.equal(JSON.parse(fs.readFileSync('/workspace/checkpoint.json')).phase,'observed'); console.log('checkpoint-retained');`);
  assert.equal(persistence.code, 0, persistence.stderr); assert.equal(persistence.stdout.trim(), 'checkpoint-retained');
  const stop = await isolated.close(); assert.equal(stop.stopStatus, 200); assert.equal(stop.stop.status, 'completed'); assert.equal(stop.nativeStopConfirmed, true);
  assert.equal(h.calls.filter((call) => call.method === 'observe').length, 1); assert.equal(h.calls.filter((call) => call.method === 'stop').length, 1); assert.equal(h.calls.filter((call) => call.method === 'app.launch').length, 0);
  const containers = execFileSync('docker', ['ps', '--all', '--quiet', '--filter', `id=${isolated.id}`], { encoding: 'utf8', windowsHide: true }); assert.equal(containers.trim(), '');
  const artifact = resolve(fileURLToPath(new URL('../../../', import.meta.url)), 'test-results/phone-control/isolation/verification.json'); mkdirSync(join(artifact, '..'), { recursive: true });
  const sources = Object.fromEntries(['host.mjs','guest.mjs','protocol.mjs','Dockerfile'].map(name => [name,createHash('sha256').update(readFileSync(new URL(`../deployment/${name}`,import.meta.url))).digest('hex')]));
  writeFileSync(artifact, JSON.stringify({ date: new Date().toISOString(), category: 'actual_container_boundary_with_synthetic_broker', phoneContacted: false, engine, ...built, boundary: isolated.evidence, checks, persistentWorkspace: true, scopedStop: true, containerRemoved: true, sourceHashes: sources, limits: ['No kernel/hypervisor exploit resistance certification','No external model provider integration','No real phone or Android acceptance in this test','Filesystem persists only for the lifetime of this container'] }, null, 2));
});
