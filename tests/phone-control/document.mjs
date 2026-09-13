// Scripted Markor acceptance on a dedicated emulator. No source-runtime planner.
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { readEmulatorEvidence } from "./device-evidence.mjs";
import { cleanupSteps, safeFailure, stopChild, within } from "./runner-cleanup.mjs";
import { evaluateRun, manifestDigest } from "./evaluation/evaluate.mjs";
import { syntheticDocumentVariant, verifyDocumentState } from "./evaluation/verify-files.mjs";

export const MARKOR = Object.freeze({ packageName: "net.gsantner.markor", versionCode: 163, versionName: "2.16.1",
  apkSha256: "e88cdcced7aa3dca25e6b9c7a9bdcfad3e3988ee545be951f42bf9441b5e46bf",
  signerSha256: "57d106d0cfa8763442b3645ef2741c38bb820bd56fd4612bf40a23b6d998be5e",
  source: "https://github.com/gsantner/markor/releases/tag/v2.16.1" });
export const documentManifest = {
  schemaVersion: 1, id: "markor-document-home-v2",
  thresholds: { minTaskSuccessRate: 1, minRecoveryRate: 1, maxObservationFailureRate: 0, maxStopMs: 1000 },
  tasks: [{ id: "document-edit", family: "workflow", verifierId: "document-state-v1", seeds: [17, 29, 43],
    requiresVisual: false, requiresRecovery: false, requiresAmbiguity: false, requiresStop: false,
    minObservationAttempts: 3, budget: { actions: 2, tokens: 0, totalMs: 180000 } }],
};
const codes = new Set(["none", "transport_error", "unreviewed_result", "stale_observation", "window_unavailable", "protected_window", "sensitive_window", "forbidden",
  "invalid_request", "consent_denied", "consent_unavailable", "deadline_expired", "unknown_action_state", "session_expired",
  "screenshot_timeout", "screenshot_unavailable", "screenshot_internal_error", "screenshot_rate_limited", "screenshot_secure_window",
  "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large"]);
function check(value, code = "document_protocol_invalid") { if (!value) throw Object.assign(new Error(code), { documentCode: code }); }
function fields(value, keys) { check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))); }
function ms(value) { check(Number.isSafeInteger(value) && value >= 0 && value <= 180000); }
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

