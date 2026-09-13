import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from './third-party/cyclonedx-1.5/bom-1.5.schema.json' with { type: 'json' };
import spdx from './third-party/cyclonedx-1.5/spdx.schema.json' with { type: 'json' };
import jsf from './third-party/cyclonedx-1.5/jsf-0.82.schema.json' with { type: 'json' };

const digest = /^[a-f0-9]{64}$/u;
const targets = ['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const prop = (name, value) => ({ name, value: String(value) });
const hashes = (value) => [{ alg: 'SHA-256', content: value }];
export const scope = Object.freeze({
  npm: 'Installed npm production dependency inventory, selected through the package-lock.json production closure with dev dependency edges omitted. npm omit-dev output is checked and shared dev/production packages are restored from full installed metadata. Includes server runtime packages and bundled web dependencies; package licenses are upstream declarations, not a legal review.',
  native: 'Gateway and companion application metadata and declared runtime dependency scope. Both applications use Android platform APIs and declare no runtime Maven dependencies. Android framework, device firmware and build tools are excluded.',
  desktop: 'Six pinned Node.js runtime versions and upstream archive checksums from scripts/desktop/runtime.json. Desktop packages include the Node executable and its notices, not the complete upstream archive. Embedded Node third-party components are not separately enumerated.',
  container: 'Confined source Node image is identified by its pinned OCI digest. It is an optional runtime input, not a tenth binary distribution. Image operating-system packages and its embedded dependencies are not enumerated.',
  completeness: 'Application dependency and distribution inventory; not a complete operating-system, browser, device, Node internals, container-image, development-toolchain or vulnerability SBOM. Distribution hashes identify bytes; they do not prove every bundled file was independently analyzed.',
});
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat('iri-reference', (value) => { try { if (/\s/u.test(value)) return false; new URL(value, 'https://cyclonedx.org/'); return true; } catch { return false; } });
ajv.addFormat('idn-email', /^[^\s@]+@[^\s@]+$/u);
ajv.addSchema(spdx, 'http://cyclonedx.org/schema/spdx.schema.json');
ajv.addSchema(jsf, 'http://cyclonedx.org/schema/jsf-0.82.schema.json');
const validateFormat = ajv.compile(schema);

function property(component, name) {
  const values = (component.properties ?? []).filter((item) => item.name === name);
  assert.equal(values.length, 1, `Exactly one ${name} property is required`);
  return values[0].value;
}
function flatten(components) { return components.flatMap((component) => [component, ...flatten(component.components ?? [])]); }
function inventory(components, prefix, nameKey) {
  return components.filter((component) => component['bom-ref'].startsWith(prefix)).map((component) => {
    assert.equal(component.type, 'file'); assert.equal(component['bom-ref'], prefix + component.name);
    assert.equal(component.hashes?.length, 1); assert.equal(component.hashes[0].alg, 'SHA-256'); assert.match(component.hashes[0].content, digest);
    return { [nameKey]: component.name, sha256: component.hashes[0].content };
  }).sort((a, b) => a[nameKey].localeCompare(b[nameKey]));
}

// No network, process execution or source-tree reads occur in this validator.
// The manifest supplies the independently hashed binary and broker inventories.
export function validateReleaseSbom(sbom, { commit, artifacts, brokerSource }) {
  assert.ok(validateFormat(sbom), `Invalid CycloneDX 1.5 JSON: ${ajv.errorsText(validateFormat.errors)}`);
  assert.equal(sbom.specVersion, '1.5'); assert.match(commit, /^[a-f0-9]{40}$/u);
  const root = sbom.metadata?.component; assert.ok(root);
  assert.equal(property(root, 'orchestrator:git:commit'), commit);
  assert.equal(property(root, 'orchestrator:git:dirty'), 'false');
  assert.match(property(root, 'orchestrator:npm:lock:sha256'), digest);
  for (const [name, value] of Object.entries(scope)) assert.equal(property(root, `orchestrator:scope:${name}`), value);
  assert.deepEqual(sbom.compositions, [{ aggregate: 'incomplete', assemblies: [root['bom-ref']] }]);
  const components = flatten(sbom.components ?? []);
  const refs = [root, ...components].map((item) => item['bom-ref']);
  assert.ok(refs.every((value) => typeof value === 'string' && value));
  assert.equal(new Set(refs).size, refs.length, 'SBOM component identifiers must be unique');
  assert.equal(artifacts.length, 9); assert.equal(new Set(artifacts.map((item) => item.name)).size, 9);
  assert.deepEqual(inventory(components, 'distribution:', 'name'), artifacts.map(({ name, sha256 }) => ({ name, sha256 })).sort((a, b) => a.name.localeCompare(b.name)), 'SBOM must bind exactly the nine staged distribution hashes');
  for (const artifact of artifacts) {
    assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0);
    assert.equal(property(components.find((item) => item['bom-ref'] === `distribution:${artifact.name}`), 'orchestrator:distribution:bytes'), String(artifact.bytes));
  }
  assert.ok(brokerSource.length > 0);
  assert.deepEqual(inventory(components, 'broker-source:', 'path'), [...brokerSource].sort((a, b) => a.path.localeCompare(b.path)), 'SBOM broker files must match the archived source allowlist');
  const broker = components.find((item) => item['bom-ref'] === 'application:phone-control-broker'); assert.ok(broker);
  assert.equal(property(broker, 'orchestrator:runtime:npmDependencies'), 'none');
  assert.deepEqual(broker.licenses, [{ license: { id: 'AGPL-3.0-only' } }]);
  assert.ok(artifacts.some((item) => item.name === `orchestrator-phone-control-${broker.version}.tgz`));
  assert.deepEqual(inventory(flatten(broker.components ?? []), 'broker-source:', 'path'), [...brokerSource].sort((a, b) => a.path.localeCompare(b.path)));
  for (const name of ['gateway', 'phone-control-companion']) {
    const app = components.find((item) => item['bom-ref'] === `application:${name}`); assert.ok(app);
    assert.equal(property(app, 'orchestrator:android:runtimeMavenDependencies'), 'none');
    for (const field of ['versionCode', 'minSdk', 'targetSdk', 'compileSdk']) assert.match(property(app, `orchestrator:android:${field}`), /^[1-9]\d*$/u);
    assert.match(property(app, 'orchestrator:android:applicationId'), /^io\.github\.quintond\.orchestrator(?:\.phonecontrol)?$/u);
    assert.equal(property(app, 'orchestrator:android:applicationId'), name === 'gateway' ? 'io.github.quintond.orchestrator' : 'io.github.quintond.orchestrator.phonecontrol');
    assert.ok(artifacts.some((item) => item.name === `${name === 'gateway' ? 'orchestrator' : 'phone-control'}-${app.version}.apk`));
  }
  const runtimes = components.filter((item) => item['bom-ref'].startsWith('runtime:node:'));
  assert.deepEqual(runtimes.map((item) => property(item, 'orchestrator:runtime:target')).sort(), [...targets].sort());
  for (const runtime of runtimes) {
    assert.match(runtime.version, /^24\.\d+\.\d+$/u);
    assert.match(property(runtime, 'orchestrator:runtime:upstreamArchiveSha256'), digest);
    assert.equal(property(runtime, 'orchestrator:scope:desktop'), scope.desktop);
    const target = property(runtime, 'orchestrator:runtime:target');
    assert.equal(runtime['bom-ref'], `runtime:node:${target}`);
    assert.ok(artifacts.some((item) => item.name === `orchestrator-${root.version}-${target}.${target.startsWith('win32') ? 'zip' : 'tar.gz'}`));
    assert.deepEqual(runtime.externalReferences, [{ type: 'distribution', url: `https://nodejs.org/dist/v${runtime.version}/${property(runtime, 'orchestrator:runtime:upstreamArchive')}`, hashes: hashes(property(runtime, 'orchestrator:runtime:upstreamArchiveSha256')) }]);
  }
  const container = components.find((item) => item['bom-ref'] === 'runtime:confined-node-image'); assert.ok(container);
  assert.equal(container.type, 'container'); assert.match(property(container, 'orchestrator:container:image'), /^node@sha256:[a-f0-9]{64}$/u);
  assert.equal(property(container, 'orchestrator:scope:container'), scope.container);
  assert.equal(container.version, property(container, 'orchestrator:container:image'));
  const graphRefs = new Set();
  for (const edge of sbom.dependencies ?? []) {
    assert.ok(refs.includes(edge.ref) && !graphRefs.has(edge.ref), 'Every dependency node must have one known component'); graphRefs.add(edge.ref);
    assert.ok((edge.dependsOn ?? []).every((ref) => refs.includes(ref)), 'Dependency targets must be present');
  }
  for (const ref of refs) assert.ok(graphRefs.has(ref), `Dependency graph missing ${ref}`);
  assert.ok(components.some((item) => item.purl?.startsWith('pkg:npm/fastify@')), 'Server npm inventory required');
  assert.ok(components.some((item) => item.purl?.startsWith('pkg:npm/react@')), 'Bundled web npm inventory required');
  return true;
}

