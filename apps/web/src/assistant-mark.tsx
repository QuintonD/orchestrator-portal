import { useLayoutEffect, useId, useRef } from "react";
import { blendFrames, buildNetwork, finiteMotion, motionDefinition, rigWidth, sampleRig, type MarkMaterial, type NetworkOptions, type PresenceState, type RigFrame } from "./assistant-rig.js";
import { createRigPainter } from "./assistant-rig-renderer.js";
export { assistantMotions, animatedPresenceStates, type PresenceState } from "./assistant-rig.js";

export interface AssistantMarkProps extends NetworkOptions {
  state?: PresenceState;
  moving?: boolean;
  material?: MarkMaterial;
  revision?: number;
  onFrame?: ((state: PresenceState, time: number) => void) | undefined;
  onComplete?: (() => void) | undefined;
}

export function AssistantMark({ state = "resting", moving = true, material = "ink", assistants, leads, network, revision = 0, onFrame, onComplete }: AssistantMarkProps) {
  const ref = useRef<SVGSVGElement>(null);
  const elapsed = useRef(0);
  const lastFrame = useRef<RigFrame | null>(null);
  const fromFrame = useRef<RigFrame | null>(null);
  const replayFrom = useRef<RigFrame | null>(null);
  const previousNetwork = useRef(network);
  const paint = useRef<ReturnType<typeof createRigPainter> | null>(null);
  const callback = useRef(onFrame); callback.current = onFrame;
  const complete = useRef(onComplete); complete.current = onComplete;
  const gradientId = `assistant-shade-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    paint.current = createRigPainter(svg, gradientId);
    // Capture the element: React's development remount clears the ref first.
    return () => { for (const selector of [".rig-links", ".rig-nodes", ".rig-gradients", ".rig-cutouts"]) svg.querySelector(selector)?.replaceChildren(); paint.current = null; };
  }, [gradientId]);
  useLayoutEffect(() => {
    const topologyChanged = previousNetwork.current !== network;
    if (topologyChanged) replayFrom.current = lastFrame.current;
    fromFrame.current = finiteMotion(state) && !topologyChanged && replayFrom.current && ["growing", "delegating", "consolidating"].includes(state) ? replayFrom.current : lastFrame.current;
    previousNetwork.current = network; elapsed.current = 0;
  }, [state, assistants, leads, network, revision]);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    let handle = 0, previous = 0;
    const options: NetworkOptions = { network: network ?? buildNetwork({ ...(assistants !== undefined ? { assistants } : {}), ...(leads !== undefined ? { leads } : {}) }) };
    const draw = () => {
      const target = sampleRig(state, !moving && elapsed.current === 0 && finiteMotion(state) ? motionDefinition(state).duration : elapsed.current, options);
      const transition = ["growing", "delegating", "consolidating"].includes(state) ? 1.8 : .85;
      const frame = fromFrame.current && (moving || elapsed.current > 0) ? blendFrames(fromFrame.current, target, elapsed.current / transition) : target;
      paint.current?.(frame, state); lastFrame.current = frame;
      svg.dataset.time = elapsed.current.toFixed(3);
      svg.dataset.settled = String(finiteMotion(state) && elapsed.current >= motionDefinition(state).duration);
    };
    draw();
    if (!moving) return;
    const tick = (now: number) => {
      if (previous) elapsed.current += Math.min((now - previous) / 1000, .06);
      previous = now; draw(); callback.current?.(state, elapsed.current);
      if (!finiteMotion(state) || elapsed.current < motionDefinition(state).duration) handle = requestAnimationFrame(tick);
      else complete.current?.();
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [state, moving, assistants, leads, network, revision]);
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" className="assistant-mark" data-state={state} data-material={material} data-motion={moving ? "running" : "paused"} viewBox={`0 0 ${rigWidth} 200`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <defs><g className="rig-gradients" /><mask id={`${gradientId}-mask`} maskUnits="userSpaceOnUse" x="-100" y="-100" width="440" height="400"><rect x="-100" y="-100" width="440" height="400" fill="white" stroke="none" /><g className="rig-cutouts" /></mask></defs>
    <circle className="rig-halo" /><g className="rig-links" mask={`url(#${gradientId}-mask)`} strokeLinecap="butt" /><g className="rig-nodes" />
  </svg>;
}
