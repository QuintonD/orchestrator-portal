import test from "node:test";
import assert from "node:assert/strict";
import { DocumentTranscript, checkInventory, remoteDirectory, installedApkPath, documentRunPassed, documentManifest, MARKOR } from "./document.mjs";
import { manifestDigest } from "./evaluation/evaluate.mjs";

function event(transcript, value) {
  transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_EVENT " + JSON.stringify(value));
  transcript.feed("INSTRUMENTATION_STATUS_CODE: 3");
}
function ready(transcript, marker) {
  transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_V2_READY " + marker);
  assert.equal(transcript.feed("INSTRUMENTATION_STATUS_CODE: 2"), marker);
}
const observation = { kind: "observation", success: true, elapsedMs: 200, code: "none" };
const action = (method, code = "none") => ({ kind: "action", method, code, stage: code === "none" ? "none" : "restore_timeout", changedFields: [], success: code === "none", elapsedMs: 2300, consentMs: 1700 });
function throughHome(homeCode = "none") {
  const transcript = new DocumentTranscript(17);
  event(transcript, observation); ready(transcript, "type"); event(transcript, action("type"));
  event(transcript, observation); ready(transcript, "home"); event(transcript, action("key", homeCode));
  return transcript;
}
function trajectory() {
  const transcript = throughHome();
  event(transcript, { kind: "home", resolvedLauncherVisible: true });
  event(transcript, observation); event(transcript, { kind: "reopen", ownerDriven: true, editorVisible: true });
  transcript.feed("INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE 17 20");
  transcript.feed("INSTRUMENTATION_CODE: -1"); transcript.finish(0); return transcript;
}

test("v2 document protocol requires exactly two reviewed actions and owner-reopen sequence", () => {
  const basic = trajectory(); assert.equal(basic.actions.length, 2); assert.equal(basic.homeVerified, true); assert.equal(basic.reopened, true); assert.equal(basic.observations.length, 3);
  assert.deepEqual(basic.markers, ["type", "home"]); assert.equal(basic.actions.every((value) => value.success && value.consentMs > 0), true);
});

test("forged success, wrong seed, repeated ready and missing framework result fail", () => {
  const transcript = new DocumentTranscript(17);
  assert.throws(() => transcript.feed("INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE 17 20"));
  assert.throws(() => transcript.feed("INSTRUMENTATION_CODE: -1"));
  assert.throws(() => event(transcript, action("type")));
  const repeated = new DocumentTranscript(17); event(repeated, observation); ready(repeated, "type");
  assert.throws(() => ready(repeated, "type"));
  assert.throws(() => trajectory().finish(1));
  assert.throws(() => trajectory().feed("INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE 29 20"));
});

test("v2 retains stale or uncertain Home failure and rejects recovery, retry and success claims", () => {
  for (const code of ["stale_observation", "unknown_action_state", "transport_error", "consent_denied"]) {
    const transcript = throughHome(code);
    assert.equal(transcript.actions.length, 2); assert.equal(transcript.actions[1].code, code);
    assert.throws(() => event(transcript, { kind: "recovery", required: true, succeeded: false }));
    assert.throws(() => ready(transcript, "home-recovery"));
    assert.throws(() => event(transcript, observation));
    assert.throws(() => event(transcript, action("key")));
    assert.throws(() => event(transcript, { kind: "reopen", ownerDriven: true, editorVisible: true }));
    assert.throws(() => transcript.feed("INSTRUMENTATION_RESULT: stream=PHONE_DOCUMENT_COMPLETE 17 20"));
    assert.throws(() => transcript.finish(0));
  }
});

test("v2 rejects an extra action even after successful Home and requires fresh observations", () => {
  const completedHome = throughHome();
  assert.throws(() => event(completedHome, action("key")));
  assert.throws(() => ready(completedHome, "home-recovery"));
  const noObservation = new DocumentTranscript(17); assert.throws(() => ready(noObservation, "type"));
  const repeatedObservation = new DocumentTranscript(17); event(repeatedObservation, observation);
  assert.throws(() => event(repeatedObservation, observation));
  const staleReuse = new DocumentTranscript(17); event(staleReuse, observation); ready(staleReuse, "type"); event(staleReuse, action("type"));
  assert.throws(() => ready(staleReuse, "home"));
  assert.throws(() => event(staleReuse, action("key")));
});

test("v1 event protocol cannot be accepted as the no-recovery v2 candidate", () => {
  const transcript = new DocumentTranscript(17);
  transcript.feed("INSTRUMENTATION_STATUS: stream=PHONE_DOCUMENT_EVENT " + JSON.stringify(observation));
  assert.throws(() => transcript.feed("INSTRUMENTATION_STATUS_CODE: 3"));
  assert.throws(() => transcript.finish(0));
});