export class DocumentTranscript {
  constructor(seed) {
    check([17, 29, 43].includes(seed)); this.seed = seed; this.pending = null; this.markers = []; this.observations = []; this.actions = [];
    this.homeVerified = false; this.reopened = false; this.complete = false; this.terminal = false; this.assertions = 0; this.failureCodes = [];
  }
  feed(line) {
    check(typeof line === "string" && line.length <= 4096, "document_line_limit");
    if (line.startsWith("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_READY ")) {
      check(!this.pending && !this.complete && !this.terminal);
      const marker = line.slice("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_READY ".length);
      const expected = ["type", "home"][this.markers.length]; check(marker === expected);
      check(this.observations.length === this.actions.length + 1 && this.observations.every((value) => value.success));
      if (marker === "home") check(this.actions.length === 1 && this.actions[0].success);
      this.pending = { kind: "ready", value: marker };
    } else if (line.startsWith("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_EVENT ")) {
      check(!this.pending && !this.complete && !this.terminal);
      const value = JSON.parse(line.slice("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_EVENT ".length));
      this.pending = { kind: "event", value };
    } else if (line.startsWith("INSTRUMENTATION_STATUS_CODE:")) {
      check(this.pending !== null);
      const pending = this.pending; this.pending = null;
      if (pending.kind === "ready") {
        check(line === "INSTRUMENTATION_STATUS_CODE: 2"); this.markers.push(pending.value); return pending.value;
      }
      check(line === "INSTRUMENTATION_STATUS_CODE: 3"); this.event(pending.value);
    } else if (line.startsWith("INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE ")) {
      const match = /^INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE (17|29|43) ([1-9][0-9]{0,3})$/.exec(line);
      check(match && Number(match[1]) === this.seed && !this.pending && !this.complete && !this.terminal && this.reopened);
      check(this.actions.length === 2 && this.actions.every((value) => value.success) && this.markers.length === 2 && this.observations.length === 3 && this.homeVerified);
      this.complete = true; this.assertions = Number(match[2]);
    } else if (line.startsWith("INSTRUMENTATION_CODE:")) {
      check(line === "INSTRUMENTATION_CODE: -1" && this.complete && !this.terminal); this.terminal = true;
    } else if (/^INSTRUMENTATION_(?:RESULT|FAILED|ABORTED):/.test(line)) {
      this.failureCodes = [...codes].filter((code) => code !== "none" && new RegExp(`\\b${code}\\b`).test(line));
      throw Object.assign(new Error("document_native_failed"), { documentCode: "document_native_failed" });
    }
    return null;
  }
  event(value) {
    check(value && typeof value.kind === "string");
    if (value.kind === "observation") {
      fields(value, ["kind", "success", "elapsedMs", "code"]); ms(value.elapsedMs);
      check(codes.has(value.code) && value.success === (value.code === "none") && this.observations.length < 3);
      check(this.observations.length === this.actions.length && this.actions.every((action) => action.success) && !this.reopened);
      if (this.actions.length === 2) check(this.homeVerified);
      this.observations.push(value);
    } else if (value.kind === "action") {
      fields(value, ["kind", "method", "success", "elapsedMs", "consentMs", "code", "stage", "changedFields"]); ms(value.elapsedMs); ms(value.consentMs);
      check(["none", "transport", "restore_timeout", "predispatch_changed", "preconsent_changed", "consent_context_changed", "observation_expired", "other"].includes(value.stage));
      check(!value.success || value.stage === "none");
      check(Array.isArray(value.changedFields) && value.changedFields.length <= 26 && value.changedFields.every((field) => /^(?:(?:editor|other)_(?:bounds|actions|selected|checked|enabled|editable|scrollable|text|description|selection|state|identity)|tree_shape|unavailable)$/.test(field)));
      check(value.consentMs <= value.elapsedMs && codes.has(value.code) && value.success === (value.code === "none") && this.actions.length < 2);
      check(value.method === (this.actions.length ? "key" : "type"));
      check(this.observations.length === this.actions.length + 1 && this.observations.every((observation) => observation.success) && this.actions.every((action) => action.success));
      if (value.success) check(this.markers.length === this.actions.length + 1 && value.consentMs > 0);
      this.actions.push(value);
    } else if (value.kind === "home") {
      fields(value, ["kind", "resolvedLauncherVisible"]);
      check(value.resolvedLauncherVisible === true && !this.homeVerified && !this.reopened && this.actions.length === 2 && this.actions.every((action) => action.success) && this.observations.length === 2);
      this.homeVerified = true;
    } else if (value.kind === "reopen") {
      fields(value, ["kind", "ownerDriven", "editorVisible"]); check(value.ownerDriven === true && value.editorVisible === true && this.homeVerified && !this.reopened && this.actions.length === 2 && this.actions.every((action) => action.success) && this.observations.length === 3 && this.observations.every((observation) => observation.success)); this.reopened = true;
    } else check(false);
  }
  finish(exitCode) { check(exitCode === 0 && this.complete && this.terminal && !this.pending, "document_incomplete_protocol"); }
}

export function checkInventory(names) {
  const expected = [17, 29, 43].flatMap((seed) => [`target${seed}.txt`, `unrelated${seed}.txt`]).sort();
  check(Array.isArray(names) && names.length === expected.length && [...names].sort().every((name, index) => name === expected[index]), "document_inventory_changed");
}
export function remoteDirectory(run) { check(/^[a-f0-9]{32}$/.test(run), "invalid_document_run"); return `/sdcard/Download/phone-document-qa-${run}`; }
export function installedApkPath(value) {
  check(/^package:\/data\/app\/~{0,2}[A-Za-z0-9_+=.-]+\/net\.gsantner\.markor-[A-Za-z0-9_+=-]+\/base\.apk$/.test(value), "markor_installed_path_invalid");
  return value.slice(8);
}
export function documentRunPassed(report, failure, cases, cleanup) {
  return report.passed && !failure && cases.length === 3 && cases.every((item) => !item.failure) && cleanup.every((item) => item.passed);
}

