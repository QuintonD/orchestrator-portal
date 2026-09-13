import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = value => createHash("sha256").update(value).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const equalBytes = (before, after) => JSON.stringify(before) === JSON.stringify(after);

// Match the versioned local-guide input contract independently of the runtime.
// A changed input schema must deliberately update this release assertion.
export function compassFingerprint(snapshot, reports, templateVersion, day) {
  const documents = [...snapshot.knowledge_documents].sort(byId).slice(0, 1000).map(row => pick(row, ["id", "title", "body", "updated_at", "uri"]));
  const connections = [...snapshot.connectors].sort(byId).map(row => pick(row, ["id", "name", "status"]));
  const attention = snapshot.attention_items.filter(row => row.resolved_at === null).sort((a, b) =>
    Number(a.due_at === null) - Number(b.due_at === null) || (a.due_at ?? "").localeCompare(b.due_at ?? "") || b.created_at.localeCompare(a.created_at))
    .map(row => pick(row, ["id", "title", "detail", "due_at"]));
  const projects = [...snapshot.projects].sort(byId).map(row => pick(row, ["id", "name", "status", "progress"]));
  const uncertain = reports.filter(({ payload }) => payload.state === "unknown" && !payload.supersededBy)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(({ payload }) => pick(payload, ["id", "title"]));
  return sha(JSON.stringify({ presentationVersion: 2, templateVersion, documents, connections, attention, projects, uncertain }) + day);
}

