import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";
import { ecosystemSnapshotSchema, type EcosystemSnapshot } from "@orchestrator/contracts";
import { api } from "./lib.js";
import { buildNetwork, motionDefinition, type MotionPolicy, type PresenceState, type RigNode } from "./assistant-rig.js";
import { PresenceField } from "./presence.js";
import { AssistantSoundControls, useMotionPreference } from "./assistant-motion-controls.js";
import { useAssistantSound } from "./assistant-sound.js";
import { ecosystemGesture, ecosystemMood, ecosystemNetwork, sourceIsStale } from "./ecosystem-model.js";
import "./ecosystem-presence.css";

interface Model { snapshot: EcosystemSnapshot | null; network: RigNode[]; gesture: { state: PresenceState; revision: number } | null; revision: number; }
function useEcosystem() {
  const [model, setModel] = useState<Model>(() => ({ snapshot: null, network: buildNetwork({ assistants: 0 }), gesture: null, revision: 0 }));
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [heroVisible, setHeroVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const sound = useAssistantSound();
  const motion = useMotionPreference();
  const activeViews = useRef(new Set<string>());
  const activity = useCallback((view: string, active: boolean) => { if (active) activeViews.current.add(view); else activeViews.current.delete(view); sound.activity(activeViews.current.size > 0); }, [sound.activity]);

  useEffect(() => {
    let disposed = false, loading = false, again = false, debounce = 0;
    let controller: AbortController | null = null;
    let stream: EventSource | null = null;
    const requests = new Set<string>();
    const refresh = async () => {
      if (disposed || document.hidden) return;
      if (loading) { again = true; return; }
      loading = true; controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const next = ecosystemSnapshotSchema.parse(await api<unknown>("/api/presence", { signal: controller.signal }));
        if (disposed) return;
        setUnavailable(false); setNow(Date.now());
        setModel(current => {
          if (JSON.stringify(current.snapshot) === JSON.stringify(next)) return current;
          const state = current.snapshot ? ecosystemGesture(current.snapshot, next) : null;
          const network = ecosystemNetwork(current.network, next);
          return { snapshot: next, network: JSON.stringify(network) === JSON.stringify(current.network) ? current.network : network,
            gesture: state ? { state, revision: current.revision + 1 } : current.gesture, revision: current.revision + (state ? 1 : 0) };
        });
      } catch { if (!disposed && !document.hidden) setUnavailable(true); }
      finally { clearTimeout(timeout); loading = false; if (again && !disposed) { again = false; void refresh(); } }
    };
    const schedule = () => { clearTimeout(debounce); debounce = window.setTimeout(() => void refresh(), 150); };
    refreshRef.current = () => void refresh();
    const visibility = () => {
      stream?.close(); stream = null;
      if (document.hidden) { clearTimeout(debounce); controller?.abort(); return; }
      stream = new EventSource("/api/events/stream");
      stream.addEventListener("portal", schedule);
      stream.addEventListener("ready", schedule);
      void refresh();
    };
    const request = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; active: boolean }>).detail;
      if (!detail || typeof detail.id !== "string") return;
      if (detail.active) requests.add(detail.id); else requests.delete(detail.id);
      setPending(requests.size > 0); schedule();
    };
    visibility();
    const poll = window.setInterval(() => { if (!document.hidden) { setNow(Date.now()); void refresh(); } }, 15_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("orchestrator:request", request);
    return () => { disposed = true; controller?.abort(); stream?.close(); clearTimeout(debounce); clearInterval(poll); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("orchestrator:request", request); };
  }, []);
  useEffect(() => {
    if (!model.gesture) return;
    const revision = model.gesture.revision;
    const timer = window.setTimeout(() => setModel(current => current.gesture?.revision === revision ? { ...current, gesture: null } : current), motionDefinition(model.gesture.state).duration * 1000);
    return () => clearTimeout(timer);
  }, [model.gesture]);
  const mood = ecosystemMood(model.snapshot, unavailable, pending, now);
  const gesture = ["aware", "offline", "paused", "still"].includes(mood.state) ? null : model.gesture;
  const state = gesture?.state ?? mood.state;
  return { ...model, mood, state, unavailable, pending, now, sound, motion, activity, heroVisible, setHeroVisible, expanded, setExpanded, refresh: () => refreshRef.current() };
}
const EcosystemContext = createContext<ReturnType<typeof useEcosystem> | null>(null);
export function EcosystemProvider({ children }: { children: ReactNode }) {
  const value = useEcosystem();
  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>;
}
export function useEcosystemPresence() {
  const value = useContext(EcosystemContext);
  if (!value) throw new Error("EcosystemProvider is required");
  return value;
}
function EcosystemAvatar({ view, paused = false }: { view: string; paused?: boolean }) {
  const ecosystem = useEcosystemPresence();
  const onActivity = useCallback((active: boolean) => ecosystem.activity(view, active), [ecosystem.activity, view]);
  return <PresenceField state={ecosystem.state} network={ecosystem.network} material="satin" revision={ecosystem.revision} policy={ecosystem.motion.policy} paused={paused} onFrame={ecosystem.sound.tick} onActivity={onActivity} />;
}
function MotionControl() {
  const { motion } = useEcosystemPresence();
  return <label className="ecosystem-motion">Motion<select aria-label="Assistant motion" value={motion.policy} onChange={event => motion.setPolicy(event.target.value as MotionPolicy)}><option value="system">{motion.reduced ? "Reduced motion" : "Device setting"}</option><option value="full">Full motion</option><option value="still">Still</option></select></label>;
}
export function EcosystemHero() {
  const ref = useRef<HTMLDivElement>(null);
  const { setHeroVisible, expanded, setExpanded } = useEcosystemPresence();
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(Boolean(entry?.isIntersecting)));
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); setHeroVisible(false); };
  }, [setHeroVisible]);
  return <div ref={ref} className="portal-presence"><button className="ecosystem-hero" aria-label="Open ecosystem" onClick={() => setExpanded(true)}><EcosystemAvatar view="hero" paused={expanded} /></button><MotionControl /></div>;
}
export function EcosystemDock({ navigate }: { navigate(path: string): void }) {
  const ecosystem = useEcosystemPresence();
  const { snapshot, heroVisible, expanded, setExpanded, mood, unavailable, now } = ecosystem;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, [expanded]);
  const running = snapshot?.assistants.filter(a => a.state === "running").length ?? 0;
  const paused = snapshot?.assistants.filter(a => a.state === "paused").length ?? 0;
  const stale = snapshot?.connectors.filter(c => sourceIsStale(c, now)).length ?? 0;
  function go(path: string) { setExpanded(false); navigate(path); }
  return <div className="ecosystem-dock" data-home-visible={heroVisible}>
    <button className="ecosystem-dock__button" aria-label={`Open ecosystem: ${mood.label}`} aria-haspopup="dialog" aria-expanded={expanded} disabled={heroVisible} onClick={() => setExpanded(true)}><EcosystemAvatar view="dock" paused={heroVisible || expanded} /><span>{mood.label}</span></button>
    {expanded && <dialog ref={dialog} className="ecosystem-panel" aria-label="Your ecosystem" onCancel={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <div className="ecosystem-panel__inside">
        <div className="ecosystem-panel__heading"><p className="eyebrow">YOUR ECOSYSTEM</p><button className="icon-button" aria-label="Close dialog" title="Close ecosystem" onClick={() => setExpanded(false)}><X size={18} /></button></div>
        <div className="ecosystem-panel__avatar"><EcosystemAvatar view="panel" /></div>
        <h2>{mood.label}</h2>
        <p className="ecosystem-panel__detail">{unavailable ? "Showing the last known team. Its current activity is unavailable." : !snapshot ? "Reading the current workspace." : snapshot.assistants.length > 18 ? "Branches group assistants that share a source." : "Each branch is an assistant. Working branches pulse; paused ones grow quiet."}</p>
        <dl className="ecosystem-panel__counts"><div><dt>Assistants</dt><dd>{snapshot?.assistants.length ?? "—"}</dd></div><div><dt>Working</dt><dd>{snapshot ? running : "—"}</dd></div><div><dt>Paused</dt><dd>{snapshot ? paused : "—"}</dd></div><div><dt>Need you</dt><dd>{snapshot?.attentionCount ?? "—"}</dd></div></dl>
        {snapshot?.dispatchPaused && <p className="form-note">New dispatch is paused. Source work may still continue.</p>}
        {!!stale && !unavailable && <button className="text-button" onClick={() => go("/connections")}>{stale} {stale === 1 ? "source needs" : "sources need"} a check <ArrowRight size={14} /></button>}
        <div className="ecosystem-panel__actions">{unavailable ? <button className="button button--secondary" onClick={ecosystem.refresh}>Retry snapshot</button> : <button className="button button--secondary" onClick={() => go(mood.destination)}>View {mood.destination === "/attention" ? "attention" : mood.destination === "/connections" ? "connections" : mood.destination === "/activity" ? "activity" : "team"}<ArrowRight size={14} /></button>}</div>
        <div className="ecosystem-panel__preferences"><MotionControl /><AssistantSoundControls sound={ecosystem.sound} /></div>
        <p className="ecosystem-panel__note">Reflects the latest recorded state. A returned report still needs its evidence reviewed.</p>
      </div>
    </dialog>}
  </div>;
}
