// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join, relative, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const componentRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(componentRoot, '..', '..');
const output = resolve(repositoryRoot, 'test-results', 'phone-control', 'package-qa');
const packageJson = JSON.parse(readFileSync(join(componentRoot, 'package.json'), 'utf8'));
assert.ok(process.env.npm_execpath, 'Run with npm --prefix components/phone-control run test:package');
assert.equal(packageJson.license, 'AGPL-3.0-only');
assert.equal(Object.keys(packageJson.dependencies ?? {}).length, 0);
assert.equal(Object.keys(packageJson.optionalDependencies ?? {}).length, 0);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const expected = ['ATTRIBUTION.md', 'LICENSE', 'NOTICE', 'README.md', 'package.json', 'bin/phone-control.mjs', 'src/broker.mjs', 'src/client.mjs', 'src/client.d.mts', 'src/mcp.mjs', 'src/pilot.mjs', 'src/pilot.d.mts', 'src/security.mjs', 'src/validation.mjs', 'src/response-proof.mjs', 'src/task.mjs', 'src/task.d.mts', 'deployment/Dockerfile', 'deployment/host.mjs', 'deployment/guest.mjs', 'deployment/protocol.mjs'];
mkdirSync(output, { recursive: true });
const packed = await run(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--pack-destination', output], { cwd: componentRoot, windowsHide: true, maxBuffer: 1024 * 1024 });
const [metadata] = JSON.parse(packed.stdout);
assert.equal(metadata.name, packageJson.name);
assert.deepEqual(metadata.files.map((file) => file.path).sort(), [...expected].sort(), 'Only independent source, metadata and legal notices may ship');
const archive = join(output, metadata.filename);
const extractionRoot = mkdtempSync(join(tmpdir(), 'phone-control-package-'));
const checks = [];
try {
  await run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', archive, '-C', extractionRoot], { windowsHide: true });
  const extracted = join(extractionRoot, 'package');
  for (const file of expected) {
    assert.deepEqual(readFileSync(join(extracted, file)), readFileSync(join(componentRoot, file)), `${file} bytes must survive packing unchanged`);
  }
  checks.push(`All ${expected.length} archive files byte-identical to source; license, notice and attribution retained`);
  for (const name of ['client', 'pilot', 'task']) {
    assert.deepEqual(packageJson.exports[`./${name}`], { types: `./src/${name}.d.mts`, default: `./src/${name}.mjs` });
    assert.match(readFileSync(join(extracted, `src/${name}.d.mts`), 'utf8'), /SPDX-License-Identifier: AGPL-3\.0-only/);
  }
  assert.equal(packageJson.exports['./isolation'], './deployment/host.mjs');
  for (const name of ['Dockerfile', 'host.mjs', 'guest.mjs', 'protocol.mjs']) assert.match(readFileSync(join(extracted, 'deployment', name), 'utf8'), /SPDX-License-Identifier: AGPL-3\.0-only/);
  checks.push('Typed client/pilot/task export mappings and all isolated-deployment source/legal headers are included');
  const cli = join(extracted, 'bin', 'phone-control.mjs');
  const environment = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH };
  const [version, license] = await Promise.all([
    run(process.execPath, [cli, '--version'], { cwd: extracted, env: environment, windowsHide: true }),
    run(process.execPath, [cli, '--license'], { cwd: extracted, env: environment, windowsHide: true, maxBuffer: 128 * 1024 }),
  ]);
  assert.match(version.stdout, /Orchestrator Phone Control — created by the Orchestrator contributors/u);
  assert.ok(version.stdout.includes(packageJson.version));
  assert.ok(license.stdout.includes(readFileSync(join(extracted, 'LICENSE'), 'utf8')));
  assert.ok(license.stdout.includes(readFileSync(join(extracted, 'ATTRIBUTION.md'), 'utf8')));
  checks.push('Extracted CLI --version and --license run outside the repository with no installation or build');
  const imported = await run(process.execPath, ['--input-type=module', '-e', "import { PhonePilot, selectNode } from '@orchestrator/phone-control/pilot'; import { createClient } from '@orchestrator/phone-control/client'; import { SourcePhoneTask, readTaskCheckpoint, inspectTaskCheckpoint } from '@orchestrator/phone-control/task'; import { IsolatedSource, buildImage } from '@orchestrator/phone-control/isolation'; if ([PhonePilot, selectNode, createClient, SourcePhoneTask, readTaskCheckpoint, inspectTaskCheckpoint, IsolatedSource, buildImage].some(value => typeof value !== 'function')) process.exit(1);"], { cwd: extracted, env: environment, windowsHide: true });
  assert.equal(imported.stdout, ''); assert.equal(imported.stderr, ''); checks.push('Extracted pilot, client, task and isolation package exports import without repository files, Docker invocation or npm dependencies');
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'package-verification', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ];
  const mcp = await new Promise((yes, no) => {
    const child = spawn(process.execPath, [cli, 'mcp'], { cwd: extracted, env: { ...environment, PHONE_CONTROL_TOKEN: 'synthetic-package-test-token-no-phone-access' }, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; }); child.once('error', no);
    child.once('close', (code) => yes({ code, stdout, stderr }));
    child.stdin.end(`${messages.map((message) => JSON.stringify(message)).join('\n')}\n`);
  });
  assert.equal(mcp.code, 0, mcp.stderr); assert.equal(mcp.stderr, '');
  const replies = mcp.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(replies.length, 2); assert.equal(replies[0].result.protocolVersion, '2025-11-25');
  assert.deepEqual(replies[1].result.tools.map((tool) => tool.name), ['phone_state', 'phone_call', 'phone_task_acquire', 'phone_task_status', 'phone_task_release', 'phone_receipt_status']);
  checks.push('Extracted MCP subprocess negotiates pinned lifecycle and lists tools with JSON-RPC-only stdout');
  const inventory = {
    format: 'orchestrator-phone-control-dependency-inventory', schemaVersion: 1, generatedAt: new Date().toISOString(),
    component: { name: packageJson.name, version: packageJson.version, source: 'https://github.com/QuintonD/orchestrator-portal', license: packageJson.license, additionalTerms: 'ATTRIBUTION.md (AGPL section 7(b) attribution preservation)', attribution: 'Orchestrator Phone Control — created by the Orchestrator contributors' },
    archive: { filename: basename(archive), sha256: hash(readFileSync(archive)), files: expected.map((path) => ({ path, sha256: hash(readFileSync(join(extracted, path))) })) },
    bundledThirdPartyPackages: [], npmRuntimeDependencies: {}, npmOptionalDependencies: {}, npmDevelopmentDependencies: packageJson.devDependencies ?? {},
    externalRuntime: { name: 'Node.js', requirement: packageJson.engines.node, testedVersion: process.version, bundled: false, licenseNotice: 'The separately installed Node.js runtime and its bundled dependencies retain their own distribution notices; they are not included in this archive or inventoried here.' },
    nativeCompanion: { bundled: false, location: 'apps/phone-android', separateLicense: 'AGPL-3.0-only with its ATTRIBUTION.md term' },
    completeness: 'Inventory of this npm archive only, not an SPDX/CycloneDX conformance claim or a complete host/Node/Android system SBOM.',
  };
  writeFileSync(join(output, 'dependency-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(join(output, 'verification.json'), `${JSON.stringify({ passed: true, generatedAt: new Date().toISOString(), archive: basename(archive), sha256: inventory.archive.sha256, node: process.version, checks, excluded: ['tests', 'runtime configuration', 'tokens', 'state', 'portal code'], limitations: ['MCP lifecycle only in extracted artifact; no real broker/native/phone connection in this package check', 'Node runtime and Android companion distributed separately'] }, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, archive: relative(repositoryRoot, archive), dependencyInventory: relative(repositoryRoot, join(output, 'dependency-inventory.json')), verification: relative(repositoryRoot, join(output, 'verification.json')), checks }, null, 2));
} finally {
  // Delete only this script's dedicated temporary extraction directory, never a computed repository path.
  const extractionPath = resolve(extractionRoot); const relativeToTemp = relative(resolve(tmpdir()), extractionPath);
  assert.ok(relativeToTemp && !isAbsolute(relativeToTemp) && !relativeToTemp.startsWith('..') && basename(extractionPath).startsWith('phone-control-package-'));
  rmSync(extractionPath, { recursive: true, force: true });
}
