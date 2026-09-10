import { reasoningControl, reasoningEffortSchema, type ReasoningEffort } from "@orchestrator/contracts";

export function validateReasoning(kind: string, mode: string | undefined, value: unknown): ReasoningEffort {
  const effort = reasoningEffortSchema.parse(value ?? "default");
  if (effort !== "default" && !reasoningControl(kind, mode).available) {
    throw Object.assign(new Error("This assistant's source does not expose a portal reasoning control."), { statusCode: 400 });
  }
  return effort;
}

export function openClawReasoningArgs(value: unknown): string[] {
  const effort = validateReasoning("openclaw-cli", "runtime", value);
  return effort === "default" ? [] : ["--thinking", effort === "none" ? "off" : effort];
}

export function hermesReasoningOptions(value: unknown) {
  const effort = validateReasoning("hermes-api", "runtime", value);
  return effort === "default" ? {} : { model_options: { reasoning_effort: effort } };
}
