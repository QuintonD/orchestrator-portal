import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, FileText, RefreshCw, Sparkles } from "lucide-react";
import type { AssistantProfile, AssistantTemplate, DecisionPacket, Report, ReportEvidence, ReportPresentation } from "@orchestrator/contracts";
import { Dialog } from "./alpha-pages.js";
import { AssistantSigil } from "./presence.js";
import { api, relativeTime } from "./lib.js";
import { AssistantReasoning, ReasoningField } from "./assistant-reasoning.js";
import type { ReasoningEffort } from "@orchestrator/contracts";
import { modelClasses } from "@orchestrator/contracts";
import { ModelGuide, ModelRecommendation } from "./model-guide.js";

type Notify = (message: string, tone?: "neutral" | "success" | "error") => void;
type Group = { id: string; name: string; kind: string; status: string; providerPolicy?: "local" | "subscription"; templates: Array<AssistantTemplate & { installedId: string | null }> };
const errorText = (e: unknown) => e instanceof Error ? e.message : "Could not complete the request";
export function ProfileSummary({ profile, sourceName }: { profile: AssistantProfile; sourceName: string }) {
  const local = profile.mode === "workspace" || profile.mode === "index";
  return <><p className="readable">{profile.purpose}</p><dl className="detail-list"><div><dt>Connection</dt><dd>{sourceName}</dd></div><div><dt>How it works</dt><dd>{local ? "Local guide. Reads portal records without a model call." : profile.mode === "handoff" ? "Prepares a task to take into the source. Direct dispatch is unavailable." : "A dedicated conversation in the configured runtime."}</dd></div><div><dt>Next update</dt><dd>{profile.autoReview ? "When local records change while the gateway runs" : profile.cadence === "manual" ? "On request" : `${profile.cadence} expected; source schedule must be activated separately`}</dd></div><div><dt>Last result</dt><dd>{profile.lastRunAt ? relativeTime(profile.lastRunAt) : "Not requested yet"}</dd></div><div><dt>Useful result</dt><dd>{profile.criteria}</dd></div>{!local && profile.mode !== "handoff" && <div><dt>Boundaries</dt><dd>{profile.providerPolicy} provider. Tools, source access and isolation are configured in the runtime.</dd></div>}</dl><p className="form-note"><strong>Model recommendation</strong> · <ModelRecommendation modelClass={profile.modelClass} /></p>{!local && <p className="form-note">The source keeps its configured model. This recommendation does not change it.</p>}{profile.requiredInputs && <p className="form-note"><strong>Bring</strong> · {profile.requiredInputs.join("; ")}</p>}{!local && <ModelGuide />}<AssistantReasoning assistantId={profile.id} disabled={profile.state === "running"} /></>;
}
export function ProfileEditor({ profile, close, saved, notify }: { profile: AssistantProfile; close(): void; saved(): void; notify: Notify }) {
  const [name, setName] = useState(profile.name);
  const [purpose, setPurpose] = useState(profile.purpose);
  const [criteria, setCriteria] = useState(profile.criteria);
  const [autoReview, setAutoReview] = useState(!!profile.autoReview);
  const [busy, setBusy] = useState(false);
  const local = profile.mode === "workspace" || profile.mode === "index";
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await api(`/api/assistants/${profile.id}/profile`, { method: "PUT", body: JSON.stringify({ name, purpose, criteria, ...(local ? { autoReview } : {}) }) }); notify("Assistant preferences saved", "success"); saved(); } catch (e) { notify(errorText(e), "error"); } finally { setBusy(false); } }
  async function archive() { setBusy(true); try { await api(`/api/assistants/${profile.id}`, { method: "DELETE" }); notify("Profile archived. Reports are retained; source work and schedules remain in their runtime."); saved(); } catch (e) { notify(errorText(e), "error"); } finally { setBusy(false); } }
  return <Dialog title={`Edit ${profile.name}`} close={() => { if (!busy) close(); }}><form className="alpha-form" onSubmit={submit}><label>Name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Purpose<textarea required minLength={10} maxLength={2000} value={purpose} readOnly={local} onChange={(e) => setPurpose(e.target.value)} rows={3} /></label><label>Review criteria<textarea required minLength={5} maxLength={2000} readOnly={local} value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} /></label>{local && <label className="check-label"><input type="checkbox" checked={autoReview} onChange={(e) => setAutoReview(e.target.checked)} /><span>Refresh this local guide when portal records change.</span></label>}<p className="form-note">Connection: {profile.connectorId}. Archiving retains reports and revokes portal knowledge grants. Source work and schedules continue independently.</p><div className="dialog-actions"><button type="button" className="button button--ghost" disabled={busy} onClick={archive}>Archive profile</button><button className="button button--primary" disabled={busy}>Save changes</button></div></form></Dialog>;
}
export function TeamCatalog({ close, saved, notify, initialSource, firstAssistant = false }: { close(): void; saved(): void; notify: Notify; initialSource?: string; firstAssistant?: boolean }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [source, setSource] = useState(initialSource ?? new URLSearchParams(location.search).get("source") ?? "workspace");
  const [ids, setIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [provider, setProvider] = useState("subscription");
  const [busy, setBusy] = useState(false);
  const [firstBrief, setFirstBrief] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("default");
  const [failure, setFailure] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  async function load() { try { setGroups(await api("/api/team/catalog")); setFailure(""); } catch (e) { setFailure(errorText(e)); } }
  useEffect(() => { void load(); }, []);
  const group = groups.find((g) => g.id === source);
  useEffect(() => { setIds(group?.templates.filter((t) => !t.installedId).slice(0, 1).map((t) => t.id) ?? []); setConfirmed(group?.kind === "demo"); setFirstBrief(false); setReasoningEffort("default"); setQuery(""); setCategory("All"); }, [group]);
  const runtime = group?.templates.some((t) => ids.includes(t.id) && t.mode === "runtime");
  const visible = group?.templates.filter((t) => (category === "All" || category === t.category) && `${t.name} ${t.role} ${t.summary}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  async function install() {
    if (!group) return; setBusy(true);
    try {
      const result = await api<{ created: number; results: Array<{ error?: string }> }>("/api/team/install", { method: "POST", body: JSON.stringify({ connectorId: group.id, templateIds: ids, runtimePolicyConfirmed: confirmed, providerPolicy: group.providerPolicy ?? provider, startFirstBrief: firstBrief, ...(runtime ? { reasoningEffort } : {}) }) });
      const failures = result.results.filter((r) => r.error);
      notify(failures.length ? `Team saved; ${failures.length} first results need a source check. Open the profiles to inspect them.` : `${result.created} team members added. ${!runtime || firstBrief ? "Results are recorded. Open Reports to inspect their outcome." : "Their roles are ready. Share a task and its inputs to begin."}`, failures.length ? "neutral" : "success"); saved();
    } catch (e) { setFailure(errorText(e)); } finally { setBusy(false); }
  }
  if (groups.length > 0 && !group) return <Dialog title="Connection unavailable" close={close}><p>This connection is no longer available. Close this dialog and choose another source before preparing a team.</p></Dialog>;
  return <Dialog title="A team, already prepared" close={() => { if (!busy) close(); }}>
    <p className="catalog-intro">{firstAssistant ? "Start with one role that fits your first task." : "Choose a connection and the roles you need. Start small; add specialists when the work calls for them."}</p>
    {failure && <div className="notice" role="alert">{failure}<button onClick={load}>Retry</button></div>}
    <label className="catalog-source">Connection<select aria-label="Team connection" value={group?.id ?? ""} disabled={busy} onChange={(e) => setSource(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.kind}</option>)}</select></label>
    <p className="form-note">Local guides run without a model. Other roles use a source conversation where supported, or prepare a task to copy into an assistant you choose. Handoffs attach no source documents.</p>
    <ModelGuide />
    <div className="catalog-filters"><label>Find a role<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Research, writing, code…" /></label><label>Role category<select value={category} onChange={(e) => setCategory(e.target.value)}>{["All", "General", "Personal", "Technical", "Knowledge", "Local"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <p className="form-note" role="status">{visible.length} roles shown · {ids.length} selected across all categories</p>
    <button className="text-button" disabled={busy || !ids.length} onClick={() => setIds([])}>Clear selection</button>
    <div className="template-cards">{visible.map((t) => <article className={`template-card ${ids.includes(t.id) ? "is-selected" : ""}`} key={t.id}>
      <input id={`template-${t.id}`} type="checkbox" checked={!!t.installedId || ids.includes(t.id)} disabled={busy || !!t.installedId} onChange={(e) => setIds(e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id))} />
      <AssistantSigil name={t.name} icon={t.icon} />
      <div><label htmlFor={`template-${t.id}`}><strong>{t.name} <span>{t.role}</span></strong></label><p>{t.summary}</p>
        <small>{t.installedId ? "Already in your team" : t.mode === "handoff" ? "Prepared task · no dispatch" : t.mode === "workspace" || t.mode === "index" ? "Local guide · no model" : "Source turn on request"} · {modelClasses[t.modelClass].label}</small>
        <details className="template-mandate"><summary>Inputs, mandate and model</summary><p>{t.purpose}</p><p><strong>Bring</strong>{t.requiredInputs.join("; ")}</p><p><strong>Acceptance checks</strong>{t.criteria}</p><p><ModelRecommendation modelClass={t.modelClass} /></p><p><strong>Escalate when</strong>{t.escalateWhen}</p></details>
      </div>
    </article>)}</div>
    {!visible.length && <p>No roles match. Clear the search or choose another category.</p>}
    {runtime && <div className="runtime-boundaries">
      <ReasoningField kind={group?.kind ?? ""} value={reasoningEffort} disabled={busy} onChange={setReasoningEffort} />
      <p className="form-note">Every role on this connection uses its configured model and source permissions. Model recommendations do not change them. Supply the listed inputs in your first conversation.</p>
      <label className="check-label"><input type="checkbox" disabled={busy} checked={firstBrief} onChange={(e) => setFirstBrief(e.target.checked)} /><span>Prepare the first brief for each new assistant now. One source turn per selected role. Without task inputs, the assistant can only ask for context.</span></label>
      <label>Configured provider<select disabled={busy || !!group?.providerPolicy} value={group?.providerPolicy ?? provider} onChange={(e) => setProvider(e.target.value)}><option value="subscription">Existing subscription</option><option value="local">Local model</option></select></label>
      <label className="check-label"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>The runtime is already restricted to the intended data, tools and provider. These profiles use separate conversations; they do not create runtime sandboxes.</span></label>
    </div>}
    <div className="dialog-actions"><button className="button button--ghost" disabled={busy} onClick={close}>Cancel</button><button className="button button--primary" disabled={busy || !ids.length || (runtime && !confirmed)} onClick={install}>{busy ? "Preparing…" : runtime && !firstBrief ? "Add prepared team" : "Add team & prepare reports"}<ArrowRight size={15} /></button></div>
  </Dialog>;
}

function safeLink(href?: string) {
  if (!href) return null;
  try { const url = new URL(href, location.origin); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function EvidenceLinks({ evidence }: { evidence: ReportEvidence[] }) {
  const [document, setDocument] = useState<{ title: string; body: string; updatedAt: string } | null>(null);
  const [failure, setFailure] = useState("");
  async function open(id: string) { try { setDocument(await api(`/api/knowledge/documents/${encodeURIComponent(id)}`)); setFailure(""); } catch (e) { setFailure(errorText(e)); } }
  return <><div className="evidence-links">{evidence.map((item, index) => item.documentId ? <button key={index} onClick={() => open(item.documentId!)}><FileText size={14} /><span>{item.label}</span><ArrowRight size={13} /></button> : safeLink(item.href) ? <a key={index} href={safeLink(item.href)!} target="_blank" rel="noreferrer">{item.label}<ArrowRight size={13} /></a> : <span key={index}>{item.label}</span>)}</div>{failure && <p role="alert">{failure}</p>}{document && <Dialog title={document.title} close={() => setDocument(null)}><p className="eyebrow">Source document · {relativeTime(document.updatedAt)}</p><div className="report-body">{document.body}</div></Dialog>}</>;
}
export function ReportContent({ value, showSummary = true }: { value: ReportPresentation; showSummary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return <div className="structured-report">{showSummary && <p className="report-summary">{value.summary}</p>}<section className="recommendation"><span className="eyebrow">Recommended next step</span><p>{value.recommendation}</p></section>{value.changes && <section className="revision-changes"><h3>Changed in this revision</h3><ul>{value.changes.map((c) => <li key={c}>{c}</li>)}</ul></section>}<div className="report-sections">{value.sections.map((section, index) => <section key={index}><h3>{section.title}</h3><p>{section.body}</p>{section.title === "Prepared task" && <button className="button button--secondary" onClick={async () => { try { await navigator.clipboard.writeText(section.body); setCopied(true); } catch { setCopied(false); } }}><Copy size={14} />{copied ? "Copied" : "Copy task"}</button>}</section>)}</div>{value.evidence.length > 0 && <section><h3>Evidence</h3><EvidenceLinks evidence={value.evidence} /></section>}<details className="report-limits"><summary>Scope & limits</summary><p>{value.limits}</p></details></div>;
}
export function DecisionReview({ packet, done, notify }: { packet: DecisionPacket; done(): void; notify: Notify }) {
  const [choice, setChoice] = useState(packet.recommendation);
  const [busy, setBusy] = useState(false);
  async function choose() { setBusy(true); try { await api(`/api/decisions/${packet.id}/choose`, { method: "POST", body: JSON.stringify({ optionId: choice, version: packet.version }) }); notify("Direction recorded. Work, attention and outcome history are updated.", "success"); done(); } catch (e) { notify(errorText(e), "error"); } finally { setBusy(false); } }
  return <div className="decision-review"><p className="eyebrow">{packet.simulation ? "Simulated decision · nothing will be published" : "Source decision"}</p><p>{packet.rationale}</p><div className="decision-options">{packet.options.map((o, index) => <label key={o.id} className={`decision-option ${choice === o.id ? "is-selected" : ""}`}><input type="radio" name="decision-option" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} disabled={busy} /><div><span className="eyebrow">Option {index + 1}{o.id === packet.recommendation ? " · Recommended" : ""}</span><h3>{o.title}</h3><p>{o.detail}</p><small>{o.tradeoff}</small></div></label>)}</div><EvidenceLinks evidence={packet.evidence} /><div className="dialog-actions"><button className="button button--primary" disabled={busy || !packet.simulation} onClick={choose}><Check size={15} />{busy ? "Recording…" : "Use this direction"}</button></div></div>;
}
export function PreparedWork({ navigate }: { navigate(path: string): void }) {
  const [data, setData] = useState<{ prepared: number; useful: number; uncertain: number; decisions: number; guides: number; latest: Report[] } | null>(null);
  const [failure, setFailure] = useState(false);
  async function load() { try { setData(await api("/api/outcomes")); setFailure(false); } catch { setFailure(true); } }
  useEffect(() => { void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, []);
  if (failure) return <button className="button button--secondary" onClick={load}><RefreshCw size={15} />Retry prepared work</button>;
  if (!data) return null;
  return <section className="prepared-work"><div className="section-heading"><div><p className="eyebrow"><Sparkles size={13} /> Prepared for you</p><h2>{data.prepared ? `${data.prepared} results ready to review` : "Your team is keeping watch"}</h2></div><button className="button button--ghost" onClick={() => navigate("/reports")}>All reports <ArrowRight size={15} /></button></div><div className="outcome-counts"><span><strong>{data.useful}</strong> marked useful</span><span><strong>{data.uncertain}</strong> uncertain</span><span><strong>{data.decisions}</strong> decisions recorded</span><span><strong>{data.guides}</strong> local guides active</span></div><div className="prepared-results">{data.latest.map((r) => <button key={r.id} onClick={() => navigate(`/reports?report=${encodeURIComponent(r.id)}`)}><FileText size={18} /><div><small>{r.source} · {relativeTime(r.createdAt)}</small><strong>{r.title}</strong></div><ArrowRight size={16} /></button>)}</div></section>;
}
