import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIconAppearance } from "./icon-appearance.js";
import { iconRow } from "./icon-themes.js";
import { AssistantSprite } from "./sprite.js";
import { AssistantMark, animatedPresenceStates, type PresenceState } from "./assistant-mark.js";
import type { AssistantMarkProps } from "./assistant-mark.js";
import type { MotionPolicy } from "./assistant-rig.js";
import { buildNetwork } from "./assistant-rig.js";
import "./presence-field.css";

export type { PresenceState } from "./assistant-mark.js";

// Stable identities remain recognizable when the list is sorted or filtered.
export function AssistantSigil({ name, state = "ready", icon }: { name: string; state?: string; icon?: number | undefined }) {
  const { theme } = useIconAppearance();
  return <span className="assistant-sigil" aria-hidden="true"><AssistantSprite theme={theme} row={icon ?? iconRow(name)} active={state === "running"} /></span>;
}

/** Decorative source-state illustration. The adjacent text supplies meaning. */
export function PresenceField({ active = false, state, paused = false, policy = "system", reference = false, onActivity, ...rigProps }: Omit<AssistantMarkProps, "moving" | "onComplete"> & { active?: boolean; paused?: boolean; policy?: MotionPolicy; reference?: boolean; onActivity?: ((active: boolean) => void) | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = state ?? (active ? "thinking" : "resting");
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [finished, setFinished] = useState<{ mode: PresenceState; revision: number | undefined; network: AssistantMarkProps["network"] } | null>(null);
  useLayoutEffect(() => setFinished(null), [mode, rigProps.revision, rigProps.network, rigProps.assistants, rigProps.leads]);
  const completed = finished?.mode === mode && finished.revision === rigProps.revision && finished.network === rigProps.network;
  const moving = animatedPresenceStates.has(mode) && !completed && !reference && !paused && visible && pageVisible && policy !== "still" && (policy === "full" || !reduced);
  const source = buildNetwork();
  const original = reference || (mode === "still" && (rigProps.network ? rigProps.network.length === source.length && rigProps.network.every((node, i) => ["x", "y", "r", "id", "parent", "members"].every(key => node[key as keyof typeof node] === source[i]![key as keyof typeof node])) : (rigProps.assistants ?? 5) === 5 && !rigProps.leads));

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(preference.matches); setPageVisible(document.visibilityState === "visible"); };
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    observer.observe(element);
    update();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => { onActivity?.(moving); return () => onActivity?.(false); }, [moving, onActivity]);

  return <div ref={ref} className="presence-field" data-state={mode} data-original={original} data-motion={moving ? "running" : "paused"} aria-hidden="true">
    <AssistantMark {...rigProps} state={mode} moving={moving} onComplete={() => setFinished({ mode, revision: rigProps.revision, network: rigProps.network })} />
    {original && <img className="presence-field__original" src="/assistant-original.png" alt="" />}
  </div>;
}
