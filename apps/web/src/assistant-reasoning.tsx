import { useEffect, useId, useRef, useState } from "react";
import { reasoningControl, reasoningEffortSchema, reasoningLabels, type AssistantReasoningSetting, type ReasoningEffort } from "@orchestrator/contracts";
import { api } from "./lib.js";

export function ReasoningField({ kind, mode, value, disabled, onChange }: { kind: string; mode?: string; value: ReasoningEffort; disabled?: boolean; onChange(value: ReasoningEffort): void }) {
  const descriptionId = useId();
  const control = reasoningControl(kind, mode);
  return <div className="reasoning-field">{control.available ? <>
    <label>Reasoning level<select aria-label="Reasoning level" aria-describedby={descriptionId} value={value} disabled={disabled} onChange={(event) => onChange(reasoningEffortSchema.parse(event.target.value))}>{reasoningEffortSchema.options.map((effort) => <option key={effort} value={effort}>{reasoningLabels[effort]}</option>)}</select></label>
    <details className="reasoning-help"><summary>Model support and behavior</summary><p id={descriptionId}>Higher effort can take longer. Choose a level your source model supports; some models reject or ignore unsupported settings.</p><p>{control.guidance}</p><p>Saving changes only this assistant’s preference. It does not send a request or change its model, permissions, or native schedules.</p>{kind === "openai-compatible" && <p>An explicit level uses the source’s completion token budget, including reasoning. A long reasoning step may leave too little room for an answer.</p>}</details>
  </> : <p className="form-note"><strong>Reasoning level</strong> · {control.guidance}</p>}</div>;
}

/** Saves independently of mandate edits and never sends a source request. */
export function AssistantReasoning({ assistantId, disabled = false, onBusyChange }: { assistantId: string; disabled?: boolean; onBusyChange?(busy: boolean): void }) {
  const [setting, setSetting] = useState<AssistantReasoningSetting>();
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const saving = useRef(false);
  const currentId = useRef(assistantId); currentId.current = assistantId;
  const path = `/api/assistants/${encodeURIComponent(assistantId)}/reasoning`;
  useEffect(() => {
    let active = true;
    setSetting(undefined); setBusy(true); setFailure(""); setStatus(""); onBusyChange?.(true);
    api<AssistantReasoningSetting>(path).then((value) => {
      if (active) { setSetting(value); setBusy(false); onBusyChange?.(false); }
    }).catch((error) => { if (active) { setBusy(false); setFailure(error instanceof Error ? error.message : "Could not load reasoning preferences."); } });
    return () => { active = false; };
  }, [path, reload, onBusyChange]);
  async function save(effort: ReasoningEffort) {
    if (saving.current || busy || disabled || !setting) return;
    saving.current = true; setBusy(true); onBusyChange?.(true); setFailure(""); setStatus("");
    let confirmed = true;
    try {
      const result = await api<AssistantReasoningSetting>(path, { method: "PUT", body: JSON.stringify({ effort }) });
      if (currentId.current === assistantId) { setSetting(result); setStatus("Reasoning preference saved."); }
    } catch (error) {
      if (currentId.current === assistantId) setFailure(error instanceof Error ? error.message : "Could not save reasoning preferences.");
      // A lost response can hide a successful write. Reconcile before allowing a turn.
      try {
        const actual = await api<AssistantReasoningSetting>(path);
        if (currentId.current === assistantId) setSetting(actual);
      } catch { confirmed = false; if (currentId.current === assistantId) { setSetting(undefined); setFailure("Could not confirm the saved reasoning level. Reload settings before sending."); } }
    }
    finally { saving.current = false; if (currentId.current === assistantId) { setBusy(false); onBusyChange?.(!confirmed); } }
  }
  return <div className="assistant-reasoning">{setting ? <ReasoningField kind={setting.kind} {...(setting.mode ? { mode: setting.mode } : {})} value={setting.effort} disabled={disabled || busy} onChange={(effort) => void save(effort)} /> : busy && <p role="status">Loading reasoning preference…</p>}{failure && <p role="alert">{failure}{!setting && <button type="button" className="text-button" onClick={() => setReload((value) => value + 1)}>Retry reasoning settings</button>}</p>}<span className="form-note" role="status">{setting && busy ? "Saving reasoning preference…" : status}</span></div>;
}