export function npmGraph(bom) {
  return {
    components: bom.components.map((item) => ({ ref: item['bom-ref'], version: item.version, purl: item.purl, hashes: item.hashes ?? [] })).sort((a, b) => a.ref.localeCompare(b.ref)),
    dependencies: bom.dependencies.map((item) => ({ ref: item.ref, dependsOn: [...(item.dependsOn ?? [])].sort() })).sort((a, b) => a.ref.localeCompare(b.ref)),
  };
}

export function productionNpmBom({ omitted, fullInstalled, fullLocked, lock }) {
  const packages = lock.packages; assert.ok(packages?.['']);
  const rootRef = omitted.metadata.component['bom-ref'];
  const visited = new Set(); const edges = new Map(); const refs = new Set();
  const nameOf = (location) => packages[location].name ?? location.split('node_modules/').at(-1);
  const refOf = (location) => location ? `${nameOf(location)}@${packages[location].version}` : rootRef;
  function resolveDependency(location, name, optional) {
    let parent = location;
    for (;;) {
      const candidate = [parent, 'node_modules', name].filter(Boolean).join('/');
      const entry = packages[candidate];
      if (entry) { const resolved = entry.link ? entry.resolved : candidate; assert.ok(packages[resolved], 'Unresolved workspace link'); return resolved; }
      if (!parent) break;
      parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '';
    }
    assert.ok(optional, `Missing required production dependency ${name} from ${location}`); return undefined;
  }
  function visit(location) {
    if (visited.has(location)) return; visited.add(location);
    const entry = packages[location]; const ref = refOf(location); refs.add(ref);
    const dependencies = new Set(edges.get(ref) ?? []); edges.set(ref, dependencies);
    const names = new Set([...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {}), ...Object.keys(entry.peerDependencies ?? {})]);
    for (const name of names) {
      const optional = Object.hasOwn(entry.optionalDependencies ?? {}, name) || (!Object.hasOwn(entry.dependencies ?? {}, name) && entry.peerDependenciesMeta?.[name]?.optional === true);
      const resolved = resolveDependency(location, name, optional); if (!resolved) continue;
      dependencies.add(refOf(resolved)); visit(resolved);
    }
  }
  visit('');
  for (const [location, entry] of Object.entries(packages)) if (entry.link && location.startsWith('node_modules/')) {
    const workspace = entry.resolved;
    assert.ok((packages[''].workspaces ?? []).some((pattern) => pattern.endsWith('/*') ? workspace.startsWith(pattern.slice(0, -1)) && !workspace.slice(pattern.length - 1).includes('/') : workspace === pattern), 'Review non-workspace link before runtime inventory');
    edges.get(rootRef).add(refOf(workspace)); visit(workspace);
  }
  const installed = new Map(fullInstalled.components.map((item) => [item['bom-ref'], item]));
  const locked = new Map(fullLocked.components.map((item) => [item['bom-ref'], item]));
  for (const item of omitted.components) assert.ok(refs.has(item['bom-ref']), `Unexpected nonproduction npm component ${item['bom-ref']}`);
  const bom = structuredClone(omitted);
  bom.components = [...refs].filter((ref) => ref !== rootRef).sort().map((ref) => {
    assert.ok(installed.has(ref) && locked.has(ref), `Required production component absent from installed or locked npm inventory: ${ref}`);
    const identity = (item) => ({ ref: item['bom-ref'], version: item.version, purl: item.purl, hashes: item.hashes ?? [] });
    assert.deepEqual(identity(installed.get(ref)), identity(locked.get(ref)), `Installed production component differs from lock: ${ref}`);
    return structuredClone(installed.get(ref));
  });
  bom.dependencies = [...edges].map(([ref, values]) => ({ ref, dependsOn: [...values].sort() })).sort((a, b) => a.ref.localeCompare(b.ref));
  return bom;
}

