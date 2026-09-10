// Reviewed product guidance, not an automatic router or a provider capability claim.
export const modelGuidanceVersion = "2026-09-10.1";
export type ModelClass = "local" | "routine" | "balanced" | "deep";
export interface ModelClassGuide {
  label: string; use: string; recommendation: string; escalation: string;
}
export const modelClasses: Record<ModelClass, ModelClassGuide> = {
  local: {
    label: "No model", use: "Fixed inventories and checks of local portal records.",
    recommendation: "Runs locally without inference.",
    escalation: "Use an assistant only when interpretation is needed; share selected evidence explicitly.",
  },
  routine: {
    label: "Routine", use: "Bounded extraction, follow-up lists and straightforward drafts from clear inputs.",
    recommendation: "Start with GPT-5.6 Luna at medium effort.",
    escalation: "Move to Balanced for conflicting sources, unclear intent or a failed acceptance check.",
  },
  balanced: {
    label: "Balanced", use: "Planning, synthesis and writing that need judgment across several inputs.",
    recommendation: "Try GPT-6 Astra at low effort; GPT-5.6 Sol at high effort is an alternative for writing or subscription allowance.",
    escalation: "Move to Deep for difficult code, material numerical uncertainty or unresolved disagreement.",
  },
  deep: {
    label: "Deep", use: "Critical review, complex analysis, security and decisions with costly errors.",
    recommendation: "Start with GPT-6 Astra at high effort. Consider xhigh or max for unresolved hard cases in the source runtime.",
    escalation: "Seek independent evidence or human review when checks fail. More reasoning does not grant authority or prove correctness.",
  },
};

export const modelEvidence = {
  version: modelGuidanceVersion,
  reviewedAt: "2026-09-10",
  index: "Artificial Analysis Intelligence Index v4.3",
  methodologyUrl: "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
  updateUrl: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3",
  interpretation: "Classes describe task needs, not benchmark score bands. Scores are model-and-effort snapshots, not portal quality tests or account entitlements. Recheck after methodology or model changes.",
  models: [
    { model: "GPT-5.6 Luna", effort: "medium", score: 26, estimated: true, url: "https://artificialanalysis.ai/models/gpt-5-6-luna-medium" },
    { model: "GPT-5.6 Luna", effort: "max", score: 38, estimated: false, url: "https://artificialanalysis.ai/models/gpt-5-6-luna" },
    { model: "GPT-5.6 Sol", effort: "high", score: 42, estimated: false, url: "https://artificialanalysis.ai/models/gpt-5-6-sol-high" },
    { model: "GPT-5.6 Sol", effort: "max", score: 47, estimated: false, url: "https://artificialanalysis.ai/models/gpt-5-6-sol" },
    { model: "GPT-6 Astra", effort: "low", score: 46, estimated: false, url: "https://artificialanalysis.ai/models/gpt-6-astra-low" },
    { model: "GPT-6 Astra", effort: "high", score: 51, estimated: false, url: "https://artificialanalysis.ai/models/gpt-6-astra-high" },
    { model: "GPT-6 Astra", effort: "max", score: 53, estimated: false, url: "https://artificialanalysis.ai/models/gpt-6-astra" },
  ],
};