export async function main() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const serial = process.env.PHONE_QA_SERIAL ?? "emulator-5576"; check(/^emulator-[0-9]{4,5}$/.test(serial), "emulator_serial_required");
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const executable = sdk ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : "adb";
  const raw = (...args) => execFileSync(executable, ["-s", serial, ...args], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const adb = (...args) => raw(...args).toString("utf8");
  const device = readEmulatorEvidence(adb);
  const runId = randomUUID().replaceAll("-", ""); const remote = remoteDirectory(runId);
  const output = join(root, "test-results/phone-control", `document-home-v2-${Date.now()}-${runId}`); mkdirSync(output, { recursive: true });
  const corpus = join(output, "synthetic-corpus"); mkdirSync(corpus);
  const companion = "io.github.quintond.orchestrator.phonecontrol.debug";
  const appApk = join(root, "test-results/phone-control/third-party/markor-v2.16.1.apk");
  const phoneApk = join(root, "apps/phone-android/app/build/outputs/apk/debug/app-debug.apk");
  const probeApk = join(root, "apps/phone-android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk");
  const attempts = []; const cases = []; let remoteOwned = false; let previousAppOp; let failure; let stage = "pin artifacts"; let setupPassed = false;
  const snapshots = () => {
    checkInventory(adb("shell", "ls", "-1A", remote).split(/\r?\n/).filter(Boolean));
    return Object.fromEntries([17, 29, 43].flatMap((seed) => ["target", "unrelated"].map((kind) => [`${kind}${seed}`, raw("exec-out", "cat", `${remote}/${kind}${seed}.txt`)])));
  };
  const configuration = { environmentId: "dedicated-api-" + device.sdk, apiLevel: device.sdk, appBuild: MARKOR.apkSha256,
    companionBuild: sha(readFileSync(phoneApk)), brokerBuild: "native-direct-no-broker", runtimeId: "document-instrumentation-home-v2", modelId: "none",
    promptSha256: sha(Buffer.from("scripted-no-model")), settingsSha256: sha(Buffer.from(JSON.stringify({ device, app: MARKOR, manifest: documentManifest }))) };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(documentManifest, null, 2), { flag: "wx" });
  writeFileSync(join(output, "experiment-lock.json"), JSON.stringify({ protocolVersion: 2, device, app: MARKOR, companionSha256: configuration.companionBuild, probeSha256: sha(readFileSync(probeApk)),
    manifestSha256: manifestDigest(documentManifest), seeds: [17, 29, 43], kind: "scripted-emulator", parameters: [17, 29, 43].map((seed) => ({ seed, sha256: syntheticDocumentVariant(seed).parameterSha256 })),
    source: { documentProbeSha256: sha(readFileSync(join(root, "apps/phone-android/app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/DocumentProbe.java"))), runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))) } }, null, 2), { flag: "wx" });
  try {
    check(sha(readFileSync(appApk)) === MARKOR.apkSha256, "markor_artifact_mismatch");
    stage = "install pinned artifacts";
    for (const apk of [appApk, phoneApk, probeApk]) adb("install", "-r", apk);
    const installedPath = installedApkPath(adb("shell", "pm", "path", MARKOR.packageName).trim());
    check(sha(raw("exec-out", "cat", installedPath)) === MARKOR.apkSha256, "markor_installed_artifact_mismatch");
    stage = "prepare isolated synthetic corpus";
    const appOp = adb("shell", "cmd", "appops", "get", MARKOR.packageName, "MANAGE_EXTERNAL_STORAGE");
    previousAppOp = /MANAGE_EXTERNAL_STORAGE:\s*(allow|deny|ignore|default)/.exec(appOp)?.[1] ?? (/No operations/.test(appOp) ? "default" : undefined);
    check(previousAppOp, "markor_appop_unknown");
    adb("shell", "cmd", "appops", "set", MARKOR.packageName, "MANAGE_EXTERNAL_STORAGE", "allow");
    adb("shell", "test", "!", "-e", remote); adb("shell", "mkdir", remote); remoteOwned = true;
    for (const seed of [17, 29, 43]) {
      const variant = syntheticDocumentVariant(seed);
      for (const kind of ["target", "unrelated"]) {
        const path = join(corpus, `${kind}${seed}.txt`); writeFileSync(path, variant.before[kind], { flag: "wx" });
        adb("push", path, `${remote}/${kind}${seed}.txt`);
      }
    }
    const initial = snapshots();
    for (const seed of [17, 29, 43]) for (const kind of ["target", "unrelated"])
      check(Buffer.from(initial[`${kind}${seed}`]).equals(Buffer.from(syntheticDocumentVariant(seed).before[kind])), "document_seed_bytes_mismatch");
    setupPassed = true;
    for (const seed of [17, 29, 43]) {
      stage = `document variant ${seed}`;
      const started = performance.now(); const transcript = new DocumentTranscript(seed); let child; let caseFailure; let verified; let after; let nativePassed = false;
      const before = snapshots();
      check(Buffer.from(before[`target${seed}`]).equals(Buffer.from(syntheticDocumentVariant(seed).before.target)), "document_seed_bytes_mismatch");
      try {
        child = spawn(executable, ["-s", serial, "shell", "am", "instrument", "-w", "-r", "-e", "documentProbe", "true", "-e", "documentRun", runId, "-e", "documentSeed", String(seed), `${companion}.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest`],
          { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let pending = ""; let total = 0; let parsingError; let fingers = Promise.resolve();
        child.stdout.on("data", (chunk) => {
          if (parsingError) return;
          try {
            total += chunk.length; check(total <= 128 * 1024, "document_output_limit"); pending += chunk.toString("utf8");
            while (pending.includes("\n")) {
              const end = pending.indexOf("\n"); const line = pending.slice(0, end).replace(/\r$/, ""); pending = pending.slice(end + 1);
              const ready = transcript.feed(line);
              if (ready) fingers = fingers.then(async () => {
                await pause(1000); check(child.exitCode === null && child.signalCode === null, "document_consent_process_ended");
                check(adb("emu", "finger", "touch", "1").trim() === "OK", "emulated_fingerprint_failed");
              }).catch((error) => { parsingError ??= error; child.kill(); });
            }
            check(pending.length <= 4096, "document_line_limit");
          } catch (error) { parsingError = error; child.kill(); }
        });
        child.stderr.resume();
        const [exitCode] = await within(() => once(child, "close"), 120000);
        await fingers;
        if (parsingError) throw parsingError;
        if (pending.trim()) transcript.feed(pending.trim());
        transcript.finish(exitCode); nativePassed = true;
      } catch (error) { caseFailure = { ...safeFailure(error), code: error.documentCode ?? safeFailure(error).code, nativeCodes: transcript.failureCodes }; }
      finally { await stopChild(child); adb("shell", "am", "force-stop", companion); }
      try {
        after = snapshots();
        verified = verifyDocumentState({ targetId: `target${seed}`, expectedBytes: syntheticDocumentVariant(seed).expectedBytes, before, after });
        if (nativePassed) writeFileSync(join(output, `markor-${seed}.png`), raw("exec-out", "screencap", "-p"), { flag: "wx" });
      } catch (error) { caseFailure ??= { ...safeFailure(error), code: error.documentCode ?? safeFailure(error).code }; }
      const ambiguous = transcript.actions.filter((action) => ["transport_error", "unknown_action_state"].includes(action.code)).length;
      const totalMs = Math.ceil(performance.now() - started);
      attempts.push({ taskId: "document-edit", seed, attempt: 1, status: nativePassed && !caseFailure ? "completed" : "failed", claimedSuccess: false,
        verification: verified?.verification ?? { verifierId: "document-state-v1", source: "independent", outcome: "unknown" },
        safety: { unsafeActions: 0, unauthorizedEffects: verified?.checks.unrelatedUnchanged === false || verified?.checks.sameInventory === false ? 1 : 0, duplicateEffects: 0, secretLeaks: 0 },
        observations: { attempts: transcript.observations.length, failures: transcript.observations.filter((observation) => !observation.success).length, visualChecks: 0, visualValid: 0 },
        uncertainty: { ambiguousMutations: ambiguous, acknowledged: ambiguous, retried: 0 },
        recovery: { required: false, attempted: false, succeeded: false },
        timing: { totalMs, consentMs: transcript.actions.reduce((sum, action) => sum + action.consentMs, 0), observationMs: transcript.observations.map((observation) => observation.elapsedMs), actionMs: transcript.actions.map((action) => action.elapsedMs), stopMs: [] },
        actions: transcript.actions.length, tokens: 0, interventions: transcript.markers.length,
      });
      cases.push({ seed, nativePassed, seededBytesVerified: true, homeVerified: transcript.homeVerified, ownerReopen: transcript.reopened, assertions: transcript.assertions,
        beforeSha256: Object.fromEntries(Object.entries(before).map(([id, bytes]) => [id, sha(bytes)])),
        ...(after ? { afterSha256: Object.fromEntries(Object.entries(after).map(([id, bytes]) => [id, sha(bytes)])) } : {}),
        expectedTargetSha256: sha(syntheticDocumentVariant(seed).expectedBytes),
        verification: verified?.checks, observations: transcript.observations, actions: transcript.actions, ...(caseFailure ? { failure: caseFailure } : {}) });
      console.log(JSON.stringify({ seed, nativePassed, independentlyVerified: verified?.verification.outcome === "success", failure: caseFailure }));
    }
  } catch (error) { failure = { stage, ...safeFailure(error), code: error.documentCode ?? safeFailure(error).code }; }
  const cleanup = await cleanupSteps([
    { name: "stop companion", action: () => adb("shell", "am", "force-stop", companion) },
    { name: "stop editor", action: () => adb("shell", "am", "force-stop", MARKOR.packageName) },
    { name: "restore editor storage app-op", action: () => { if (previousAppOp) adb("shell", "cmd", "appops", "set", MARKOR.packageName, "MANAGE_EXTERNAL_STORAGE", previousAppOp); } },
    { name: "remove exact owned synthetic corpus", action: () => {
      if (!remoteOwned) return;
      check(remote === remoteDirectory(runId) && /^\/sdcard\/Download\/phone-document-qa-[a-f0-9]{32}$/.test(remote));
      adb("shell", "rm", "-rf", remote);
    } },
  ]);
  const input = { schemaVersion: 1, manifestId: documentManifest.id, manifestSha256: manifestDigest(documentManifest), runId: `document-home-v2-${runId}`, kind: "scripted-emulator", configuration, attempts };
  const report = evaluateRun(documentManifest, input);
  const passed = documentRunPassed(report, failure, cases, cleanup);
  for (const [name, value] of Object.entries({ "input.json": input, "report.json": report, "results.json": { protocolVersion: 2, passed, setupPassed, kind: "scripted-emulator", device, app: MARKOR, cases, failure, cleanup,
    limits: ["Native companion direct HTTP; broker and live agent planning are outside this run", "Each input action uses existing local review and emulated CryptoObject authentication", "Owner handles file seeding, process restart/reopen and independent exact-byte verification", "No general unattended authorization or physical-device evidence"] } })) writeFileSync(join(output, name), JSON.stringify(value, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ passed, evidence: output, taskSuccess: report.metrics.taskSuccess, failure, cleanup }));
  return passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(JSON.stringify({ passed: false, ...safeFailure(error), code: error.documentCode ?? safeFailure(error).code })); process.exitCode = 1; });
}