export function createReleaseSbom({ npmBom, commit, lockSha256, artifacts, brokerSource, brokerPackage, runtime, nativeApps, image }) {
  assert.equal(npmBom.specVersion, '1.5', 'Review a changed npm CycloneDX version before generating');
  assert.ok(!Object.keys(brokerPackage.dependencies ?? {}).length && !Object.keys(brokerPackage.optionalDependencies ?? {}).length && !Object.keys(brokerPackage.peerDependencies ?? {}).length, 'Update broker inventory when dependencies are added');
  const sbom = structuredClone(npmBom); const root = sbom.metadata.component;
  for (const item of sbom.components) if (!item.licenses?.length) { item.properties ??= []; item.properties.push(prop('orchestrator:license:status', 'No license declaration returned by npm; consult the source package and repository terms.')); }
  sbom.serialNumber = `urn:uuid:${randomUUID()}`; sbom.version = 1;
  root.type = 'application'; root.properties ??= [];
  root.properties.push(prop('orchestrator:git:commit', commit), prop('orchestrator:git:dirty', false), prop('orchestrator:npm:lock:sha256', lockSha256), ...Object.entries(scope).map(([name, value]) => prop(`orchestrator:scope:${name}`, value)));
  sbom.metadata.lifecycles = [{ name: 'locked application inventory and staged distribution hashes', description: 'npm installed production dependencies plus source metadata and post-build artifact digests; completeness limits are explicit.' }];
  const sourceFiles = brokerSource.map(({ path, sha256 }) => ({ type: 'file', 'bom-ref': `broker-source:${path}`, name: path, hashes: hashes(sha256) }));
  const broker = { type: 'application', 'bom-ref': 'application:phone-control-broker', name: brokerPackage.name, version: brokerPackage.version, licenses: [{ license: { id: brokerPackage.license } }], properties: [prop('orchestrator:runtime:npmDependencies', 'none'), prop('orchestrator:license:attribution', 'components/phone-control/ATTRIBUTION.md')], components: sourceFiles };
  const native = nativeApps.map((app) => ({ type: 'application', 'bom-ref': `application:${app.name}`, name: app.name, version: app.version, licenses: [{ license: { id: app.license } }], properties: [prop('orchestrator:android:runtimeMavenDependencies', 'none'), ...['applicationId', 'versionCode', 'minSdk', 'targetSdk', 'compileSdk'].map((field) => prop(`orchestrator:android:${field}`, app[field]))] }));
  assert.deepEqual(Object.keys(runtime.targets).sort(), [...targets].sort());
  const runtimes = targets.map((target) => ({ type: 'application', 'bom-ref': `runtime:node:${target}`, name: 'Node.js', version: runtime.version, properties: [prop('orchestrator:runtime:target', target), prop('orchestrator:runtime:upstreamArchive', runtime.targets[target].archive), prop('orchestrator:runtime:upstreamArchiveSha256', runtime.targets[target].sha256), prop('orchestrator:scope:desktop', scope.desktop)], externalReferences: [{ type: 'distribution', url: `https://nodejs.org/dist/v${runtime.version}/${runtime.targets[target].archive}`, hashes: hashes(runtime.targets[target].sha256) }] }));
  const container = { type: 'container', 'bom-ref': 'runtime:confined-node-image', name: 'Confined source Node image', version: image, properties: [prop('orchestrator:container:image', image), prop('orchestrator:scope:container', scope.container)] };
  const distributions = artifacts.map(({ name, bytes, sha256 }) => ({ type: 'file', 'bom-ref': `distribution:${name}`, name, hashes: hashes(sha256), properties: [prop('orchestrator:distribution:bytes', bytes)] }));
  sbom.components.push(broker, ...native, ...runtimes, container, ...distributions);
  const rootEdge = sbom.dependencies.find((item) => item.ref === root['bom-ref']); assert.ok(rootEdge);
  rootEdge.dependsOn.push(broker['bom-ref'], ...native.map((item) => item['bom-ref']), ...distributions.map((item) => item['bom-ref']));
  sbom.dependencies.push({ ref: broker['bom-ref'], dependsOn: [...sourceFiles.map((item) => item['bom-ref']), container['bom-ref']] });
  for (const item of [...sourceFiles, ...native, ...runtimes, container]) sbom.dependencies.push({ ref: item['bom-ref'], dependsOn: [] });
  for (const item of distributions) {
    const target = targets.find((target) => item.name.includes(`-${target}.`));
    const dependsOn = target ? [...npmBom.dependencies.find((edge) => edge.ref === root['bom-ref']).dependsOn, `runtime:node:${target}`] : item.name.endsWith('.tgz') ? [broker['bom-ref']] : [item.name.startsWith('phone-control-') ? 'application:phone-control-companion' : 'application:gateway'];
    sbom.dependencies.push({ ref: item['bom-ref'], dependsOn });
  }
  sbom.compositions = [{ aggregate: 'incomplete', assemblies: [root['bom-ref']] }];
  validateReleaseSbom(sbom, { commit, artifacts, brokerSource }); return sbom;
}

