import { z } from "zod";

/** A requested effort, not a claim about the source model's actual reasoning. */
export const reasoningEffortSchema = z.enum(["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export const reasoningLabels: Record<ReasoningEffort, string> = {
  default: "Source controlled", none: "None / off", minimal: "Minimal",
  low: "Low · quick tasks", medium: "Medium · everyday work", high: "High · complex work",
  xhigh: "Extra high", max: "Maximum",
};
export interface AssistantReasoningSetting { effort: ReasoningEffort; kind: string; mode?: string }

export function reasoningControl(kind: string, mode?: string): { available: boolean; guidance: string } {
  if (mode === "workspace" || mode === "index") return { available: false, guidance: "This local guide runs without a model, so it has no reasoning level." };
  if (kind === "demo") return { available: false, guidance: "Demo responses are simulated. Connect a runtime to choose a real reasoning level." };
  if (mode === "handoff") return { available: false, guidance: "Set reasoning in the source assistant when you copy this prepared task into it." };
  if (kind === "workspace") return { available: false, guidance: "This local guide runs without a model, so it has no reasoning level." };
  if (["openai-compatible", "hermes-api", "openclaw-cli"].includes(kind)) return { available: true, guidance: kind === "openclaw-cli"
    ? "OpenClaw remembers the last requested level in this assistant’s source session. Source controlled sends no override; use /think default in that native session to reset it."
    : "Applies to this assistant’s next portal requests. Source controlled sends no override and uses the source’s own setting." };
  return { available: false, guidance: kind === "generic-webhook" ? "This webhook has no standard reasoning control. Set the level in the receiving runtime." : "Reasoning is managed in this source. Configure it in the source assistant." };
}
