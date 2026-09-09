import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Moon, Pause, Play, Plus, RotateCcw, Sun } from "lucide-react";
import { appendAssistant, assistantMotions, buildNetwork, consolidateNetwork, finiteMotion, formSubteam, networkCount, type MarkMaterial, type MotionPolicy, type PresenceState } from "./assistant-rig.js";
import { PresenceField } from "./presence.js";
import { AssistantSoundControls, useMotionPreference } from "./assistant-motion-controls.js";
import { useAssistantSound } from "./assistant-sound.js";
const original = "/assistant-original.png";
import "./assistant-motion-studio.css";

const groups = ["Idle", "Active", "Network", "Personality", "Outcome"] as const;
export default function AssistantMotionStudio() {
  const [state, setState] = useState<PresenceState>("drifting");
  const [paused, setPaused] = useState(false);
  const [dark, setDark] = useState(false);
  const [replay, setReplay] = useState(0);
  const [showReference, setShowReference] = useState(false);
  const [network, setNetwork] = useState(() => buildNetwork());
  const assistants = networkCount(network);
  const leads = Math.min(5, network.filter(node => node.parent && network.some(child => child.parent === node.id)).length);
  const [parent, setParent] = useState("centre");
  const growthParent = network.some(node => node.id === parent) ? parent : "centre";
  const [material, setMaterial] = useState<MarkMaterial>("ink");
  const [running, setRunning] = useState(false);
  const motion = assistantMotions.find(item => item.id === state)!;
  const [group, setGroup] = useState<(typeof groups)[number]>("Idle");
  const preference = useMotionPreference("assistant-motion-preview-policy");
  const sound = useAssistantSound();
  const activity = useCallback((value: boolean) => { setRunning(value); sound.activity(value); }, [sound.activity]);
  const reduced = preference.policy === "system" && preference.reduced;
  useEffect(() => {
    const previous = document.documentElement.dataset.theme, title = document.title;
    document.title = "Assistant · Motion & sound";
    return () => { document.title = title; if (previous) document.documentElement.dataset.theme = previous; else delete document.documentElement.dataset.theme; };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  function choose(next: PresenceState) {
    setState(next); setReplay(value => value + 1); setShowReference(false); setPaused(false);
    if (next === "consolidating") setNetwork(current => consolidateNetwork(current));
    if (next === "delegating") setNetwork(current => formSubteam(current, growthParent));
    if (next === "growing") setNetwork(current => appendAssistant(current, growthParent));
  }

  return <main className="motion-studio">
    <header className="motion-studio__header"><a href="/" className="motion-studio__brand"><ArrowLeft size={16} /> Orchestrator <span>/ Motion & sound</span></a><button className="icon-button" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></header>
    <section className="motion-studio__intro"><div><p className="eyebrow">MAIN ASSISTANT / STUDY 03</p><h1>A presence of its own.</h1></div><p>Idle gestures, active rhythms, and a team that grows.<br />Movement and sound, made to work together.</p></section>
    <div className="motion-studio__toolbar"><div className="motion-studio__transport"><button className="button button--secondary" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume" : "Pause motion"}</button><button className="icon-button" aria-label="Replay animation" onClick={() => { setReplay(value => value + 1); setPaused(false); }}><RotateCcw size={16} /></button><label className="motion-studio__policy">Motion<select aria-label="Motion preference" value={preference.policy} onChange={e => preference.setPolicy(e.target.value as MotionPolicy)}><option value="system">Use device setting</option><option value="full">Full motion</option><option value="still">Still</option></select></label></div><AssistantSoundControls sound={sound} /></div>
    {reduced && <div className="motion-studio__reduced" role="status"><span>Your device has reduced motion enabled. This preview is still.</span><button className="text-button" onClick={() => preference.setPolicy("full")}>Play full motion <Play size={13} /></button></div>}
    <section className="motion-studio__workspace" aria-label="Animation preview">
      <div className="motion-studio__stage">
        <div className="motion-studio__stage-top"><span className="motion-studio__tag" data-running={running}>{showReference ? "ORIGINAL TRANSPARENT PNG" : reduced ? "DEVICE MOTION REDUCED" : paused || preference.policy === "still" ? "MOTION PAUSED" : running ? "PLAYING" : "AT REST"}</span><button aria-pressed={showReference} onClick={() => setShowReference(!showReference)}>{showReference ? "Back to animation" : "Compare original"}</button></div>
        <div className="motion-studio__art"><PresenceField revision={replay} state={state} reference={showReference} paused={paused} policy={preference.policy} network={network} material={material} onFrame={sound.tick} onActivity={activity} /></div>
        <div className="motion-studio__caption"><div aria-live="polite"><h2>{showReference ? "Your original artwork" : motion.name}</h2><p>{showReference ? "Transparent PNG · 1371 × 1148 · same artboard and display size" : motion.detail}</p></div><span>{showReference ? <a href={original} target="_blank" rel="noreferrer">Open PNG ↗</a> : `${motion.duration ? `${motion.duration} s` : "Still"} / ${motion.group.toLowerCase()}`}</span></div>
      </div>
      <aside className="motion-studio__controls">
        <div className="motion-studio__groups" role="group" aria-label="Animation categories">{groups.map(item => <button key={item} aria-pressed={group === item} onClick={() => setGroup(item)}>{item}</button>)}</div>
        <div className="motion-studio__states" role="group" aria-label="Assistant animations">{assistantMotions.filter(item => item.group === group).map(item => <button key={item.id} aria-pressed={state === item.id} onClick={() => choose(item.id)}><span>{item.name}<small>{item.duration ? `${item.duration} s${finiteMotion(item.id) ? " · once" : " · loop"}` : "Still"}</small></span><span className="motion-studio__selection" /></button>)}</div>
        <div className="motion-studio__sound-note"><p className="eyebrow">SOUND SIGNATURE</p><p>{motion.sound}</p></div>
        <div className="motion-studio__material"><p className="eyebrow">SURFACE</p><div role="group" aria-label="Mark surface">{(["ink", "satin"] as const).map(value => <button key={value} aria-pressed={material === value} onClick={() => setMaterial(value)}>{value}</button>)}</div></div>
      </aside>
    </section>
    <section className="motion-studio__network" aria-label="Preview team">
      <div><p className="eyebrow">SHAPE THE PREVIEW TEAM</p><p>Every gesture uses this team. Growth adds a branch; consolidation keeps the total.</p><small>This is a motion study. These controls do not change your workspace.</small></div>
      <div className="motion-studio__network-controls">
        <label>Assistants <output data-testid="team-total">{assistants}</output><input aria-label="Preview assistant count" type="range" min="0" max="120" value={assistants} onChange={e => { const value = Number(e.target.value); setNetwork(buildNetwork({ assistants: value, leads: Math.min(leads, value) })); setShowReference(false); }} /></label>
        <label>Lead assistants <output>{leads}</output><input aria-label="Preview lead count" type="range" min="0" max={Math.min(5, assistants)} value={leads} onChange={e => { setNetwork(buildNetwork({ assistants, leads: Number(e.target.value) })); setShowReference(false); }} /></label>
        <label className="motion-studio__parent">Grow from<select aria-label="Growth parent" value={growthParent} onChange={e => setParent(e.target.value)}>{network.map((node, i) => <option key={node.id} value={node.id}>{node.parent ? `Assistant ${i}${node.members > 1 ? ` · group of ${node.members}` : ""}` : "Main assistant"}</option>)}</select></label>
        <div className="motion-studio__network-actions">
          <button className="button button--secondary" disabled={assistants >= 120} onClick={() => { setNetwork(current => appendAssistant(current, growthParent)); setShowReference(false); setPaused(false); if (!motion.duration) { setState("growing"); setGroup("Network"); } }}><Plus size={14} />Add assistant</button>
          <button className="button button--secondary" onClick={() => { setNetwork(buildNetwork({ assistants: 36 })); setShowReference(false); }}>Load 36 assistants</button>
          <button className="text-button" onClick={() => { setNetwork(buildNetwork()); setParent("centre"); setGroup("Idle"); choose("still"); }}>Reset team</button>
        </div>
      </div>
    </section>
    <footer className="motion-studio__footer"><span>18 STUDIES / SVG GEOMETRY + LOCAL AUDIO</span><span>Sound starts when you turn it on. Mute stops it immediately.</span></footer>
  </main>;
}