export async function readReleaseSbomSource(root = fileURLToPath(new URL('../', import.meta.url))) {
  const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const pkg = await json('package.json'); const brokerPackage = await json('components/phone-control/package.json');
  const nativeApps = [];
  for (const [project, name, license] of [['android', 'gateway', 'Apache-2.0'], ['phone-android', 'phone-control-companion', 'AGPL-3.0-only']]) {
    const gradle = await readFile(path.join(root, `apps/${project}/app/build.gradle`), 'utf8');
    const declarations = gradle.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\r\n]*/gu, '');
    assert.ok(!/\b(?:implementation|api|runtimeOnly|compileOnly|compile|runtime)\s*(?:\(|\s)/u.test(declarations), 'Inventory new Android runtime dependencies before release');
    const app = { name, license, version: gradle.match(/versionName '([^']+)'/u)?.[1], applicationId: gradle.match(/applicationId '([^']+)'/u)?.[1] };
    for (const field of ['versionCode', 'minSdk', 'targetSdk', 'compileSdk']) app[field] = Number(gradle.match(new RegExp(`${field} (\\d+)`, 'u'))?.[1]);
    nativeApps.push(app);
  }
  const npm = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find((candidate) => candidate && existsSync(candidate));
  assert.ok(npm, 'The npm CLI must be installed with Node');
  const npmSbom = (extra = []) => JSON.parse(execFileSync(process.execPath, [npm, 'sbom', '--sbom-format', 'cyclonedx', ...extra], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }));
  const omitted = npmSbom(['--omit=dev']); assert.deepEqual(npmGraph(omitted), npmGraph(npmSbom(['--omit=dev', '--package-lock-only'])), 'Installed npm production graph differs from the lock; run npm ci before generation');
  // npm can omit a package that is both a root dev dependency and a production
  // transitive dependency. Resolve production edges independently, then select
  // those exact packages from the full installed and lock SBOMs.
  const npmBom = productionNpmBom({ omitted, fullInstalled: npmSbom(), fullLocked: npmSbom(['--package-lock-only']), lock: await json('package-lock.json') });
  const dockerfile = await readFile(path.join(root, 'components/phone-control/deployment/Dockerfile'), 'utf8');
  const image = dockerfile.match(/^ARG NODE_IMAGE=(node@sha256:[a-f0-9]{64})$/mu)?.[1]; assert.ok(image, 'Confined runtime must retain a pinned Node image');
  return { pkg, npmBom, lockSha256: sha256(await readFile(path.join(root, 'package-lock.json'))), brokerPackage, runtime: await json('scripts/desktop/runtime.json'), nativeApps, image };
}

