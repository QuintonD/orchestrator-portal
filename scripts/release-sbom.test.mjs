import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseSbom, validateReleaseSbom, validateReleaseSbomSourceInventory, productionNpmBom, npmGraph } from './release-sbom.mjs';
import { releaseAssets } from './release-manifest.mjs';
import runtime from './desktop/runtime.json' with { type: 'json' };

const commit = 'a'.repeat(40);
const artifacts = releaseAssets('0.1.0-alpha.7', '0.1.0-alpha.2', '0.1.0-alpha.1').map((name) => ({ name, bytes: 12, sha256: 'b'.repeat(64) }));
const brokerSource = [{ path: 'LICENSE', sha256: 'c'.repeat(64) }, { path: 'src/broker.mjs', sha256: 'd'.repeat(64) }];
const options = { commit, artifacts, brokerSource };
const npmBom = { '$schema': 'http://cyclonedx.org/schema/bom-1.5.schema.json', bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { component: { type: 'application', 'bom-ref': 'portal', name: 'orchestrator-portal', version: '0.1.0-alpha.7' } }, components: [{ type: 'library', 'bom-ref': 'fastify', name: 'fastify', version: '5.12.3', purl: 'pkg:npm/fastify@5.12.3', licenses: [{ license: { id: 'MIT' } }] }, { type: 'library', 'bom-ref': 'react', name: 'react', version: '19.2.8', purl: 'pkg:npm/react@19.2.8' }], dependencies: [{ ref: 'portal', dependsOn: ['fastify', 'react'] }, { ref: 'fastify', dependsOn: [] }, { ref: 'react', dependsOn: [] }] };
function sourceFixture() {
  return { npmBom, lockSha256: 'e'.repeat(64), brokerPackage: { name: '@orchestrator/phone-control', version: '0.1.0-alpha.1', license: 'AGPL-3.0-only' }, runtime, nativeApps: [{ name: 'gateway', version: '0.1.0-alpha.7', license: 'Apache-2.0', applicationId: 'io.github.quintond.orchestrator', versionCode: 9, minSdk: 26, targetSdk: 36, compileSdk: 36 }, { name: 'phone-control-companion', version: '0.1.0-alpha.2', license: 'AGPL-3.0-only', applicationId: 'io.github.quintond.orchestrator.phonecontrol', versionCode: 2, minSdk: 34, targetSdk: 36, compileSdk: 36 }], image: 'node@sha256:' + 'f'.repeat(64) };
}
function fixture() { return createReleaseSbom({ ...sourceFixture(), ...options }); }
test('valid scoped CycloneDX inventory preserves npm graph/licenses and binds all binary/source hashes', () => {
  const bom = fixture(); assert.equal(validateReleaseSbom(bom, options), true);
  assert.deepEqual(bom.components[0].licenses, npmBom.components[0].licenses);
  assert.equal(bom.components[1].licenses, undefined);
  assert.equal(bom.components.filter((item) => item['bom-ref'].startsWith('runtime:node:')).length, 6);
  assert.equal(bom.compositions[0].aggregate, 'incomplete');
  assert.deepEqual(npmBom.dependencies[0].dependsOn, ['fastify', 'react'], 'input graph remains unchanged');
});
test('artifact and broker source tampering, omissions and duplicates fail closed', () => {
  for (const change of [
    (bom) => { bom.components.find((item) => item['bom-ref'].startsWith('distribution:')).hashes[0].content = '0'.repeat(64); },
    (bom) => { bom.components = bom.components.filter((item) => item['bom-ref'] !== `distribution:${artifacts[0].name}`); },
    (bom) => { bom.components.push(structuredClone(bom.components[0])); },
    (bom) => { bom.components.find((item) => item['bom-ref'] === 'application:phone-control-broker').components[0].hashes[0].content = '0'.repeat(64); },
    (bom) => { bom.components.find((item) => item['bom-ref'].startsWith('distribution:')).properties[0].value = '0'; },
  ]) { const bom = fixture(); change(bom); assert.throws(() => validateReleaseSbom(bom, options)); }
});
test('invalid official schema, stale commit, false completeness and dangling graph are rejected', () => {
  for (const change of [
    (bom) => { bom.specVersion = '1.6'; },
    (bom) => { bom.unknownField = true; },
    (bom) => { bom.metadata.component.properties.find((item) => item.name === 'orchestrator:git:commit').value = '0'.repeat(40); },
    (bom) => { bom.metadata.component.properties.find((item) => item.name === 'orchestrator:git:dirty').value = 'true'; },
    (bom) => { bom.compositions[0].aggregate = 'complete'; },
    (bom) => { bom.metadata.component.properties = bom.metadata.component.properties.filter((item) => item.name !== 'orchestrator:scope:container'); },
    (bom) => { bom.dependencies[0].dependsOn.push('missing'); },
    (bom) => { bom.dependencies.pop(); },
    (bom) => { bom.components.find((item) => item['bom-ref'] === 'runtime:node:win32-x64').externalReferences[0].hashes[0].content = '0'.repeat(64); },
    (bom) => { bom.components.find((item) => item['bom-ref'] === 'application:phone-control-companion').version = '0.1.0-alpha.3'; },
  ]) { const bom = fixture(); change(bom); assert.throws(() => validateReleaseSbom(bom, options)); }
});
test('npm graph comparison detects installed package or transitive changes without comparing declared author/license text', () => {
  const copy = structuredClone(npmBom); copy.components[0].licenses = [];
  assert.deepEqual(npmGraph(copy), npmGraph(npmBom));
  copy.components[0].version = '5.0.0'; assert.notDeepEqual(npmGraph(copy), npmGraph(npmBom));
});
test('source comparison rejects plausible forged license, npm edges, native metadata, container pins and lock digests', () => {
  assert.equal(validateReleaseSbomSourceInventory(fixture(), sourceFixture(), options), true);
  for (const change of [
    (bom) => { bom.components[0].licenses = [{ license: { id: 'Apache-2.0' } }]; },
    (bom) => { bom.dependencies.find((item) => item.ref === 'fastify').dependsOn.push('react'); },
    (bom) => { bom.metadata.component.properties.find((item) => item.name === 'orchestrator:npm:lock:sha256').value = '0'.repeat(64); },
    (bom) => { const app = bom.components.find((item) => item['bom-ref'] === 'application:gateway'); app.properties.find((item) => item.name === 'orchestrator:android:versionCode').value = '99'; },
    (bom) => { const container = bom.components.find((item) => item['bom-ref'] === 'runtime:confined-node-image'); container.version = 'node@sha256:' + '0'.repeat(64); container.properties.find((item) => item.name === 'orchestrator:container:image').value = container.version; },
  ]) { const bom = fixture(); change(bom); assert.equal(validateReleaseSbom(bom, options), true); assert.throws(() => validateReleaseSbomSourceInventory(bom, sourceFixture(), options)); }
});
test('production closure restores shared dev/runtime transitives and excludes development-only edges', () => {
  const component = (name) => ({ type: 'library', name, version: '1.0.0', 'bom-ref': `${name}@1.0.0`, purl: `pkg:npm/${name}@1.0.0`, hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }] });
  const full = { metadata: { component: { 'bom-ref': 'root@1.0.0' } }, components: ['server', 'compiler', 'ajv', 'test-only'].map(component), dependencies: [] };
  const omitted = structuredClone(full); omitted.components = omitted.components.filter((item) => ['server', 'compiler'].includes(item.name));
  const lock = { packages: { '': { name: 'root', version: '1.0.0', workspaces: ['apps/*'], devDependencies: { ajv: '1.0.0', 'test-only': '1.0.0' } }, 'apps/server': { name: 'server', version: '1.0.0', dependencies: { compiler: '1.0.0' }, devDependencies: { 'test-only': '1.0.0' } }, 'node_modules/server': { link: true, resolved: 'apps/server' }, 'node_modules/compiler': { version: '1.0.0', dependencies: { ajv: '1.0.0' }, peerDependencies: { absent: '*' }, peerDependenciesMeta: { absent: { optional: true } } }, 'node_modules/ajv': { version: '1.0.0' }, 'node_modules/test-only': { version: '1.0.0' } } };
  const result = productionNpmBom({ omitted, fullInstalled: full, fullLocked: full, lock });
  assert.deepEqual(result.components.map((item) => item.name), ['ajv', 'compiler', 'server']);
  assert.deepEqual(result.dependencies.find((item) => item.ref === 'compiler@1.0.0').dependsOn, ['ajv@1.0.0']);
  const missing = structuredClone(full); missing.components = missing.components.filter((item) => item.name !== 'ajv');
  assert.throws(() => productionNpmBom({ omitted, fullInstalled: missing, fullLocked: full, lock }), /Required production component absent/u);
  const tampered = structuredClone(full); tampered.components.find((item) => item.name === 'ajv').hashes[0].content = 'b'.repeat(64);
  assert.throws(() => productionNpmBom({ omitted, fullInstalled: tampered, fullLocked: full, lock }), /differs from lock/u);
});
