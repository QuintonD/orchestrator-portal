import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { compassFingerprint, verifyUpgradeRecords } from "./release-upgrade-records.mjs";

const oldTime = "2026-09-13T01:00:00.000Z", newTime = "2026-09-13T01:01:00.000Z";
const seal = JSON.stringify, open = JSON.parse;
const row = (id, kind, payload, updated_at = oldTime) => ({ id, kind, payload: seal(payload), updated_at });
function fixture() {
  const oldTemplate = { id: "workspace-brief", version: 1, mode: "workspace", purpose: "Original shipped mandate", criteria: "Original shipped criteria" };
  const currentTemplate = { ...oldTemplate, version: 2, criteria: "Current shipped criteria", modelClass: "local", requiredInputs: ["Local records"], escalateWhen: "Missing local data" };
  const guide = { id: "compass", templateId: "workspace-brief", templateVersion: 1, mode: "workspace", name: "My named Compass", purpose: oldTemplate.purpose, criteria: oldTemplate.criteria,
    connectorId: "workspace", scope: [], autoReview: true, cadence: "manual", providerPolicy: "local", spendingLimit: 0, runtimePolicyConfirmed: true, state: "ready", lastRunAt: oldTime, nextExpectedAt: null, createdAt: oldTime };
  const oldReport = { id: "old-report", assistantId: "compass", mode: "workspace", templateId: "workspace-brief", title: "Previous summary", body: "Previous body", presentation: { summary: "Previous summary" }, state: "observed", criteria: oldTemplate.criteria, source: "Local workspace guide", createdAt: oldTime, review: "useful", correction: "Keep my review" };
  const before = { users: [{ id: "owner", retained: "ciphertext" }], connectors: [{ id: "fixture", name: "Fixture", status: "disconnected" }], messages: [{ id: "message", body_encrypted: "ciphertext" }],
    knowledge_documents: [{ id: "doc", title: "Document", body: "Synthetic fixture", updated_at: oldTime, uri: "memory://fixture" }], projects: [{ id: "project", name: "Retained", status: "on-track", progress: 35 }], attention_items: [], dashboard_layouts: [{ user_id: "owner", config_json: "retained" }],
    alpha_records: [row("compass", "assistant", guide), row("guide-state-compass", "internal", { fingerprint: "a".repeat(64), reportId: "old-report" }), row("old-report", "report", oldReport),
      row("custom-assistant", "assistant", { id: "custom-assistant", name: "Custom", state: "paused" }), row("custom-report", "report", { id: "custom-report", assistantId: "custom-assistant", state: "claimed", review: "useful", body: "Keep exact bytes" }), row("custom-watch", "watch", { id: "custom-watch", enabled: false }), row("workspace-guide-installed-v1", "internal", true)] };
  const after = structuredClone(before);
  const presentation = { summary: "Current summary", recommendation: "Inspect records", sections: [{ title: "Work", body: "Observed work" }], evidence: [], limits: "Local records only" };
  const report = { id: "new-report", assistantId: "compass", mode: "workspace", templateId: "workspace-brief", title: presentation.summary, presentation,
    body: "Current summary\n\nRecommendation\nInspect records\n\nWork\nObserved work\n\nLimits\nLocal records only", state: "observed", criteria: currentTemplate.criteria, source: "Local workspace guide", createdAt: newTime, review: "unreviewed", correction: "" };
  const replace = (id, payload) => { const target = after.alpha_records.find(item => item.id === id); target.payload = seal(payload); target.updated_at = newTime; };
  replace("compass", { ...guide, templateVersion: 2, purpose: currentTemplate.purpose, criteria: currentTemplate.criteria, modelClass: "local", modelGuidanceVersion: "2026-09-10.1", requiredInputs: currentTemplate.requiredInputs, escalateWhen: currentTemplate.escalateWhen, lastRunAt: newTime });
  replace("old-report", { ...oldReport, supersededBy: "new-report" });
  after.alpha_records.push(row("new-report", "report", report, newTime));
  replace("guide-state-compass", { fingerprint: compassFingerprint(after, after.alpha_records.filter(item => item.kind === "report").map(item => ({ ...item, payload: open(item.payload) })), 2, "2026-09-13"), reportId: "new-report" });
  const options = { open, oldTemplate, currentTemplate, modelGuidanceVersion: "2026-09-10.1", legacyMandateSha256: createHash("sha256").update(JSON.stringify([oldTemplate.purpose, oldTemplate.criteria])).digest("hex"), startedAt: "2026-09-13T01:00:30.000Z", finishedAt: "2026-09-13T01:02:00.000Z" };
  return { before, after, options };
}
function change(snapshot, id, mutate) {
  const item = snapshot.alpha_records.find(value => value.id === id), payload = open(item.payload);
  mutate(payload); item.payload = seal(payload);
}