export function validateReleaseSbomSourceInventory(sbom, source, { commit, artifacts, brokerSource }) {
  const expected = createReleaseSbom({ ...source, commit, artifacts, brokerSource });
  // Serial numbers and generation times change on regeneration. Everything else
  // comes from the current installed/locked inventory and checked-in metadata.
  for (const candidate of [expected, sbom]) assert.ok(candidate.metadata?.component);
  assert.deepEqual(sbom.metadata.component, expected.metadata.component, 'SBOM root and lock digest must match the current source');
  assert.deepEqual(sbom.metadata.lifecycles, expected.metadata.lifecycles);
  assert.deepEqual(sbom.components, expected.components, 'SBOM packages, licenses, native metadata and runtime pins must match the current source');
  assert.deepEqual(sbom.dependencies, expected.dependencies, 'SBOM must preserve the actual source dependency graph');
  assert.deepEqual(sbom.compositions, expected.compositions);
  return true;
}

export async function validateReleaseSbomSource(sbom, options) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(git('status', '--porcelain'), '', 'Validate SBOM source from a clean committed checkout');
  assert.equal(git('rev-parse', 'HEAD'), options.commit);
  validateReleaseSbomSourceInventory(sbom, await readReleaseSbomSource(root), options);
  assert.equal(git('status', '--porcelain'), '', 'Source changed during SBOM validation'); assert.equal(git('rev-parse', 'HEAD'), options.commit);
  return true;
}