export function verifyUpgradeRecords(before, after, { open, oldTemplate, currentTemplate, modelGuidanceVersion, legacyMandateSha256, startedAt, finishedAt }) {
  const start = Date.parse(startedAt), finish = Date.parse(finishedAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(finish) && finish >= start, "Bound the actual candidate run");
  const timestamp = (value, minimum = start) => {
    const parsed = Date.parse(value);
    assert.ok(typeof value === "string" && Number.isFinite(parsed) && parsed >= minimum && parsed <= finish, "Guide timestamp must belong to the candidate run");
    return parsed;
  };
  for (const [table, rows] of Object.entries(before)) {
    assert.ok(Array.isArray(after[table]), `Missing table ${table}`);
    if (table !== "alpha_records") for (const row of rows)
      assert.ok(after[table].some(candidate => equalBytes(row, candidate)), `${table}: original record preserved byte-for-byte`);
  }
  const decode = rows => new Map(rows.map(row => [row.id, { ...row, payload: open(row.payload) }]));
  const prior = decode(before.alpha_records), next = decode(after.alpha_records);
  assert.equal(prior.size, before.alpha_records.length, "Unique original record IDs");
  assert.equal(next.size, after.alpha_records.length, "Unique upgraded record IDs");
  const guides = [...prior.values()].filter(row => row.kind === "assistant" && row.payload.templateId === "workspace-brief" && row.payload.connectorId === "workspace");
  assert.equal(guides.length, 1, "Exactly one retained built-in Compass identity");
  const guideRow = guides[0], guide = guideRow.payload, upgraded = next.get(guideRow.id);
  assert.ok(upgraded && upgraded.kind === "assistant" && guide.id === guideRow.id, "Compass identity and record kind preserved");
  assert.equal(guide.mode, "workspace"); assert.equal(guide.autoReview, true); assert.equal(guide.state, "ready");
  for (const template of [oldTemplate, currentTemplate]) {
    assert.equal(template.id, "workspace-brief"); assert.equal(template.mode, "workspace");
  }
  assert.equal(guide.templateVersion, oldTemplate.version);
  assert.equal(guide.purpose, oldTemplate.purpose); assert.equal(guide.criteria, oldTemplate.criteria);
  const migrated = currentTemplate.version !== oldTemplate.version;
  let expectedGuide = { ...guide };
  if (migrated) {
    assert.equal(oldTemplate.version, 1); assert.equal(currentTemplate.version, 2, "Only the reviewed shipped v1-to-v2 mandate migration is allowed");
    assert.equal(sha(JSON.stringify([guide.purpose, guide.criteria])), legacyMandateSha256, "Only the exact shipped mandate may migrate");
    expectedGuide = { ...guide, purpose: currentTemplate.purpose, criteria: currentTemplate.criteria, templateVersion: currentTemplate.version,
      modelClass: currentTemplate.modelClass, modelGuidanceVersion, requiredInputs: currentTemplate.requiredInputs, escalateWhen: currentTemplate.escalateWhen };
  }
  const stateId = `guide-state-${guide.id}`, oldStateRow = prior.get(stateId), newStateRow = next.get(stateId);
  assert.ok(oldStateRow?.kind === "internal" && newStateRow?.kind === "internal", "Retain the guide-state identity");
  for (const row of [oldStateRow, newStateRow]) {
    assert.deepEqual(Object.keys(row.payload).sort(), ["fingerprint", "reportId"]);
    assert.match(row.payload.fingerprint, digest); assert.equal(typeof row.payload.reportId, "string");
  }
  const refreshed = oldStateRow.payload.reportId !== newStateRow.payload.reportId;
  if (migrated) assert.ok(refreshed, "Migrated Compass must refresh its local report");
  if (refreshed) {
    timestamp(upgraded.payload.lastRunAt, Math.max(start, Date.parse(guide.lastRunAt ?? startedAt)));
    expectedGuide.lastRunAt = upgraded.payload.lastRunAt;
  }
  assert.deepEqual(upgraded.payload, expectedGuide, "Preserve all Compass identity, settings and history fields outside the exact mandate migration and refresh time");
  const changed = new Set();
  const allowed = (old, current) => {
    assert.deepEqual(pick(current, ["id", "kind"]), pick(old, ["id", "kind"]));
    timestamp(current.updated_at, Math.max(start, Date.parse(old.updated_at)));
    changed.add(old.id);
  };
  if (migrated || refreshed) allowed(guideRow, upgraded);
  const added = [];
  if (refreshed) {
    allowed(oldStateRow, newStateRow);
    let reportId = oldStateRow.payload.reportId;
    const original = prior.get(reportId), retained = next.get(reportId);
    assert.ok(original?.kind === "report" && retained?.kind === "report", "Retain the previous guide report");
    assert.equal(original.payload.assistantId, guide.id); assert.equal(original.payload.supersededBy, undefined);
    assert.deepEqual(retained.payload, { ...original.payload, supersededBy: retained.payload.supersededBy }, "A refresh may only add the old report's supersession link");
    allowed(original, retained);
    reportId = retained.payload.supersededBy;
    let previousReportRow = retained;
    // At most one normal refresh and one midnight rollover during bounded QA.
    while (reportId !== undefined) {
      assert.ok(added.length < 2 && !added.includes(reportId) && !prior.has(reportId), "Only new, bounded, acyclic guide reports may supersede the prior report");
      const row = next.get(reportId), report = row?.payload;
      assert.ok(row?.kind === "report" && report?.id === reportId, "Supersession must point to an actual report");
      const keys = ["id", "assistantId", "mode", "templateId", "title", "presentation", "body", "state", "criteria", "source", "createdAt", "review", "correction", ...(report.supersededBy === undefined ? [] : ["supersededBy"])];
      assert.deepEqual(Object.keys(report).sort(), keys.sort(), "Only the versioned local report schema may be added");
      assert.deepEqual(pick(report, ["assistantId", "mode", "templateId", "state", "criteria", "source", "review", "correction"]),
        { assistantId: guide.id, mode: "workspace", templateId: "workspace-brief", state: "observed", criteria: currentTemplate.criteria, source: "Local workspace guide", review: "unreviewed", correction: "" });
      timestamp(report.createdAt); timestamp(row.updated_at, Date.parse(report.createdAt));
      timestamp(previousReportRow.updated_at, Date.parse(report.createdAt));
      const p = report.presentation;
      assert.ok(p && typeof p.summary === "string" && typeof p.recommendation === "string" && typeof p.limits === "string" && Array.isArray(p.sections) && Array.isArray(p.evidence));
      assert.equal(report.title, p.summary);
      assert.equal(report.body, [p.summary, `Recommendation\n${p.recommendation}`, ...p.sections.map(section => `${section.title}\n${section.body}`), `Limits\n${p.limits}`].join("\n\n"), "New report text and presentation must agree");
      added.push(reportId);
      if (report.supersededBy === undefined) {
        assert.equal(newStateRow.payload.reportId, reportId, "Guide state points to the newest report");
        assert.equal(newStateRow.payload.fingerprint, compassFingerprint(after, [...next.values()].filter(item => item.kind === "report"), currentTemplate.version, report.createdAt.slice(0, 10)), "Guide fingerprint binds the retained inputs and current template");
        timestamp(upgraded.payload.lastRunAt, Date.parse(report.createdAt));
        timestamp(newStateRow.updated_at, Date.parse(report.createdAt));
        timestamp(upgraded.updated_at, Date.parse(upgraded.payload.lastRunAt));
      }
      previousReportRow = row;
      reportId = report.supersededBy;
    }
    assert.ok(added.length > 0, "Supersession must retain a new report");
  }
  for (const row of before.alpha_records) if (!changed.has(row.id))
    assert.ok(after.alpha_records.some(candidate => equalBytes(row, candidate)), "Custom and unrelated records must remain byte-for-byte unchanged");
  assert.deepEqual([...next.keys()].filter(id => !prior.has(id)).sort(), [...added].sort(), "No unrelated records may appear during the upgrade fixture");
  return { preservedRecords: before.alpha_records.length, migratedCompass: migrated, refreshedReports: added.length };
}
