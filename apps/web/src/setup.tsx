import { useEffect, useState } from "react";
import type { AssistantProfile, Connector, Report } from "@orchestrator/contracts";
import { ArrowRight, Bot, Check, FileText, RefreshCw } from "lucide-react";
import { api } from "./lib.js";
import { PageHeader, Skeleton, StatusPill } from "./components.js";
import { AddConnection } from "./connections.js";
import { TeamCatalog } from "./beta-panels.js";
import "./setup.css";

type Flow = "assistant" | "knowledge" | "local";
type Props = { navigate(path: string): void; notify(message: string, tone?: "neutral" | "success" | "error"): void };
type Data = {
  connectors: Connector[];
  catalog: Array<{ id: string; displayName: string; capabilities: string[] }>;
  assistants: AssistantProfile[];
  dispatchPaused: boolean;
  reports: Report[];
  groups: Array<{ id: string; providerPolicy?: "local" | "subscription" }>;
};
const flows: Array<{ id: Flow; title: string; detail: string }> = [
  { id: "assistant", title: "Work with an assistant", detail: "Connect a runtime or model you already use, then give it a first task." },
  { id: "knowledge", title: "Bring my notes", detail: "Choose documents to search here. Your original files stay unchanged." },
  { id: "local", title: "Start with this workspace", detail: "Use your local brief and personal plans. Add a source whenever you are ready." },
];
const starterTask = "Help me choose one useful task to start with. Ask what outcome I want and what context is missing before doing any work.";
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Could not load setup. Please try again.";
const matches = (flow: Flow, source: { id?: string; kind?: string; capabilities: string[] }) => flow === "assistant"
  ? source.capabilities.includes("message.send") || (source.kind ?? source.id) === "t3-workspace"
  : source.capabilities.includes("knowledge.search");