test("v2 requires resolved launcher proof before owner reopen and rejects false or premature proof", () => {
  const transcript = throughHome();
  assert.throws(() => event(transcript, observation));
  assert.throws(() => event(transcript, { kind: "home", resolvedLauncherVisible: false }));
  assert.throws(() => event(new DocumentTranscript(17), { kind: "home", resolvedLauncherVisible: true }));
  event(transcript, { kind: "home", resolvedLauncherVisible: true });
  assert.throws(() => event(transcript, { kind: "home", resolvedLauncherVisible: true }));
  assert.throws(() => event(transcript, { kind: "reopen", ownerDriven: true, editorVisible: true }));
});

test("unknown fields, unsafe codes, oversized lines and invalid metrics cannot enter evidence", () => {
  for (const value of [
    { ...observation, secret: "SECRET_CANARY" }, { ...observation, code: "SECRET_CANARY" }, { ...observation, elapsedMs: -1 },
    { ...action("type"), consentMs: 2400 }, { ...observation, success: false },
    { ...action("type"), changedFields: ["SECRET_CANARY"] },
  ]) assert.throws(() => event(new DocumentTranscript(17), value), (error) => !String(error).includes("SECRET_CANARY"));
  assert.throws(() => new DocumentTranscript(17).feed("x".repeat(4097)), /document_line_limit/);
  const failed = new DocumentTranscript(17);
  assert.throws(() => failed.feed("INSTRUMENTATION_RESULT: stream=FAIL after 3 assertions: Error: stale_observation SECRET_CANARY"), (error) => !String(error).includes("SECRET_CANARY"));
  assert.deepEqual(failed.failureCodes, ["stale_observation"]);
});

test("corpus ownership rejects arbitrary paths, additions, deletion and duplicate inventory", () => {
  const inventory = [17, 29, 43].flatMap((seed) => [`target${seed}.txt`, `unrelated${seed}.txt`]);
  checkInventory(inventory);
  for (const value of [inventory.slice(1), [...inventory, "extra.txt"], [...inventory.slice(1), inventory[1]], ["../../private"]]) assert.throws(() => checkInventory(value));
  assert.equal(remoteDirectory("a".repeat(32)), "/sdcard/Download/phone-document-qa-" + "a".repeat(32));
  for (const value of ["..", "/sdcard", "a".repeat(33), "a; rm -rf /"]) assert.throws(() => remoteDirectory(value));
});

test("document experiment freezes three joint workflows and the pinned APK", () => {
  assert.equal(documentManifest.tasks.length, 1); assert.deepEqual(documentManifest.tasks[0].seeds, [17, 29, 43]);
  assert.equal(documentManifest.id, "markor-document-home-v2"); assert.equal(documentManifest.tasks[0].budget.actions, 2);
  assert.equal(documentManifest.tasks[0].minObservationAttempts, 3); assert.equal(documentManifest.tasks[0].requiresRecovery, false);
  assert.match(manifestDigest(documentManifest), /^[a-f0-9]{64}$/);
  assert.equal(MARKOR.apkSha256, "e88cdcced7aa3dca25e6b9c7a9bdcfad3e3988ee545be951f42bf9441b5e46bf");
});

test("installed APK path admits Android randomized directories while excluding arbitrary files", () => {
  const path = "package:/data/app/~~random_42==/net.gsantner.markor-pinned_42==/base.apk";
  assert.equal(installedApkPath(path), path.slice(8));
  for (const value of ["package:/sdcard/base.apk", path + "\npackage:/data/other.apk", path.replace("markor-", "other-"), path.replace("base.apk", "../private")]) assert.throws(() => installedApkPath(value));
});

test("artifact and cleanup failures cannot be hidden by verified document bytes", () => {
  const cases = [{}, {}, {}]; const clean = [{ passed: true }];
  assert.equal(documentRunPassed({ passed: true }, undefined, cases, clean), true);
  assert.equal(documentRunPassed({ passed: true }, undefined, [{ failure: { code: "EACCES" } }, {}, {}], clean), false);
  assert.equal(documentRunPassed({ passed: true }, undefined, cases, [{ passed: false }]), false);
  assert.equal(documentRunPassed({ passed: true }, { code: "setup_failed" }, cases, clean), false);
  assert.equal(documentRunPassed({ passed: false }, undefined, cases, clean), false);
  assert.equal(documentRunPassed({ passed: true }, undefined, cases.slice(0, 2), clean), false);
});
