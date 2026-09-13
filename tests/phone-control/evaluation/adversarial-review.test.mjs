import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRun, EvaluationInputError, manifestDigest, validateManifest, validateRun } from "./evaluate.mjs";
import { frontierManifest } from "./manifest.mjs";
import { successfulSyntheticRun } from "./fixtures.mjs";

test("a relaxed task-success threshold cannot excuse a claim on a noncompleted attempt", () => {
  const manifest = structuredClone(frontierManifest);
  manifest.thresholds.minTaskSuccessRate = 0;
  for (const status of ["timeout", "failed", "infrastructure_error", "not_run"]) {
    const run = successfulSyntheticRun(manifest);
    run.attempts[0].status = status;
    const result = evaluateRun(manifest, run);
    assert.equal(result.passed, false, status);
    assert.ok(result.failures.includes("false_success"), status);
    assert.equal(result.metrics.falseSuccess.numerator, 1);
    assert.equal(result.metrics.taskSuccess.numerator, 26);
    assert.equal(result.tasks[0].verified, false);
    assert.ok(result.tasks[0].reasons.includes("false_success"));
  }
});

test("honestly reported task failure remains subject to the preregistered success threshold", () => {
  const manifest = structuredClone(frontierManifest);
  manifest.thresholds.minTaskSuccessRate = 0;
  const run = successfulSyntheticRun(manifest);
  run.attempts[0].status = "timeout";
  run.attempts[0].claimedSuccess = false;
  run.attempts[0].verification.outcome = "unknown";
  const result = evaluateRun(manifest, run);
  assert.equal(result.passed, true);
  assert.equal(result.metrics.taskSuccess.denominator, 27);
  assert.equal(result.metrics.taskSuccess.numerator, 26);
  assert.equal(result.metrics.falseSuccess.numerator, 0);
});

test("sparse telemetry cannot satisfy observation, action or stop measurement counts", () => {
  for (const key of ["observationMs", "actionMs", "stopMs"]) {
    const run = successfulSyntheticRun();
    const attempt = run.attempts.find((item) => item.taskId === "stop-no-new-dispatch");
    attempt.timing[key] = Array(attempt.timing[key].length);
    assert.throws(() => evaluateRun(frontierManifest, run), EvaluationInputError, key);
  }
});

test("sparse attempts, tasks and seeds reject before scoring or manifest hashing", () => {
  const run = successfulSyntheticRun(); delete run.attempts[0];
  assert.throws(() => validateRun(run), EvaluationInputError);
  const sparseTasks = structuredClone(frontierManifest); delete sparseTasks.tasks[0];
  assert.throws(() => validateManifest(sparseTasks), EvaluationInputError);
  const sparseSeeds = structuredClone(frontierManifest); delete sparseSeeds.tasks[0].seeds[0];
  assert.throws(() => manifestDigest(sparseSeeds), EvaluationInputError);
});
