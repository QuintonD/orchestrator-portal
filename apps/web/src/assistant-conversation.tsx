import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import type { AssistantProfile, Message } from "@orchestrator/contracts";
import { api } from "./lib.js";
import { Card, PageHeader, StatusPill } from "./components.js";
import { AssistantReasoning } from "./assistant-reasoning.js";
import { AssistantSigil } from "./presence.js";

export function AssistantConversation({ assistantId, notify }: { assistantId: string; notify(message: string, tone?: "neutral" | "success" | "error"): void }) {
  const [profiles, setProfiles] = useState<AssistantProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState(new URLSearchParams(location.search).get("draft") ?? "");
  const [busy, setBusy] = useState(false);
  const [reasoningBusy, setReasoningBusy] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [paused, setPaused] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const profile = profiles.find((p) => p.id === assistantId);
  async function load() {
    setLoading(true);
    try {
      const [team, history] = await Promise.all([api<{ assistants: AssistantProfile[]; dispatchPaused: boolean }>("/api/assistants"), api<Message[]>(`/api/assistants/${encodeURIComponent(assistantId)}/messages`)]);
      setProfiles(team.assistants.filter((p) => !p.mode || p.mode === "runtime")); setPaused(team.dispatchPaused); setMessages(history); setFailure("");
    } catch (e) { setFailure(e instanceof Error ? e.message : "Could not load this conversation"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [assistantId]);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, busy, reasoningBusy]);
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!body.trim() || busy || reasoningBusy || paused || profile?.state !== "ready") return;
    setBusy(true); const sent = body.trim(); setBody("");
    try {
      const result = await api<{ message: Message; reply: Message }>(`/api/assistants/${encodeURIComponent(assistantId)}/messages`, { method: "POST", body: JSON.stringify({ body: sent }) });
      setMessages((current) => [...current, result.message, result.reply]);
      if (result.reply.state === "unknown") { setPaused(true); notify("Delivery is uncertain. Inspect the source before another request."); }
    } catch (e) { setBody(sent); setFailure(e instanceof Error ? e.message : "Delivery could not be confirmed. Inspect the source before retrying."); } finally { setBusy(false); }
  }
  return <div className="assistant-layout role-conversation"><div className="assistant-main"><PageHeader title={profile?.name ?? "Conversation"} detail={profile?.purpose ?? "Loading assistant…"} actions={<a className="button button--ghost" href="/agents"><ArrowLeft size={15} />Team</a>} /><Card className="conversation-card"><div className="conversation-day"><span>Dedicated assistant conversation</span><select aria-label="Conversation assistant" value={assistantId} disabled={busy} onChange={(e) => { location.href = `/assistant?assistant=${encodeURIComponent(e.target.value)}`; }}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.connectorId}</option>)}</select></div><div className="message-list" ref={list}>{failure && <div role="alert" className="notice">{failure}<button onClick={load}>Refresh</button></div>}{!loading && !messages.length && profile && <div className="conversation-welcome"><AssistantSigil name={profile.name} icon={profile.icon} /><h2>{profile.name} is ready</h2><p>{profile.purpose}</p><button className="button button--secondary" onClick={() => setBody("What is the next useful step, and what evidence supports it?")}>Help me find the next step</button></div>}{messages.map((m) => <article key={m.id} className={`message message--${m.role}`}><div className="message-content"><p className="eyebrow">{m.role === "user" ? "You" : profile?.name}</p><div className="message-body">{m.body}</div><div className="message-meta"><StatusPill state={m.state} /></div></div></article>)}{busy && <div className="message"><AssistantSigil name={profile?.name ?? "Assistant"} state="running" /><p role="status">Awaiting {profile?.name}…</p></div>}</div>{profile && <AssistantReasoning key={assistantId} assistantId={assistantId} disabled={busy || profile.state === "running"} onBusyChange={setReasoningBusy} />}<form className="composer" onSubmit={send}>{(paused || (profile && profile.state !== "ready")) && <p className="form-note">Dispatch is paused or needs a source check. Inspect this assistant in Team.</p>}<textarea aria-label="Message" placeholder={`Message ${profile?.name ?? "assistant"}…`} value={body} maxLength={20000} disabled={!profile || busy || paused || profile.state !== "ready"} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={2} /><div className="composer__foot"><span>Shared only with this assistant's configured runtime</span><button aria-label="Send message" disabled={!body.trim() || busy || reasoningBusy || paused || profile?.state !== "ready"}><Send size={17} /></button></div></form></Card></div><aside className="context-rail"><p className="eyebrow">Assistant mandate</p><h3>{profile?.name}</h3><p>{profile?.criteria}</p><p>Connection: {profile?.connectorId}</p><p>This conversation has its own history. Runtime tools and data restrictions remain source-managed.</p></aside></div>;
}