test("accepts only the exact shipped migration and linked local refresh while retaining customized name and old review", () => {
  const { before, after, options } = fixture();
  assert.deepEqual(verifyUpgradeRecords(before, after, options), { preservedRecords: 7, migratedCompass: true, refreshedReports: 1 });
});
test("same-template upgrade permits a completely unchanged guide without exempting its encrypted row", () => {
  const { before, options } = fixture(); options.currentTemplate = options.oldTemplate;
  assert.deepEqual(verifyUpgradeRecords(before, structuredClone(before), options), { preservedRecords: 7, migratedCompass: false, refreshedReports: 0 });
});
test("each original table and every custom record must survive byte for byte", () => {
  for (const table of ["users", "connectors", "messages", "knowledge_documents", "projects", "dashboard_layouts", "alpha_records"]) {
    const { before, after, options } = fixture(); after[table].pop();
    assert.throws(() => verifyUpgradeRecords(before, after, options), table);
  }
  for (const id of ["custom-assistant", "custom-report", "custom-watch", "workspace-guide-installed-v1"]) {
    const { before, after, options } = fixture(); const item = after.alpha_records.find(value => value.id === id);
    item.payload += " "; // Same plaintext is insufficient when this record has no authorized migration.
    assert.throws(() => verifyUpgradeRecords(before, after, options), /byte-for-byte/);
  }
});
test("Compass identity, authority, naming, creation time and scheduling settings cannot change", () => {
  for (const [key, value] of Object.entries({ id: "replacement", name: "Reset name", connectorId: "other", mode: "runtime", scope: ["other"], autoReview: false, state: "paused", providerPolicy: "subscription", spendingLimit: 50, runtimePolicyConfirmed: false, cadence: "hourly", nextExpectedAt: newTime, createdAt: newTime })) {
    const { before, after, options } = fixture(); change(after, "compass", payload => { payload[key] = value; });
    assert.throws(() => verifyUpgradeRecords(before, after, options), key);
  }
});
test("custom mandates and unreviewed template migrations do not qualify for an exception", () => {
  for (const mutate of [value => change(value.before, "compass", p => { p.criteria = "Owner customized mandate"; }), value => { value.options.legacyMandateSha256 = "0".repeat(64); }, value => { value.options.currentTemplate.version = 3; }, value => change(value.after, "compass", p => { p.modelClass = "deep"; })]) {
    const value = fixture(); mutate(value); assert.throws(() => verifyUpgradeRecords(value.before, value.after, value.options));
  }
});
test("refresh preserves every old report field including user review and correction", () => {
  for (const [key, value] of Object.entries({ body: "Lost old evidence", review: "unreviewed", correction: "", criteria: "Rewritten criteria", state: "verified", assistantId: "other" })) {
    const { before, after, options } = fixture(); change(after, "old-report", p => { p[key] = value; });
    assert.throws(() => verifyUpgradeRecords(before, after, options), /only add/);
  }
});
test("missing, foreign, cyclic and disconnected supersession links fail", () => {
  for (const mutate of [v => change(v.after, "old-report", p => { delete p.supersededBy; }), v => change(v.after, "old-report", p => { p.supersededBy = "custom-report"; }), v => change(v.after, "old-report", p => { p.supersededBy = "missing"; }), v => change(v.after, "new-report", p => { p.supersededBy = "new-report"; }), v => change(v.after, "guide-state-compass", p => { p.reportId = "old-report"; })]) {
    const value = fixture(); mutate(value); assert.throws(() => verifyUpgradeRecords(value.before, value.after, value.options));
  }
});
test("guide fingerprint must bind current retained inputs and template", () => {
  const { before, after, options } = fixture(); change(after, "guide-state-compass", p => { p.fingerprint = "0".repeat(64); });
  assert.throws(() => verifyUpgradeRecords(before, after, options), /fingerprint binds/);
});
test("new reports must be unreviewed local observations with coherent presentation", () => {
  for (const [key, value] of Object.entries({ assistantId: "custom-assistant", state: "verified", review: "useful", correction: "Invented review", source: "External model", criteria: "Unrelated", mode: "runtime", body: "Unrelated body", title: "Unrelated title", secret: "Unexpected field" })) {
    const data = fixture(); change(data.after, "new-report", p => { p[key] = value; });
    assert.throws(() => verifyUpgradeRecords(data.before, data.after, data.options), key);
  }
});
test("refresh timestamps must be ordered inside the actual candidate run", () => {
  for (const [id, key, value] of [["compass", "lastRunAt", oldTime], ["compass", "lastRunAt", "2099-01-01T00:00:00Z"], ["new-report", "createdAt", "invalid"], ["new-report", "createdAt", "2026-09-13T01:01:30.000Z"]]) {
    const data = fixture(); change(data.after, id, p => { p[key] = value; });
    assert.throws(() => verifyUpgradeRecords(data.before, data.after, data.options), /timestamp/);
  }
  for (const id of ["old-report", "guide-state-compass", "compass"]) {
    const data = fixture(); data.after.alpha_records.find(item => item.id === id).updated_at = "2026-09-13T01:00:45.000Z";
    assert.throws(() => verifyUpgradeRecords(data.before, data.after, data.options), /timestamp/);
  }
});
test("extra records, missing guide state and duplicate IDs cannot hide in the migration", () => {
  for (const mutate of [v => v.after.alpha_records.push(row("unexpected", "watch", {})), v => v.after.alpha_records.push(v.after.alpha_records[0]), v => { v.after.alpha_records = v.after.alpha_records.filter(item => item.id !== "guide-state-compass"); }]) {
    const data = fixture(); mutate(data); assert.throws(() => verifyUpgradeRecords(data.before, data.after, data.options));
  }
});
