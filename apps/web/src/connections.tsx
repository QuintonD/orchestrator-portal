import { useEffect, useState } from "react";
import type { Connector } from "@orchestrator/contracts";
import { ArrowRight, Bot, Check, FileText, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { api, relativeTime } from "./lib.js";
import { Card, PageHeader, Skeleton, StatusPill } from "./components.js";
import { Dialog } from "./alpha-pages.js";
import { GrokPanel } from "./grok.js";

type Notify = (message: string, tone?: "neutral" | "success" | "error") => void;
type CatalogItem = { id: string; displayName: string; capabilities: string[] };
type ConnectionData = { connectors: Connector[]; catalog: CatalogItem[] };
const failure = (error: unknown) => error instanceof Error ? error.message : "The connection could not be checked.";
const labels: Record<string, string> = {
  "openclaw-cli": "OpenClaw", "hermes-api": "Hermes", "gbrain-cli": "gbrain",
  "openai-compatible": "Subscription / local model API",
  "markdown-directory": "Local documents", "obsidian-vault": "Obsidian", "notion": "Notion",
  "t3-workspace": "T3 Code", "generic-webhook": "Custom assistant", demo: "Sample workspace",
};
const descriptions: Record<string, string> = {
  "openclaw-cli": "Use an OpenClaw assistant already installed and configured on this computer. Orchestrator uses its existing account and model settings.",
  "hermes-api": "Connect your running Hermes API server. Its address is shown in your Hermes setup; use a private HTTPS address for another computer.",
  "openai-compatible": "Use CLIProxyAPI or another compatible server with your existing subscription or a local model. Sign in at the source, then connect it here for text conversations and drafts. Native platform tools and existing chats are not imported.",
  "gbrain-cli": "Search the knowledge source configured in your installed gbrain command-line app. No notes are copied automatically.",
  "markdown-directory": "Read a folder on the computer running Orchestrator. Markdown, text and JSON documents are copied into a local search index. Your original files stay unchanged.",
  "obsidian-vault": "Read Markdown notes from one Obsidian vault on the computer running Orchestrator. Hidden settings, plugins and attachments are excluded. Your notes stay unchanged.",
  "notion": "Read only the Notion pages you select. Create an internal connection with Read content access, share those pages with it, then paste its secret below. Page text is stored in your local search index.",
  "t3-workspace": "Check your running T3 Code workspace. Coding handoffs remain editable and run in T3 Code.",
  "generic-webhook": "Connect an assistant endpoint that accepts the portal's message contract. Use this only when your assistant's setup instructions provide a compatible address.",
};

export function ConnectionsPage({ notify, navigate }: { notify: Notify; navigate(path: string): void }) {
  const [data, setData] = useState<ConnectionData | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Connector | null>(null);
  const [initialKind, setInitialKind] = useState("markdown-directory");
  const [discovery, setDiscovery] = useState<Array<{ kind: string; name: string; available: boolean }> | null>(null);
  const [discoveryError, setDiscoveryError] = useState(false);
  async function discover() {
    setDiscoveryError(false); setDiscovery(null);
    try { setDiscovery((await api<{ tools: NonNullable<typeof discovery> }>("/api/setup/discovery")).tools); }
    catch { setDiscoveryError(true); }
  }
  async function load() {
    try { setData(await api<ConnectionData>("/api/connectors")); setError(""); }
    catch (e) { setError(failure(e)); }
  }
  useEffect(() => { void load(); void discover(); }, []);
  async function sync(id: string) {
    setSyncing((current) => [...current, id]);
    try {
      const result = await api<{ connector: Connector; imported: { documents?: number } }>(`/api/connectors/${id}/sync`, { method: "POST" });
      notify(result.connector.status === "connected" ? (result.imported.documents === undefined ? "Connection checked" : `${result.imported.documents} documents indexed`) : "Some content could not be read. Check the connection details.", result.connector.status === "connected" ? "success" : "neutral");
    } catch (e) { notify(failure(e), "error"); }
    finally { await load(); setSyncing((current) => current.filter((value) => value !== id)); }
  }
  async function remove() {
    if (!removing) return;
    try { await api(`/api/connectors/${removing.id}`, { method: "DELETE" }); setRemoving(null); await load(); notify("Connection and local index removed", "success"); }
    catch (e) { notify(failure(e), "error"); }
  }
  return <>
    <PageHeader title="Connections" detail="Your assistants and knowledge, in one place." actions={<button className="button button--primary" disabled={!data} onClick={() => { setInitialKind("markdown-directory"); setAdding(true); }}><Plus size={16} /> Add connection</button>} />
    <section className="discovery-panel" aria-label="Local discovery" aria-live="polite">
      <div className="section-heading"><h2>{discoveryError ? "Discovery unavailable" : !discovery ? "Looking for local tools…" : "Found on your gateway"}</h2><button className="text-button" onClick={discover} disabled={!discovery && !discoveryError}><RefreshCw size={14} />Scan again</button></div>
      <p>{discoveryError ? "Retry the scan, or add a source below." : "Checks installed tool locations. No files or credentials are read."}</p>
      <div className="discovery-options">{discovery?.filter((tool) => tool.available).map((tool) => {
        const connected = data?.connectors.some((source) => source.kind === tool.kind);
        return <button className="button button--secondary" key={tool.kind} disabled={!data || connected} onClick={() => { setInitialKind(tool.kind); setAdding(true); }}>{connected ? <Check size={16} /> : <Plus size={16} />}{tool.name}{connected ? " · added" : " · connect"}</button>;
      })}{discovery && !discovery.some((tool) => tool.available) && <p>No supported local tools found. Start with a folder of notes.</p>}
      {data?.connectors.length === 0 && <button className="button button--secondary" onClick={() => { setInitialKind("markdown-directory"); setAdding(true); }}><FileText size={16} />Connect local notes<ArrowRight size={16} /></button>}</div>
    </section>
    <details className="connection-help"><summary>How connections work</summary><section className="setup-guide" aria-label="Getting connected">
      <div><span className="setup-step">1</span><h2>Choose a source</h2><p>Connect an existing assistant, local notes or selected Notion pages. Grok Bot has a separate handoff below.</p></div>
      <div><span className="setup-step">2</span><h2>Check it works</h2><p>We check each connection when you add it. If something is missing, your setup is saved so you can retry.</p></div>
      <div><span className="setup-step">3</span><h2>Try something useful</h2><p>Search your notes or give an assistant its first task.</p><div className="setup-links"><button className="text-button" onClick={() => navigate("/brain")}>Search knowledge <ArrowRight size={14} /></button><button className="text-button" onClick={() => navigate("/agents")}>Set up an assistant <ArrowRight size={14} /></button></div></div>
    </section>
    <div className="connection-summary"><ShieldCheck size={18} /><div><strong>Your connections stay on this computer</strong><span>Secrets are stored in the local vault. Only content you choose is shared with a connected service.</span></div></div></details>
    {error ? <div className="notice" role="alert">{error}<button onClick={load}>Retry</button></div> : !data ? <Skeleton lines={6} /> : data.connectors.length === 0 ? null : <div className="connections-grid">{data.connectors.map((connector) => <Card key={connector.id} className="connection-card">
      <span className="connection-logo">{connector.capabilities.includes("knowledge.read") ? <FileText size={21} /> : <Bot size={21} />}</span>
      <div className="connection-card__body">
        <div className="connection-card__head"><h2>{connector.name}</h2><StatusPill state={connector.status} /></div>
        <p>{labels[connector.kind] ?? connector.kind} · {connector.kind === "openai-compatible" ? "Text conversations and drafts" : connector.capabilities.includes("message.send") ? "Conversation and assistant tasks" : connector.capabilities.includes("knowledge.search") ? "Read-only knowledge search" : "Workspace availability"}</p>
        <dl><div><dt>Last checked</dt><dd>{connector.lastSyncAt ? relativeTime(connector.lastSyncAt) : "Not checked yet"}</dd></div></dl>
        {connector.error && <div className="connection-error" role="status">{connector.error}</div>}
      </div>
      <div className="connection-card__actions"><button className="button button--secondary" onClick={() => navigate(`/agents?source=${encodeURIComponent(connector.id)}`)}>Prepare this team <ArrowRight size={15} /></button><button className="button button--secondary" onClick={() => sync(connector.id)} disabled={syncing.includes(connector.id)}>{syncing.includes(connector.id) ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} {connector.capabilities.includes("knowledge.read") ? "Refresh documents" : "Check connection"}</button>{connector.id !== "demo" && <button className="icon-button icon-button--danger" onClick={() => setRemoving(connector)} aria-label={`Remove ${connector.name}`}><Trash2 size={16} /></button>}</div>
    </Card>)}</div>}
    <GrokPanel notify={notify} navigate={navigate} />
    {adding && <AddConnection initialKind={initialKind} catalog={data?.catalog ?? []} close={() => { setAdding(false); void load(); }} changed={load} navigate={navigate} />}
    {removing && <Dialog title={`Remove ${removing.name}?`} close={() => setRemoving(null)}><p>The connection and its local search index will be removed. The original source will stay unchanged.</p><div className="dialog-actions"><button className="button button--ghost" onClick={() => setRemoving(null)}>Keep connection</button><button className="button button--danger" onClick={remove}>Remove connection</button></div></Dialog>}
  </>;
}

export function AddConnection({ catalog, close, changed, initialKind, navigate, onSaved, onReady }: { catalog: CatalogItem[]; close(): void; changed(): Promise<void>; initialKind: string; navigate(path: string): void; onSaved?(connector: Connector): void; onReady?(connector: Connector): void }) {
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState("");
  const [fieldA, setFieldA] = useState("");
  const [fieldB, setFieldB] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Connector | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [model, setModel] = useState("");
  const [accessMode, setAccessMode] = useState("subscription");
  const [maxOutputTokens, setMaxOutputTokens] = useState(4096);
  const compatible = kind === "openai-compatible";
  const local = kind === "markdown-directory" || kind === "obsidian-vault";
  const knowledge = local || kind === "notion";
  async function check(connector: Connector) {
    setError(""); setBusy(true);
    try {
      const result = await api<{ connector: Connector; imported: { documents?: number } }>(`/api/connectors/${connector.id}/sync`, { method: "POST" });
      setCreated(result.connector); setChecked(true); setCount(result.imported.documents ?? null);
      if (result.connector.status !== "connected") setError(result.connector.error ?? "Some source content could not be read. Review the source and refresh it again.");
    } catch (e) { setError(failure(e)); }
    finally { setBusy(false); await changed(); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const config = kind === "openclaw-cli" ? { agentId: fieldA || "main", sessionKey: fieldB || undefined }
      : kind === "gbrain-cli" ? {}
      : kind === "notion" ? { pages: fieldA, token: fieldB }
      : compatible ? { endpoint: fieldA, token: fieldB || undefined, model, accessMode, maxOutputTokens, policyConfirmed: consent }
      : local ? { path: fieldA.trim().replace(/^"(.*)"$/, "$1") }
      : { endpoint: fieldA, token: fieldB || undefined };
    try {
      const connector = await api<Connector>("/api/connectors", { method: "POST", body: JSON.stringify({ name: name.trim() || labels[kind], kind, config }) });
      setCreated(connector); onSaved?.(connector); setFieldB(""); await check(connector);
    } catch (e) { setError(failure(e)); setBusy(false); }
  }
  return <Dialog title="Add connection" close={() => { if (!busy) close(); }}>
    {created ? <div className="connection-result" aria-live="polite">
      <div className="connection-result__icon">{busy ? <LoaderCircle className="spin" size={26} /> : checked && !error ? <Check size={26} /> : <RefreshCw size={26} />}</div>
      <h3>{busy ? "Checking your source…" : checked ? error ? "Your source is ready with limited coverage" : "Your source is ready" : "Connection saved; one more step"}</h3>
      <p>{created.name}{count !== null ? ` · ${count} documents indexed` : ""}</p>
      {count === 0 && !error && <p>No supported documents were found. Check that you selected the right folder or pages, then refresh this connection.</p>}
      {error && <><p className="notice" role="status">{error}</p><p>{checked ? "The readable documents are available in Knowledge. Some content is outside this connection's supported scope or could not be included; refreshing may give the same coverage." : "Your connection is saved. Check the source's installation or access, then retry. To change its address or secret, close this dialog, remove the connection and add it again."}</p></>}
      {!busy && <div className="dialog-actions">{error && !checked && <button className="button button--secondary" onClick={() => check(created)}>Retry check</button>}<button className="button button--secondary" onClick={close}>Done</button>{checked && !error && <button className="button button--primary" onClick={() => { close(); if (onReady) onReady(created); else navigate(`/agents?source=${encodeURIComponent(created.id)}`); }}>{onReady ? "Continue setup" : "Prepare this team"}<ArrowRight size={16} /></button>}</div>}
    </div> : <form className="alpha-form" onSubmit={submit}>
      <label>Source<select aria-label="Source" value={kind} onChange={(e) => { setKind(e.target.value); setFieldA(""); setFieldB(""); setModel(""); setAccessMode("subscription"); setMaxOutputTokens(4096); setConsent(false); setError(""); }}>{catalog.map((item) => <option key={item.id} value={item.id}>{labels[item.id] ?? item.displayName}</option>)}</select></label>
      <p className="source-instructions">{descriptions[kind]}</p>
      <label>Connection name <small>optional</small><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={labels[kind]} /></label>
      {local ? <><label>{kind === "obsidian-vault" ? "Vault folder" : "Document folder"}<input value={fieldA} onChange={(e) => setFieldA(e.target.value)} placeholder="C:\Notes or /home/me/notes" required /></label><p className="form-note">Use the full folder path. In Windows Explorer, choose Copy as path; on macOS use Copy as Pathname in Finder. This is a folder on your gateway computer, even when you use your phone.</p></>
        : kind === "notion" ? <><p className="form-note"><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">Open Notion connections</a>. Enable Read content only. In each page's menu, add your connection.</p><label>Page links or IDs<textarea value={fieldA} onChange={(e) => setFieldA(e.target.value)} rows={3} placeholder="One page link per line" required /></label><p className="form-note">Only these pages are indexed. Add child pages separately if you want to include them.</p><label>Notion connection secret<input type="password" autoComplete="off" value={fieldB} onChange={(e) => setFieldB(e.target.value)} required placeholder="Stored in your local vault" /></label></>
        : kind === "openclaw-cli" ? <><label>Agent ID <small>optional</small><input value={fieldA} onChange={(e) => setFieldA(e.target.value)} placeholder="main" /></label><label>Session key <small>optional</small><input value={fieldB} onChange={(e) => setFieldB(e.target.value)} placeholder="Use a dedicated portal conversation" /></label><a href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noreferrer">OpenClaw setup instructions</a></>
        : kind === "gbrain-cli" ? null
        : compatible ? <><label>API base address<input type="url" value={fieldA} onChange={(e) => setFieldA(e.target.value)} placeholder="http://127.0.0.1:8317/v1" required /></label><p className="form-note">Use the proxy address on your gateway computer. Connections to another computer require HTTPS.</p><label>Access mode<select value={accessMode} onChange={(e) => { setAccessMode(e.target.value); setConsent(false); }}><option value="subscription">Existing subscription through a proxy</option><option value="local">Local model</option></select></label><label>Proxy access token <small>{accessMode === "local" ? "optional on this computer" : "required"}</small><input type="password" autoComplete="off" value={fieldB} onChange={(e) => setFieldB(e.target.value)} required={accessMode === "subscription"} placeholder="Proxy key, not your account password" /></label><label>Model ID<input value={model} onChange={(e) => setModel(e.target.value)} maxLength={200} required placeholder="Exact model ID from your source" /></label><label>Maximum output tokens<input type="number" value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} min={256} max={16384} step={1} required /></label><p className="form-note">The connection check confirms that the model is listed. A first message checks generation. Subscription quotas and proxy compatibility still apply. Metered API access is not supported here.</p><a href="https://github.com/router-for-me/CLIProxyAPI" target="_blank" rel="noreferrer">CLIProxyAPI setup instructions</a><label className="check-label"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>I configured this source for subscription or local access with paid fallback disabled. The portal cannot inspect upstream billing settings.</span></label></>
        : <><label>Server address<input type="url" value={fieldA} onChange={(e) => setFieldA(e.target.value)} placeholder={kind === "hermes-api" ? "http://127.0.0.1:8642" : kind === "t3-workspace" ? "http://127.0.0.1:3773" : "https://assistant.example/hooks/agent"} required /></label><label>Access token <small>optional</small><input type="password" autoComplete="off" value={fieldB} onChange={(e) => setFieldB(e.target.value)} placeholder="Stored in your local vault" /></label></>}
      {knowledge && <label className="check-label"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>Index the selected documents on this computer for search. I can remove the connection to delete its local index.</span></label>}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button--ghost" onClick={close}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? "Saving…" : "Add and check"}<ArrowRight size={16} /></button></div>
    </form>}
  </Dialog>;
}
