import { useCallback, useEffect, useRef, useState } from "react";
import { finiteMotion, motionDefinition, type PresenceState } from "./assistant-rig.js";

export interface SoundNote { at: number; frequency: number; duration: number; gain: number; pan: number; glide: number; }
// A quiet pentatonic voice: short envelopes, a soft fundamental and a faint overtone.
export function soundScore(state: PresenceState): SoundNote[] {
  if (["still", "paused", "offline"].includes(state)) return [];
  const duration = motionDefinition(state).duration;
  const frequencies = state === "error" ? [146.83, 130.81] : state === "success" ? [261.63, 329.63, 392]
    : state === "aware" ? [392, 440] : state === "curious" ? [293.66, 392]
    : state === "consolidating" ? [523.25, 440, 392, 329.63, 261.63]
    : state === "growing" || state === "connecting" ? [261.63, 293.66, 329.63, 392, 440]
    : state === "delegating" ? [261.63, 523.25, 329.63, 659.25]
    : state === "thinking" ? [261.63, 392, 329.63, 440]
    : state === "jitter" ? [220, 233.08, 220]
    : state === "playful" ? [220, 440, 261.63]
    : state === "resting" || state === "drifting" ? [196, 293.66] : [261.63, 329.63, 392];
  const beats: Partial<Record<PresenceState, number[]>> = {
    growing: [.14, .45, .85, 1.25, 1.75], consolidating: [.14, .48, .88, 1.35, 1.8], delegating: [.18, .75, 1.12, 1.65],
    playful: [.64, .9, 1.94], aware: [.94, 2.05], curious: [.96, 2.58], jitter: [.69, .9, 1.08],
  };
  return frequencies.map((frequency, i) => ({
    at: beats[state]?.[i] ?? i * (finiteMotion(state) ? .13 : duration * .68 / frequencies.length), frequency,
    duration: state === "resting" || state === "drifting" ? 1.8 : state === "jitter" ? .12 : .55,
    gain: state === "resting" || state === "drifting" ? .065 : .12,
    pan: frequencies.length === 1 ? 0 : i / (frequencies.length - 1) * 1.2 - .6,
    glide: state === "playful" ? 1.25 : state === "listening" ? .9 : 1,
  }));
}

/** Audio exists only after an explicit sound gesture. Mute stops every voice. */
export class AssistantSound {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private enabled = false;
  private active = false;
  private last = "";
  private previousTime = -1;
  private volume = .25;
  private seekOnResume = false;

  async enable(volume: number) {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
    }
    this.enabled = true; this.setVolume(volume);
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Audio is suspended. Tap Sound on again.");
    this.last = ""; this.previousTime = -1;
  }
  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.min(.6, Math.max(0, value)) : .25;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, .02);
  }
  private stopVoices() {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } voice.disconnect(); }
    this.voices.clear();
  }
  mute() { this.enabled = false; this.setVolume(this.volume); this.stopVoices(); void this.context?.suspend().catch(() => {}); }
  activity(active: boolean) {
    this.active = active;
    if (!active) { this.stopVoices(); this.seekOnResume = true; void this.context?.suspend().catch(() => {}); }
    else if (this.enabled) void this.context?.resume().catch(() => {});
  }
  tick(state: PresenceState, seconds: number) {
    if (!this.enabled || !this.active || this.context?.state !== "running" || !this.master) return;
    const duration = motionDefinition(state).duration;
    if (!duration) return;
    const cycle = finiteMotion(state) ? 0 : Math.floor(seconds / duration);
    const phase = finiteMotion(state) ? seconds : seconds % duration;
    const key = `${state}:${cycle}`;
    if (this.last !== key || phase < this.previousTime) { this.last = key; this.previousTime = -1; }
    // Resume at the current visual phase instead of replaying missed notes together.
    if (this.seekOnResume) { this.previousTime = phase < .08 ? -1 : phase; this.seekOnResume = false; }
    for (const note of soundScore(state)) if (note.at > this.previousTime && note.at <= phase) this.play(note);
    this.previousTime = phase;
  }
  private play(note: SoundNote) {
    const ctx = this.context!, now = ctx.currentTime;
    const envelope = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = note.pan; envelope.connect(pan); pan.connect(this.master!);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(note.gain, now + Math.min(.06, note.duration / 3));
    envelope.gain.exponentialRampToValueAtTime(.0001, now + note.duration);
    let remaining = 2;
    for (const harmonic of [1, 2]) {
      const voice = ctx.createOscillator(), gain = ctx.createGain();
      voice.type = "sine"; voice.frequency.setValueAtTime(note.frequency * harmonic, now);
      voice.frequency.exponentialRampToValueAtTime(note.frequency * harmonic * note.glide, now + note.duration);
      gain.gain.value = harmonic === 1 ? 1 : .12;
      voice.connect(gain); gain.connect(envelope); this.voices.add(voice);
      voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); if (--remaining === 0) { envelope.disconnect(); pan.disconnect(); } };
      voice.start(now); voice.stop(now + note.duration + .03);
    }
  }
  close() { this.enabled = false; this.stopVoices(); void this.context?.close().catch(() => {}); this.context = null; this.master = null; }
}

export function useAssistantSound() {
  const engine = useRef<AssistantSound | null>(null);
  if (!engine.current) engine.current = new AssistantSound();
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolumeState] = useState(() => {
    try { const value = localStorage.getItem("assistant-sound-volume"); return value === null ? .25 : Math.min(.6, Math.max(0, Number(value) || 0)); } catch { return .25; }
  });
  useEffect(() => () => engine.current?.close(), []);
  const toggle = async () => {
    if (enabled) { engine.current!.mute(); setEnabled(false); return; }
    try { await engine.current!.enable(volume); setEnabled(true); setError(""); }
    catch { engine.current!.mute(); setEnabled(false); setError("Sound could not start. Tap to try again."); }
  };
  const setVolume = (value: number) => {
    setVolumeState(value); engine.current!.setVolume(value);
    try { localStorage.setItem("assistant-sound-volume", String(value)); } catch { /* Session settings still work. */ }
  };
  const tick = useCallback((state: PresenceState, seconds: number) => engine.current!.tick(state, seconds), []);
  const activity = useCallback((active: boolean) => engine.current!.activity(active), []);
  return { enabled, error, volume, toggle, setVolume, tick, activity };
}
