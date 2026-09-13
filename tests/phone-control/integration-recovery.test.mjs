import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Execute the actual confined QA program with synthetic SDK boundaries so a
// failed postcondition cannot erase recovery facts before the host receives them.
const source = readFileSync(new URL('./integration.mjs', import.meta.url), 'utf8');
const embedded = /const output = await isolation\.run\(`([\s\S]*?)`\);/u.exec(source)?.[1];
assert.ok(embedded);
const program = runInNewContext('`' + embedded + '`').replace(/^\s*import .+;\s*$/gmu, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction('assert', 'PhonePilot', 'SourcePhoneTask', 'process', 'console', program);
const facts = { retryCount: 1, initialError: 'screenshot_internal_error', initialStage: 'awaiting_callback', initialElapsedMs: 5004, totalElapsedMs: 5400 };
const view = (counter) => ({ nodes: [{ text: `Counter: ${counter}` }], captureRecovery: facts });

async function fixture(observations) {
  const output = [];
  class Pilot { async acquireTask() {} async releaseTask() {} }
  class Task {
    checkpoint = { actions: [{}] };
    async observe() { const value = observations.shift(); if (value instanceof Error) throw value; return value; }
    async act() { return { status: 'completed' }; }
    finish() { return { status: 'awaiting_verification', independentlyVerified: false }; }
  }
  let failure;
  try { await execute(assert, Pilot, Task, { env: {} }, { log: (line) => output.push(JSON.parse(line)) }); }
  catch (error) { failure = error; }
  assert.equal(output.length, 1);
  return { report: output[0], failure };
}
test('actual confined program retains successful recoveries without claiming independent verification', async () => {
  const { report, failure } = await fixture([view(3), view(4)]);
  assert.equal(failure, undefined);
  assert.equal(report.status, 'awaiting_verification');
  assert.equal(report.independentlyVerified, false);
  assert.deepEqual(report.captureRecoveries, [{ observed: true, captureRecovery: facts }, { observed: true, captureRecovery: facts }]);
});
test('a wrong postcondition preserves both preceding recovery failures', async () => {
  const { report, failure } = await fixture([view(3), view(7)]);
  assert.ok(failure);
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.captureRecoveries, [{ observed: true, captureRecovery: facts }, { observed: true, captureRecovery: facts }]);
});
test('a terminal read failure preserves its facts and earlier recovered success', async () => {
  const denied = Object.assign(new Error('synthetic private diagnostic'), { details: { captureRecovery: facts, private: 'must not be exported' } });
  const { report, failure } = await fixture([view(3), denied]);
  assert.equal(failure, denied);
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.captureRecoveries, [{ observed: true, captureRecovery: facts }, { observed: false, captureRecovery: facts }]);
  assert.equal(JSON.stringify(report).includes('private'), false);
});
