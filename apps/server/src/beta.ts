import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assistantTemplates, type AssistantProfile, type AssistantTemplate, type ConnectorKind, type DecisionPacket, type Message, type Report, type ReportPresentation } from "@orchestrator/contracts";
import { audit } from "./db.js";
import { launchDecision, presentationText } from "./demo-scenario.js";
import type { Vault } from "./crypto.js";

interface Store {
  read<T>(id: string): T | undefined;
  list<T>(kind: string): T[];
  save(id: string, kind: string, value: unknown): void;
}
type Turn = (profile: AssistantProfile, body: string, history?: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ body: string; state: "claimed" | "unknown"; presentation?: ReportPresentation }>;
const now = () => new Date().toISOString();
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };
type Connection = { id: string; name: string; kind: ConnectorKind; status: string; capabilities_json: string; config_encrypted: string; last_sync_at: string | null };
type Document = { id: string; title: string; body: string; updated_at: string; uri: string };

export function registerBeta(app: FastifyInstance, db: DatabaseSync, vault: Vault, authenticated: preHandlerHookHandler, demo: boolean, store: Store, turn: Turn, check: (profile: AssistantProfile) => unknown) {
  const { read, list, save } = store;
  const opts = { preHandler: authenticated };
  const profileFor = (id: string) => list<AssistantProfile>("assistant").find((p) => p.id === id) ?? fail("Assistant not found", 404);
  const connectionFor = (id: string) => db.prepare("SELECT * FROM connectors WHERE id=?").get(id) as Connection | undefined;
  const applicable = (source: Connection | undefined, template: AssistantTemplate) => template.kinds.includes(source?.kind ?? "workspace") && (template.mode !== "runtime" || JSON.parse(source?.capabilities_json ?? "[]").includes("message.send"));

  function makeProfile(template: AssistantTemplate, connectorId: string, confirmed = false, provider: "local" | "subscription" = "local"): AssistantProfile {
    const existing = list<AssistantProfile>("assistant").find((p) => p.connectorId === connectorId && p.templateId === template.id);
    if (existing) return existing;
    const profile: AssistantProfile = { id: crypto.randomUUID(), templateId: template.id, templateVersion: template.version, mode: template.mode, icon: template.icon,
      name: template.name, purpose: template.purpose, criteria: template.criteria, connectorId, scope: connectorId === "workspace" ? [] : [connectorId],
      autoReview: template.trigger === "source-change", cadence: "manual", providerPolicy: provider, spendingLimit: 0,
      runtimePolicyConfirmed: template.mode !== "runtime" || confirmed, state: "ready", lastRunAt: null, nextExpectedAt: null, createdAt: now() };
    save(profile.id, "assistant", profile);
    return profile;
  }

  // Upgrade sample identities without replacing user-created profiles or reviews.
  if (demo && !read("beta-demo-seeded-v1")) {
    for (const [id, templateId] of [["atlas", "coordinator"], ["sage", "reviewer"], ["relay", "follow-up"]]) {
      const profile = list<AssistantProfile>("assistant").find((p) => p.id === id);
      const template = assistantTemplates.find((t) => t.id === templateId)!;
      if (profile) save(profile.id, "assistant", { ...profile, templateId, templateVersion: 1, mode: "runtime", icon: template.icon });
    }
    for (const [id, title, body] of [
      ["demo-launch-brief", "Launch audience brief", "Synthetic fixture v1. Audience: technical operators using at least two assistant runtimes. Priority: reduce supervision and interruptions while keeping outcomes inspectable. Lead with the personal outcome and explain the connection model with one concrete example. No audience test results are available."],
      ["demo-copy-review", "Copy review", "Synthetic fixture v1. Outcome option: Your work moves. Your attention stays yours. Support: An assistant team that prepares the work and brings you only the decisions that matter. Technical option: One workspace for your autonomous agents. Support: Connect your runtimes, coordinate their work, and inspect every outcome. Reviewer: the first fits the brief; the second is explicit but generic. Both require comprehension testing. Nothing has been published."],
    ]) db.prepare("INSERT OR IGNORE INTO knowledge_documents VALUES (?,?,?,?,?,?)").run(id!, "demo", title!, body!, `memory://demo/${id}`, now());
    save(launchDecision.id, "decision", launchDecision);
    save("beta-demo-seeded-v1", "internal", true);
  }

  function localInputs(profile: AssistantProfile) {
    if (profile.mode !== "workspace" && !connectionFor(profile.connectorId)) fail("The assistant's connection has been removed.");
    const documents = db.prepare(`SELECT id,title,body,updated_at,uri FROM knowledge_documents ${profile.mode === "workspace" ? "" : "WHERE connector_id=?"} ORDER BY id LIMIT 1000`).all(...(profile.mode === "workspace" ? [] : [profile.connectorId])) as unknown as Document[];
    const connections = profile.mode === "workspace" ? db.prepare("SELECT id,name,status,last_sync_at FROM connectors ORDER BY id").all() : [connectionFor(profile.connectorId)!];
    const attention = profile.mode === "workspace" ? db.prepare("SELECT id,title,detail,due_at FROM attention_items WHERE resolved_at IS NULL ORDER BY created_at DESC").all() : [];
    const projects = profile.mode === "workspace" ? db.prepare("SELECT id,name,status,progress,updated_at FROM projects ORDER BY id").all() : [];
    const uncertain = profile.mode === "workspace" ? list<Report>("report").filter((r) => r.state === "unknown").map((r) => ({ id: r.id, title: r.title })) : [];
    return { documents, connections, attention, projects, uncertain };
  }
  function localPresentation(profile: AssistantProfile, input: ReturnType<typeof localInputs>): ReportPresentation {
    const { documents, connections, attention, projects, uncertain } = input;
    const stale = documents.filter((d) => Date.now() - Date.parse(d.updated_at) > 30 * 86400000);
    const titles = new Map<string, number>();
    for (const doc of documents) titles.set(doc.title.toLowerCase().trim(), (titles.get(doc.title.toLowerCase().trim()) ?? 0) + 1);
    const duplicates = [...titles.entries()].filter(([, count]) => count > 1);
    const evidence = documents.slice(0, 8).map((d) => ({ label: d.title, documentId: d.id, updatedAt: d.updated_at }));
    if (profile.mode === "workspace") {
      const offline = connections.filter((c) => c.status !== "connected");
      const evidenceOnly = profile.templateId === "workspace-evidence";
      const followUp = profile.templateId === "workspace-follow-up";
      return {
        summary: evidenceOnly ? `${uncertain.length} uncertain results; ${stale.length} documents older than 30 days.` : followUp ? `${attention.length} open items need a decision or follow-up.` : !connections.length ? "Your workspace is ready for its first source." : `${projects.length} projects, ${attention.length} open items, ${connections.length} connection${connections.length === 1 ? "" : "s"}.`,
        recommendation: offline.length ? `Check ${offline.map((c) => c.name).join(", ")} before relying on its reports.` : evidenceOnly ? uncertain.length ? "Inspect the uncertain runtime reports before retrying their requests." : stale.length ? "Review the older source documents before relying on their contents." : "No uncertain report receipts or older indexed documents are recorded. This does not independently verify their contents." : attention.length ? `Start with “${attention[0]!.title}”.` : connections.length ? "No open attention items are recorded. Review source freshness before assuming all work is complete." : "Connect a runtime or knowledge source. A matching team will be prepared for you.",
        sections: evidenceOnly ? [{ title: "Freshness gaps", body: stale.length ? stale.map((d) => d.title).slice(0, 10).join("\n") : "No indexed document is over the 30-day review threshold. A recent timestamp does not verify its contents." }, { title: "Coverage", body: `${connections.length} connections contribute to this workspace. Only data already synced into the portal is included.` }] : [{ title: followUp ? "Open decisions" : "Needs attention", body: attention.slice(0, 5).map((a) => `${a.title}${a.due_at ? ` · due ${a.due_at}` : " · no deadline recorded"}`).join("\n") || "Nothing is in the local attention queue." }, { title: "Work observed", body: projects.map((p) => `${p.name} · ${p.status} · ${p.progress}% source-reported progress`).join("\n") || "No project records have been synced." }], evidence,
        limits: "Local guide: deterministic summary of portal records, refreshed when those records change while the gateway runs. It does not inspect live runtimes or establish that source outcomes are verified.",
      };
    }
    const hygiene = profile.templateId === "curator";
    return { summary: hygiene ? `${stale.length} older documents and ${duplicates.length} repeated titles to review.` : `${documents.length} documents indexed from this connection.`,
      recommendation: !documents.length ? "Sync this connection to prepare a source inventory." : hygiene && (stale.length || duplicates.length) ? "Review the listed documents in their source. Nothing has been deleted or rewritten." : "Open a cited document to inspect its source material.",
      sections: [{ title: hygiene ? "Review candidates" : "Available context", body: hygiene ? [...stale.slice(0, 8).map((d) => `${d.title} · older than 30 days`), ...duplicates.slice(0, 8).map(([title, count]) => `${title} · ${count} documents share this title`)].join("\n") || "No age or duplicate-title flags in the indexed set." : documents.slice(0, 8).map((d) => `${d.title}\n${d.body.replace(/\s+/g, " ").slice(0, 180)}`).join("\n\n") || "No indexed documents yet." }], evidence,
      limits: "Read-only local inventory, up to 1,000 indexed documents. Age and repeated titles are review signals, not proof of incorrect or duplicate content. Source text is displayed as evidence and never executed.",
    };
  }
  function saveLocalReport(profile: AssistantProfile, force = false): Report | undefined {
    if (read<{ paused: boolean }>("dispatch")?.paused || profile.state !== "ready") { if (force) fail("This guide is paused."); return; }
    const input = localInputs(profile);
    // Health check timestamps alone should not produce another identical digest.
    const meaningful = { ...input, connections: input.connections.map((c) => ({ id: c.id, name: c.name, status: c.status })), projects: input.projects.map((p) => ({ id: p.id, name: p.name, status: p.status, progress: p.progress })) };
    const fingerprint = createHash("sha256").update(JSON.stringify(meaningful)).update(new Date().toISOString().slice(0, 10)).digest("hex");
    const previous = read<{ fingerprint: string; reportId: string }>(`guide-state-${profile.id}`);
    if (!force && previous?.fingerprint === fingerprint) return;
    const presentation = localPresentation(profile, input);
    const report: Report = { id: crypto.randomUUID(), assistantId: profile.id, mode: profile.mode ?? "index", ...(profile.templateId ? { templateId: profile.templateId } : {}), title: presentation.summary, presentation, body: presentationText(presentation), state: "observed", criteria: profile.criteria, source: profile.mode === "workspace" ? "Local workspace guide" : profile.connectorId, createdAt: now(), review: "unreviewed", correction: "" };
    save(report.id, "report", report);
    const previousReport = previous ? read<Report>(previous.reportId) : undefined;
    if (previousReport) save(previousReport.id, "report", { ...previousReport, supersededBy: report.id });
    save(`guide-state-${profile.id}`, "internal", { fingerprint, reportId: report.id });
    save(profile.id, "assistant", { ...profile, lastRunAt: now() });
    return report;
  }
  function handoff(profile: AssistantProfile): Report {
    if (profile.state !== "ready" || read<{ paused: boolean }>("dispatch")?.paused) fail("This assistant is paused.");
    const source = connectionFor(profile.connectorId) ?? fail("The connection has been removed.");
    const config = vault.open<{ endpoint?: string }>(source.config_encrypted);
    const presentation: ReportPresentation = { summary: `${profile.name}: a source task is prepared.`, recommendation: "Copy the task below into the connected source, review its plan there, then import or sync its result.", sections: [{ title: "Prepared task", body: `${profile.purpose}\n\nAcceptance criteria: ${profile.criteria}\n\nUse only already-authorized sources. State missing inputs before starting. Report changed files or source references, validation performed, unresolved risks, and the next decision. Do not claim execution or verification without evidence.` }], evidence: config.endpoint ? [{ label: `Open ${source.name}`, href: config.endpoint }] : [], limits: "Prepared handoff only. This connection exposes no portal messaging capability; no task has been dispatched." };
    const report: Report = { id: crypto.randomUUID(), assistantId: profile.id, mode: "handoff", title: presentation.summary, presentation, body: presentationText(presentation), state: "accepted", criteria: profile.criteria, source: source.name, createdAt: now(), review: "unreviewed", correction: "" };
    save(report.id, "report", report); save(profile.id, "assistant", { ...profile, lastRunAt: now() }); return report;
  }
  const runLocal = (profile: AssistantProfile) => profile.mode === "handoff" ? handoff(profile) : saveLocalReport(profile, true)!;

  // One useful local default requires no model, source access expansion, or setup.
  if (!read("workspace-guide-installed-v1")) {
    makeProfile(assistantTemplates.find((t) => t.id === "workspace-brief")!, "workspace");
    save("workspace-guide-installed-v1", "internal", true);
  }
  function refreshGuides() {
    for (const profile of list<AssistantProfile>("assistant")) if (profile.autoReview && ["index", "workspace"].includes(profile.mode ?? "")) {
      try { saveLocalReport(profile); } catch { /* Removed or unavailable sources retain the last report; no network retries. */ }
    }
  }
  refreshGuides();
  const timer = setInterval(refreshGuides, 30_000); timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));

  app.get("/api/team/catalog", opts, async () => {
    const connections = db.prepare("SELECT * FROM connectors ORDER BY name").all() as unknown as Connection[];
    return [{ id: "workspace", name: "This workspace", kind: "workspace", status: "connected" }, ...connections].map((source) => ({ id: source.id, name: source.name, kind: source.kind, status: source.status,
      ...(source.kind === "openai-compatible" ? { providerPolicy: vault.open<{ accessMode: "local" | "subscription" }>((source as Connection).config_encrypted).accessMode } : {}),
      templates: assistantTemplates.filter((t) => applicable(source.id === "workspace" ? undefined : source as Connection, t)).map((t) => ({ ...t, installedId: list<AssistantProfile>("assistant").find((p) => p.connectorId === source.id && p.templateId === t.id)?.id ?? null })) }));
  });
  app.post("/api/team/install", opts, async (request, reply) => {
    const body = z.object({ connectorId: z.string().min(1), templateIds: z.array(z.string()).min(1).max(15), runtimePolicyConfirmed: z.boolean().default(false), providerPolicy: z.enum(["local", "subscription"]).default("local"), startFirstBrief: z.boolean().default(false) }).strict().parse(request.body);
    const source = body.connectorId === "workspace" ? undefined : connectionFor(body.connectorId) ?? fail("Connection not found", 404);
    const selected = [...new Set(body.templateIds)].map((id) => assistantTemplates.find((t) => t.id === id) ?? fail("Unknown template", 400));
    if (selected.some((t) => !applicable(source, t))) fail("This template is not supported by the connection.", 400);
    if (selected.some((t) => t.mode === "runtime") && !body.runtimePolicyConfirmed) fail("Confirm the configured runtime boundaries before installing its team.", 400);
    if (source?.kind === "openai-compatible" && body.providerPolicy !== vault.open<{ accessMode: string }>(source.config_encrypted).accessMode) fail("The assistant provider must match the connection's access mode.", 400);
    const existing = list<AssistantProfile>("assistant");
    const newCount = selected.filter((t) => !existing.some((p) => p.connectorId === body.connectorId && p.templateId === t.id)).length;
    if (existing.length + newCount > 60) fail("This workspace supports up to 60 assistant profiles.");
    const installed = selected.map((t) => makeProfile(t, body.connectorId, body.runtimePolicyConfirmed, body.providerPolicy));
    const results: Array<{ assistantId: string; reportId?: string; error?: string }> = [];
    for (const profile of installed) if (!existing.some((p) => p.id === profile.id)) {
      try {
        if (profile.mode !== "runtime") results.push({ assistantId: profile.id, reportId: runLocal(profile).id });
        else if (body.startFirstBrief) {
          const result = await turn(profile, `Portal briefing request v1. Prepare your first useful result. ${profile.purpose}\nCriteria: ${profile.criteria}`);
          const report: Report = { id: crypto.randomUUID(), assistantId: profile.id, title: result.presentation?.summary ?? `${profile.name}: first brief`, body: result.body, ...(result.presentation ? { presentation: result.presentation } : {}), state: result.state, criteria: profile.criteria, source: profile.connectorId, createdAt: now(), review: "unreviewed", correction: "" };
          save(report.id, "report", report);
          if (result.state === "unknown") save(profile.id, "assistant", { ...profileFor(profile.id), state: "unknown" });
          results.push({ assistantId: profile.id, reportId: report.id });
        }
      } catch (e) { results.push({ assistantId: profile.id, error: e instanceof Error && "statusCode" in e ? e.message : "The first brief could not be prepared. Inspect this profile before requesting it again." }); }
    }
    audit(db, request.principal!.userId, "team.install", body.connectorId, { templates: body.templateIds, created: newCount });
    return reply.code(201).send({ assistants: installed, created: newCount, results });
  });
  app.get("/api/assistants/:id/messages", opts, async (request) => {
    const profile = profileFor((request.params as { id: string }).id);
    return list<Message & { assistantId: string }>("assistant-message").filter((m) => m.assistantId === profile.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-80);
  });
  app.post("/api/assistants/:id/messages", opts, async (request, reply) => {
    const profile = profileFor((request.params as { id: string }).id);
    if (profile.mode && profile.mode !== "runtime") fail("This guide prepares reports or source handoffs; it does not provide a runtime conversation.");
    const body = z.object({ body: z.string().trim().min(1).max(20_000) }).strict().parse(request.body);
    check(profile);
    const history = list<Message & { assistantId: string }>("assistant-message").filter((m) => m.assistantId === profile.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.body }));
    const message: Message & { assistantId: string } = { id: crypto.randomUUID(), assistantId: profile.id, connectorId: profile.connectorId, role: "user", body: body.body, state: "accepted", correlationId: null, createdAt: now() };
    // Preserve the operator input before source I/O. A restart marks its receipt unknown.
    save(message.id, "assistant-message", message);
    save(`pending-message-${profile.id}`, "internal", message.id);
    const result = await turn(profile, body.body, history);
    message.state = result.state;
    const response: Message & { assistantId: string } = { ...message, id: crypto.randomUUID(), role: "assistant", body: result.body, state: result.state, createdAt: new Date(Date.now() + 1).toISOString() };
    save(message.id, "assistant-message", message); save(response.id, "assistant-message", response);
    save(`pending-message-${profile.id}`, "internal", null);
    if (result.state === "unknown") save(profile.id, "assistant", { ...profileFor(profile.id), state: "unknown" });
    audit(db, request.principal!.userId, "assistant.message", profile.id, { state: result.state });
    return reply.code(201).send({ message, reply: response });
  });
  app.get("/api/decisions", opts, async () => list<DecisionPacket>("decision"));
  app.post("/api/decisions/:id/choose", opts, async (request) => {
    if (!demo) fail("Source decisions must be committed through their native runtime.");
    const packet = list<DecisionPacket>("decision").find((d) => d.id === (request.params as { id: string }).id) ?? fail("Decision not found", 404);
    const body = z.object({ optionId: z.string(), version: z.number().int().positive() }).strict().parse(request.body);
    if (!packet.simulation) fail("This is not a simulated decision.");
    if (packet.state === "decided") {
      if (packet.selectedOption === body.optionId) return packet;
      fail("This decision has already been recorded. Refresh to inspect the chosen direction.");
    }
    if (packet.version !== body.version) fail("The options have changed. Refresh before choosing.");
    const option = packet.options.find((o) => o.id === body.optionId) ?? fail("Unknown option", 400);
    const updated: DecisionPacket = { ...packet, state: "decided", selectedOption: option.id, decidedAt: now(), version: packet.version + 1 };
    db.exec("BEGIN IMMEDIATE");
    try {
      save(packet.id, "decision", updated);
      db.prepare("UPDATE attention_items SET resolved_at=? WHERE id=?").run(now(), packet.attentionId);
      db.prepare("UPDATE projects SET status='on-track',description=?,updated_at=? WHERE id=?").run(`Direction chosen: ${option.title} Next: draft and comprehension review. Simulation; nothing published.`, now(), packet.projectId);
      const presentation: ReportPresentation = { summary: `Direction recorded: ${option.title}`, recommendation: "Review the draft and its evidence before publishing in the source.", sections: [{ title: "What changed", body: "The demo decision is recorded, the linked attention item is resolved, and Studio launch is ready for draft review. Progress has not been increased." }], evidence: packet.evidence, limits: "Observed local simulation state only. No external task, publication, or notification occurred." };
      const report: Report = { id: crypto.randomUUID(), assistantId: "atlas", title: presentation.summary, body: presentationText(presentation), presentation, state: "observed", criteria: "Record the chosen option and preserve its evidence.", source: "Demo decision", createdAt: now(), review: "unreviewed", correction: "" };
      save(report.id, "report", report);
      db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), "Demo decision", "decision.recorded", packet.title, option.title, "observed", now(), now(), packet.projectId, JSON.stringify({ decisionId: packet.id, reportId: report.id, simulation: true }));
      audit(db, request.principal!.userId, "decision.choose", packet.id, { optionId: option.id, simulation: true });
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    refreshGuides(); return updated;
  });
  app.get("/api/outcomes", opts, async () => {
    refreshGuides();
    const reports = list<Report>("report").filter((r) => !r.supersededBy);
    return { prepared: reports.filter((r) => r.review === "unreviewed").length, useful: reports.filter((r) => r.review === "useful").length, uncertain: reports.filter((r) => r.state === "unknown").length, decisions: list<DecisionPacket>("decision").filter((d) => d.state === "decided").length, latest: reports.slice(0, 3), guides: list<AssistantProfile>("assistant").filter((p) => p.autoReview && p.state === "ready" && !read<{ paused: boolean }>("dispatch")?.paused).length };
  });
  return { runLocal, packet: () => read<DecisionPacket>(launchDecision.id) ?? launchDecision };
}
