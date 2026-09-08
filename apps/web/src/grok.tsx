import { useEffect, useState, type FormEvent } from "react";
import type { Report } from "@orchestrator/contracts";
import { Copy, Download, ExternalLink, FileText } from "lucide-react";
import { api } from "./lib.js";

interface Props {
  notify(message: string, tone?: "neutral" | "success" | "error"): void;
  navigate?(path: string): void;
}
interface Handoff {
  id: string; botName: string; title: string; brief: string; criteria: string;
  taskText: string; createdAt: string; lastImportedAt: string | null; mode: "manual";
}
interface Preview { previewId: string; report: Report; alreadyImported: boolean }
const initialDraft = { botName: "My Grok Bot", title: "Project progress report", brief: "Review my active projects using the sources I have authorized. Identify blockers and decisions that need my attention.", criteria: "Include source links, when the information was checked, uncertainty, and a concrete next step." };
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed";

export function GrokPanel({ notify, navigate }: Props) {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(initialDraft);
  const [showDraft, setShowDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<"json" | "text">("json");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const selected = handoffs.find((handoff) => handoff.id === selectedId);
  const canDownload = !/; wv\)/.test(navigator.userAgent);
  async function load() {
    try {
      const items = await api<Handoff[]>("/api/grok/handoffs");
      setHandoffs(items); setSelectedId((id) => id || items[0]?.id || "");
      setLoaded(true); setFailure("");
    } catch (error) { setFailure(errorText(error)); }
  }
  useEffect(() => { void load(); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const handoff = await api<Handoff>("/api/grok/handoffs", { method: "POST", body: JSON.stringify(draft) });
      setHandoffs((items) => [handoff, ...items]); setSelectedId(handoff.id); setShowDraft(false); setContent(""); setPreview(null);
      notify("Task saved. Copy it into your Grok Bot conversation to start work.", "success");
    } catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  }
  async function copy() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected.taskText); notify("Task copied. Paste it in Grok Bot when ready.", "success"); }
    catch { notify("Clipboard unavailable. Open View saved task text and select the text to copy it.", "error"); }
  }
  function download() {
    if (!selected || !canDownload) return;
    const url = URL.createObjectURL(new Blob([selected.taskText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `grok-handoff-${selected.id}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readFile(file: File | undefined) {
    setPreview(null); setContent("");
    if (!file) return;
    if (file.size > 100000) { notify("Choose a result file of at most 100 KB.", "error"); return; }
    if (!/\.(json|txt)$/i.test(file.name)) { notify("Choose a .json or .txt result file.", "error"); return; }
    setBusy(true);
    try { setFormat(/\.json$/i.test(file.name) ? "json" : "text"); setContent(await file.text()); }
    catch { notify("This file could not be read.", "error"); } finally { setBusy(false); }
  }
  async function preparePreview() {
    if (!selected) return;
    setBusy(true); setPreview(null);
    try { setPreview(await api<Preview>(`/api/grok/handoffs/${selected.id}/preview`, { method: "POST", body: JSON.stringify({ format, content }) })); }
    catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!selected || !preview) return;
    setBusy(true);
    try {
      const result = await api<{ alreadyImported: boolean }>(`/api/grok/handoffs/${selected.id}/import`, { method: "POST", body: JSON.stringify({ previewId: preview.previewId, confirm: true }) });
      setPreview({ ...preview, alreadyImported: true }); await load();
      notify(result.alreadyImported ? "This result is already in Reports." : "Result saved in Reports as a Grok Bot claim.", "success");
    } catch (error) { notify(errorText(error), "error"); } finally { setBusy(false); }
  }
  return <section className="grok-panel" aria-labelledby="grok-heading">
    <div className="section-heading"><div><div className="eyebrow">Manual handoff</div><h2 id="grok-heading">Work with Grok Bot</h2></div><a className="button button--secondary" href="https://x.ai/bot" target="_blank" rel="noopener noreferrer">Grok Bot <ExternalLink size={14} /></a></div>
    <p>Prepare a task here, run it in the Grok Bot app, then bring its result back for review. Work, approvals, and follow-up stay in Grok Bot.</p>
    <p className="form-note">Manual import only. The portal does not monitor Grok Bot or know whether a task is running or finished.</p>
    {failure ? <div className="notice" role="alert">{failure}<button className="button button--secondary" onClick={load}>Retry</button></div> : !loaded ? <p role="status">Loading saved handoffs…</p> : <>
      <button className="button button--secondary" disabled={busy} onClick={() => setShowDraft(!showDraft)}>{showDraft ? "Close task editor" : "Prepare a new task"}</button>
      {showDraft && <form className="alpha-form grok-editor" onSubmit={create}>
        <h3>1. Define the task</h3>
        <label>Bot name<input required maxLength={80} value={draft.botName} onChange={(e) => setDraft({ ...draft, botName: e.target.value })} disabled={busy} /></label>
        <label>Task title<input required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={busy} /></label>
        <label>What should the Bot do?<textarea required minLength={10} maxLength={6000} rows={4} value={draft.brief} onChange={(e) => setDraft({ ...draft, brief: e.target.value })} disabled={busy} /></label>
        <label>What makes a useful result?<textarea required minLength={5} maxLength={2000} rows={3} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} disabled={busy} /></label>
        <button className="button button--primary" disabled={busy}>Save handoff</button>
      </form>}
      {!!handoffs.length && <div className="alpha-form grok-editor"><label>Saved handoff<select value={selectedId} disabled={busy} onChange={(e) => { setSelectedId(e.target.value); setContent(""); setPreview(null); }}>{handoffs.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.botName} · {item.id.slice(0, 8)}</option>)}</select></label></div>}
      {selected && <>
        <div className="grok-step"><h3>2. Give the task to Grok Bot</h3><p>Open or create <strong>{selected.botName}</strong> in the Grok Bot app. Review this task and paste it into its conversation. Saving or copying it here does not send it.</p><p className="form-note">Handoff {selected.id}{selected.lastImportedAt ? ` · Result imported ${new Date(selected.lastImportedAt).toLocaleString()}` : " · No result imported"}</p>
          <details><summary>View saved task text</summary><textarea aria-label="Saved Grok Bot task text" readOnly rows={12} value={selected.taskText} /></details>
          <div className="grok-actions"><button className="button button--primary" onClick={copy}><Copy size={15} />Copy task</button>{canDownload && <button className="button button--secondary" onClick={download}><Download size={15} />Download task</button>}<button className="button button--ghost" disabled={busy} onClick={() => { setDraft({ botName: selected.botName, title: selected.title, brief: selected.brief, criteria: selected.criteria }); setShowDraft(true); }}>Edit as new handoff</button></div>
          {!canDownload && <p className="form-note">Copy the task, or select it under View saved task text to paste into Grok Bot.</p>}
        </div>
        <div className="grok-step alpha-form"><h3>3. Bring back the result</h3><p>Ask Grok Bot to save its result as JSON or plain text. Download the file from its conversation, then select it here or paste its contents. Check that it belongs to this task.</p>
          <label>Result file (.json or .txt, up to 100 KB)<input type="file" accept=".json,.txt,text/plain,application/json" disabled={busy} onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <label>Result format<select disabled={busy} value={format} onChange={(e) => { setFormat(e.target.value as "json" | "text"); setPreview(null); }}><option value="json">JSON report</option><option value="text">Plain text</option></select></label>
          <label>Result contents<textarea rows={6} maxLength={100000} value={content} disabled={busy} onChange={(e) => { setContent(e.target.value); setPreview(null); }} placeholder={format === "json" ? "Paste the JSON file contents, including its handoffId." : "Paste the result for this handoff."} /></label>
          <button className="button button--secondary" disabled={busy || !content.trim()} onClick={preparePreview}><FileText size={15} />Preview import</button>
        </div>
        {preview && <div className="grok-preview" aria-live="polite"><h3>{preview.alreadyImported ? "Result saved in Reports" : "Review before importing"}</h3><p><strong>Claimed · {preview.report.source}</strong></p><h4>{preview.report.title}</h4><div className="grok-result">{preview.report.body}</div><p>{preview.alreadyImported ? "This result is saved for your review." : "Importing saves this result in Reports."} Its text and sources are unverified. Content is displayed as text and source links are not fetched.</p><div className="grok-actions">{preview.alreadyImported ? <a className="button button--primary" href="/reports" onClick={(event) => { if (navigate) { event.preventDefault(); navigate("/reports"); } }}>Open Reports</a> : <button className="button button--primary" disabled={busy} onClick={confirm}>Confirm import as claimed</button>}<button className="button button--ghost" disabled={busy} onClick={() => setPreview(null)}>Dismiss preview</button></div></div>}
      </>}
    </>}
  </section>;
}
