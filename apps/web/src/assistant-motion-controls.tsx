import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { MotionPolicy } from "./assistant-rig.js";
import type { useAssistantSound } from "./assistant-sound.js";

export function useMotionPreference(key = "assistant-motion-policy") {
  const [policy, setPolicy] = useState<MotionPolicy>(() => {
    try { const value = localStorage.getItem(key); return value === "full" || value === "still" ? value : "system"; } catch { return "system"; }
  });
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return { policy, reduced, setPolicy: (value: MotionPolicy) => { setPolicy(value); try { localStorage.setItem(key, value); } catch { /* Keep the local control usable. */ } } };
}

export function AssistantSoundControls({ sound, compact = false }: { sound: ReturnType<typeof useAssistantSound>; compact?: boolean }) {
  return <div className="assistant-sound-controls" data-sound={sound.enabled ? "on" : "off"}>
    <button type="button" className="button button--secondary" aria-pressed={sound.enabled} onClick={() => void sound.toggle()}>{sound.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{sound.enabled ? "Sound on" : "Sound off"}</button>
    {!compact && <label>Volume<input type="range" aria-label="Sound volume" min="0" max="60" step="1" value={Math.round(sound.volume * 100)} onChange={e => sound.setVolume(Number(e.target.value) / 100)} /><span>{Math.round(sound.volume * 100)}%</span></label>}
    {sound.error && <span role="status">{sound.error}</span>}
  </div>;
}