export function SetupPage({ navigate, notify }: Props) {
  const query = new URLSearchParams(location.search);
  const [flow, setFlow] = useState<Flow>(() => flows.find((item) => item.id === query.get("flow"))?.id ?? "assistant");
  const [sourceId, setSourceId] = useState(query.get("source") ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [tools, setTools] = useState<Array<{ kind: string; name: string; available: boolean }> | null>(null);
  const [discoveryError, setDiscoveryError] = useState(false);

  async function load() {
    try {
      const [connections, team, reports, groups] = await Promise.all([
        api<Pick<Data, "connectors" | "catalog">>("/api/connectors"),
        api<Pick<Data, "assistants" | "dispatchPaused">>("/api/assistants"),
        api<Report[]>("/api/reports"),
        api<Data["groups"]>("/api/team/catalog"),
      ]);
      setData({ ...connections, ...team, reports, groups }); setError("");
    } catch (cause) { setError(errorText(cause)); }
  }
  async function discover() {
    setTools(null); setDiscoveryError(false);
    try { setTools((await api<{ tools: NonNullable<typeof tools> }>("/api/setup/discovery")).tools); }
    catch { setDiscoveryError(true); }
  }
  useEffect(() => { void load(); void discover(); }, []);
  // Connection and profile records are the progress record. The URL retains the
  // selected path on reload without storing credentials or duplicating that state.
  function select(nextFlow: Flow, id = "") {
    setFlow(nextFlow); setSourceId(id);
    history.replaceState(null, "", `/setup?flow=${nextFlow}${id ? `&source=${encodeURIComponent(id)}` : ""}`);
  }
  async function checkSource() {
    if (!sourceId) return;
    setBusy(true);
    try { await api(`/api/connectors/${encodeURIComponent(sourceId)}/sync`, { method: "POST" }); }
    catch (cause) { notify(errorText(cause), "error"); }
    finally { await load(); setBusy(false); }
  }

  if (error) return <><PageHeader title="Get started" detail="Your saved connections and work stay in this workspace." /><div className="notice" role="alert">{error}<button className="button button--secondary" onClick={load}>Retry setup</button></div></>;
  if (!data) return <><PageHeader title="Get started" detail="Checking what is already ready…" /><Skeleton lines={6} /></>;

  const sources = data.connectors.filter((source) => matches(flow, source));
  const source = sources.find((item) => item.id === sourceId);
  const profiles = data.assistants.filter((profile) => profile.connectorId === source?.id);
  const providerPolicy = data.groups.find((group) => group.id === source?.id)?.providerPolicy;
  const policyMatches = (item: AssistantProfile) => item.providerPolicy !== "metered" && (item.mode === "handoff" || item.runtimePolicyConfirmed) && (!providerPolicy || item.providerPolicy === providerPolicy);
  const profile = profiles.find((item) => item.state === "ready" && policyMatches(item)) ?? profiles[0];
  const connected = source?.status === "connected";
  const partialKnowledge = flow === "knowledge" && source?.status === "degraded" && ["markdown-directory", "obsidian-vault", "notion"].includes(source.kind) && (source.indexedDocuments ?? 0) > 0;
  const sourceUsable = connected || partialKnowledge;
  const canUse = connected && profile?.state === "ready" && policyMatches(profile) && !data.dispatchPaused;
  const localGuide = data.assistants.find((item) => item.templateId === "workspace-brief");
  const localReport = data.reports.find((item) => item.assistantId === localGuide?.id && !item.supersededBy);
  const localActive = localGuide?.state === "ready" && localGuide.autoReview && !data.dispatchPaused;
  const catalog = data.catalog.filter((item) => matches(flow, item));
  const options = flow === "assistant" ? [
    { kind: "openclaw-cli", label: "OpenClaw", detail: "Uses the installation and account configured on your gateway computer." },
    { kind: "openai-compatible", label: "Local model or subscription", detail: "Connect an existing compatible API. Its setup guide is in the next step." },
    { kind: "hermes-api", label: "Hermes", detail: "Use the address and access token from your running Hermes server." },
    { kind: "t3-workspace", label: "T3 Code", detail: "Prepare a coding task to run in T3 Code." },
  ] : [
    { kind: "markdown-directory", label: "Local documents", detail: "Choose one folder on the gateway computer." },
    { kind: "obsidian-vault", label: "Obsidian", detail: "Choose one vault; settings and attachments are excluded." },
    { kind: "notion", label: "Notion", detail: "Connect only the pages you choose to share." },
    { kind: "gbrain-cli", label: "gbrain", detail: "Search your already configured gbrain knowledge source." },
  ];

  return <div className="onboarding">
    <PageHeader title="Make this workspace yours" detail="Start with one useful flow. You can connect more later." actions={<button className="button button--ghost" onClick={() => navigate("/")}>Continue later</button>} />
    <section className="onboarding-default" aria-label="Workspace default">
      <FileText size={22} aria-hidden="true" /><div><h2>{localReport ? "Your first local brief is ready" : "Your workspace is saved"}</h2>
        <p>{localActive ? "Your local guide refreshes when portal records change while the gateway runs. It needs no model or account connection." : "Your local guide is paused or has been removed. You can manage it in Team."}</p>
        {localReport && <button className="text-button" onClick={() => navigate(`/reports?report=${encodeURIComponent(localReport.id)}`)}>Read my local brief <ArrowRight size={15} /></button>}
      </div>
    </section>
    <h2>What would you like to start with?</h2>
    <div className="onboarding-choices" aria-label="Choose your flow">{flows.map((item) => <button key={item.id} className="onboarding-choice" aria-pressed={flow === item.id} onClick={() => select(item.id)}><strong>{item.title}</strong><span>{item.detail}</span></button>)}</div>
    {flow === "local" ? <section className="onboarding-step"><h2>Start with what is already here</h2><p>Your brief summarizes saved portal records. Today lets you make personal plans. A connected assistant is needed for model conversations and delegated work.</p><div className="setup-links"><button className="button button--primary" onClick={() => navigate("/personal")}>Plan my day <ArrowRight size={16} /></button><button className="button button--secondary" onClick={() => navigate("/agents")}>Manage local guides</button></div></section> : <>
      <ol className="onboarding-progress" aria-label="Setup progress">
        <li aria-current={!sourceUsable ? "step" : undefined}>{sourceUsable ? <Check size={16} /> : "1"}<span>Connect and check</span></li>
        <li aria-current={connected && flow === "assistant" && !profile ? "step" : undefined}>{profile && connected ? <Check size={16} /> : "2"}<span>{flow === "knowledge" ? "Search your source" : "Prepare an assistant"}</span></li>
        {flow === "assistant" && <li aria-current={connected && profile ? "step" : undefined}>3<span>Try a first task</span></li>}
      </ol>
      <section className="onboarding-step" aria-label="Connect your source">
        <h2>{source ? source.name : "Connect what you already use"}</h2>
        {sources.length > 0 && <label className="onboarding-source">Saved connection<select aria-label="Saved connection" value={sourceId} onChange={(event) => select(flow, event.target.value)}><option value="">Choose a saved connection</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {sourceId && !source && <p role="status">That connection is no longer available for this flow. Choose a saved connection or add one below.</p>}
        {source && <div className="onboarding-source-status"><StatusPill state={source.status} /><p>{partialKnowledge ? "Some content is available. Review the coverage details below, then search the readable documents." : connected ? "Connection checked. Continue below when you are ready." : "Your connection is saved, but it needs a successful check before continuing."}</p>{source.error && <p className="notice" role="status">{source.error}</p>}<button className="button button--secondary" disabled={busy} onClick={checkSource}><RefreshCw size={15} />{busy ? "Checking…" : "Check connection"}</button>{!connected && <button className="text-button" onClick={() => navigate("/connections")}>Manage connection details <ArrowRight size={15} /></button>}</div>}
        {!source && <>
          <p>Choose a source below. We save and check it as soon as you add it.</p>
          <div className="onboarding-discovery" role="status">{discoveryError ? <>Local discovery is unavailable. You can still add a source. <button className="text-button" onClick={discover}>Retry discovery</button></> : !tools ? "Checking installed tool locations on your gateway…" : tools.some((tool) => tool.available) ? "Installed tools are marked below. Connecting uses the gateway computer, even from your phone." : "No supported local command tools found. You can connect an API or notes below; installation and sign-in instructions appear with each source."}</div>
          <div className="onboarding-options">{options.filter((option) => catalog.some((item) => item.id === option.kind)).map((option) => <button className="onboarding-option" key={option.kind} onClick={() => setAdding(option.kind)}><div>{flow === "assistant" ? <Bot size={19} /> : <FileText size={19} />}<strong>{option.label}</strong>{tools?.some((tool) => tool.kind === option.kind && tool.available) && <span>Found here</span>}</div><p>{option.detail}</p><ArrowRight size={16} /></button>)}</div>
        </>}
        {source && <button className="text-button" onClick={() => select(flow)}>Choose another source</button>}
      </section>
      {sourceUsable && source && <section className="onboarding-step" aria-label="Next setup step">
        {flow === "knowledge" ? <><h2>Search your connected knowledge</h2><p>Try a title or phrase you know is in this source. Open a result to check the original context. If no documents were indexed, check the selected folder or pages in Connections.</p><button className="button button--primary" onClick={() => navigate("/brain")}>Search my knowledge <ArrowRight size={16} /></button><p>Optional: add a local guide to prepare read-only inventories when indexed records change.</p><button className="text-button" onClick={() => setTeamOpen(true)}>Add a knowledge guide</button></>
          : !profile ? <><h2>Prepare your first assistant</h2><p>We suggest one role to start. Review its purpose and confirm how the source is configured. Adding the role does not send a task unless you choose a first brief.</p><button className="button button--primary" onClick={() => setTeamOpen(true)}>Prepare one assistant <ArrowRight size={16} /></button></>
          : !canUse ? <><h2>Your assistant needs a check</h2><p>{data.dispatchPaused ? "New requests are paused for this workspace." : !policyMatches(profile) ? "This profile does not match its source permissions or provider. Archive it in Team, then prepare it again with the connection's current settings." : `${profile.name} is ${profile.state}.`} Review the assistant in Team before starting a task.</p><button className="button button--primary" onClick={() => navigate("/agents")}>Review my team <ArrowRight size={16} /></button></>
          : profile.mode === "handoff" ? <><h2>Take a first task into your source</h2><p>{profile.name} prepares a task for you to review and run in {source.name}. Open the assistant in Team and request its handoff report.</p><button className="button button--primary" onClick={() => navigate("/agents")}>Prepare my handoff <ArrowRight size={16} /></button></>
          : <><h2>Give {profile.name} a first task</h2><p>Start small: choose one outcome and let your assistant ask for the context it needs. The draft opens for you to review and send.</p><blockquote>{starterTask}</blockquote><button className="button button--primary" onClick={() => navigate(`/assistant?assistant=${encodeURIComponent(profile.id)}&draft=${encodeURIComponent(starterTask)}`)}>Open my first conversation <ArrowRight size={16} /></button><p>After a reply, check its evidence. Reports and Team keep the work available for review.</p></>}
      </section>}
    </>}
    <details className="onboarding-phone"><summary>Use this workspace on my phone</summary><p>Keep the gateway running on your computer. The Android app connects to that same workspace using its private HTTPS address and your existing passphrase.</p><p>A phone's localhost address points to the phone itself. Set up private access on the gateway first.</p><a href="https://github.com/QuintonD/orchestrator-portal/blob/main/docs/android.md" target="_blank" rel="noreferrer">Open the phone connection guide <ArrowRight size={15} /></a></details>
    {adding && <AddConnection initialKind={adding} catalog={catalog} navigate={navigate} changed={load} close={() => { setAdding(null); void load(); }} onSaved={(connector) => select(flow, connector.id)} onReady={() => { void load(); }} />}
    {teamOpen && source && <TeamCatalog initialSource={source.id} firstAssistant={flow === "assistant"} close={() => setTeamOpen(false)} saved={() => { setTeamOpen(false); void load(); }} notify={notify} />}
  </div>;
}