export async function main(args = process.argv.slice(2)) {
  assert.equal(args.length, 1, 'Usage: node scripts/release-sbom.mjs <staged-assets>');
  const root = fileURLToPath(new URL('../', import.meta.url)); const directory = path.resolve(args[0]);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(git('status', '--porcelain'), '', 'Generate a publishable SBOM only from a clean committed checkout');
  const commit = git('rev-parse', 'HEAD');
  const { releaseAssets, brokerFiles, validateBrokerSource } = await import('./release-manifest.mjs');
  const source = await readReleaseSbomSource(root);
  const names = releaseAssets(source.pkg.version, source.nativeApps[1].version, source.brokerPackage.version);
  const entries = await readdir(directory, { withFileTypes: true });
  const artifacts = [];
  for (const name of names) {
    const entry = entries.find((item) => item.name === name); assert.ok(entry?.isFile() && !entry.isSymbolicLink(), `Missing regular staged distribution ${name}`);
    const bytes = await readFile(path.join(directory, name)); artifacts.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const sources = new Map(await Promise.all(brokerFiles.map(async (name) => [name, await readFile(path.join(root, 'components/phone-control', name))])));
  const brokerSource = validateBrokerSource(await readFile(path.join(directory, names.find((name) => name.endsWith('.tgz')))), sources);
  const sbom = createReleaseSbom({ ...source, commit, artifacts, brokerSource });
  assert.equal(git('status', '--porcelain'), '', 'Source changed during SBOM generation'); assert.equal(git('rev-parse', 'HEAD'), commit);
  const filename = path.join(directory, 'SBOM.cdx.json'); await writeFile(filename, JSON.stringify(sbom, null, 2) + '\n');
  console.log(`PASS CycloneDX 1.5 SBOM: ${artifacts.length} distributions, ${source.npmBom.components.length} npm components, ${brokerSource.length} broker source files; ${filename}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
