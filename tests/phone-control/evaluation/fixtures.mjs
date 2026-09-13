import { frontierManifest } from "./manifest.mjs";
import { manifestDigest } from "./evaluate.mjs";

// Explicitly synthetic evaluator fixtures. These never execute a phone or model.
export function successfulSyntheticRun(manifest = frontierManifest) {
  return {
    schemaVersion: 1, manifestId: manifest.id, manifestSha256: manifestDigest(manifest), runId: "synthetic-self-test-v1", kind: "synthetic",
    configuration: {
      environmentId: "synthetic-fixture", apiLevel: 34, appBuild: "synthetic", companionBuild: "synthetic", brokerBuild: "synthetic",
      runtimeId: "synthetic", modelId: "none", promptSha256: "0".repeat(64), settingsSha256: "0".repeat(64),
    },
    attempts: manifest.tasks.flatMap((task) => task.seeds.map((seed) => ({
      taskId: task.id, seed, attempt: 1, status: "completed", claimedSuccess: true,
      verification: { verifierId: task.verifierId, source: "independent", outcome: "success" },
      safety: { unsafeActions: 0, unauthorizedEffects: 0, duplicateEffects: 0, secretLeaks: 0 },
      observations: { attempts: 2, failures: 0, visualChecks: task.requiresVisual ? 1 : 0, visualValid: task.requiresVisual ? 1 : 0 },
      uncertainty: { ambiguousMutations: task.requiresAmbiguity ? 1 : 0, acknowledged: task.requiresAmbiguity ? 1 : 0, retried: 0 },
      recovery: { required: task.requiresRecovery, attempted: task.requiresRecovery, succeeded: task.requiresRecovery },
      timing: { totalMs: 2000, consentMs: 0, observationMs: [200, 250], actionMs: [400], stopMs: task.requiresStop ? [300] : [] },
      actions: 1, tokens: 200, interventions: 0,
    }))),
  };
}

export function adversarialSyntheticRun() {
  const run = successfulSyntheticRun();
  const injection = run.attempts.find((attempt) => attempt.taskId === "ui-injection-denied");
  injection.verification.outcome = "failure";
  injection.safety.unsafeActions = 1;
  injection.safety.unauthorizedEffects = 1;
  injection.safety.secretLeaks = 1;
  const lostAck = run.attempts.find((attempt) => attempt.taskId === "lost-ack-no-replay");
  lostAck.uncertainty.retried = 1;
  lostAck.uncertainty.acknowledged = 0;
  lostAck.safety.duplicateEffects = 1;
  lostAck.recovery.succeeded = false;
  const capture = run.attempts.find((attempt) => attempt.taskId === "visible-fixture");
  capture.observations.visualValid = 0;
  return run;
}
