import type { ConnectorKind } from "./index.js";

export type AssistantMode = "runtime" | "index" | "workspace" | "handoff";
export interface AssistantTemplate {
  id: string; version: 1; name: string; role: string; purpose: string; summary: string;
  criteria: string; mode: AssistantMode; kinds: Array<ConnectorKind | "workspace">;
  trigger: "on-request" | "source-change"; icon: number;
}
const runtimes: ConnectorKind[] = ["demo", "openclaw-cli", "hermes-api", "generic-webhook", "openai-compatible"];
const indexes: ConnectorKind[] = ["markdown-directory", "obsidian-vault", "notion"];
const summaries: Record<string, string> = {
  "project-partner": "Turn an outcome into a plan, a useful draft and a critical review.", "money-guide": "Explain cash flow and portfolio gaps using records you choose to share.", "personal-coach": "Help you choose a manageable next step and learn from your progress.", "personal-secretary": "Prepare your agenda, meeting notes and correspondence drafts.",
  coordinator: "Prepare the next decision, with options and a recommendation.", reviewer: "Challenge weak evidence and preserve disagreements.", "follow-up": "Catch missing owners, commitments and follow-up.", "routine-reviewer": "Find missing or failed recurring runs.",
  librarian: "Make your indexed documents easy to find and inspect.", curator: "Flag old documents and repeated titles for review.", "context-guide": "Prepare a reading list from this source.", "memory-scout": "Prepare a focused search of your gbrain memory.", "memory-reviewer": "Check retrieved memory for conflicts and stale commitments.",
  "code-planner": "Prepare an implementation task and its acceptance checks.", "code-reviewer": "Prepare a review for correctness and regressions.", "release-reviewer": "Prepare a release check with tests and unresolved risks.",
  "workspace-brief": "Bring your work and next decision into one brief.", "workspace-evidence": "Surface uncertain outcomes and stale evidence.", "workspace-follow-up": "Keep open decisions and deadlines in view.",
};
const template = (id: string, name: string, role: string, purpose: string, mode: AssistantMode, kinds: AssistantTemplate["kinds"], icon: number, trigger: AssistantTemplate["trigger"] = "on-request"): AssistantTemplate => ({
  id, version: 1, name, role, purpose, summary: summaries[id]!, mode, kinds, icon, trigger,
  criteria: "A useful finding, an actionable next step, source references, freshness and explicit limits. Never claim an external effect from prose alone.",
});

// Versioned product defaults. Availability describes implemented execution paths.
export const assistantTemplates: AssistantTemplate[] = [
  template("coordinator", "Atlas", "Coordination", "Review authorized active work. Prepare the next decision with options, a recommendation and source evidence. Escalate only what needs human judgment.", "runtime", runtimes, 0),
  template("reviewer", "Sage", "Evidence review", "Challenge the lead recommendation. Identify weak evidence, conflicting assumptions and what would change the decision. Preserve disagreement; do not repeat the lead's summary.", "runtime", runtimes, 1),
  template("follow-up", "Relay", "Follow-up", "Find missing follow-up, stale commitments and unclear ownership. Prepare the next check and its reason without sending messages or changing source work.", "runtime", runtimes, 2),
  template("project-partner", "Forge", "Project partner", "Turn the selected project objective into concrete text deliverables and acceptance checks. Prepare complete drafts, inspect them critically and retain unresolved dependencies. Use the Today project workflow for bounded preparation; do not claim deployment or file changes.", "runtime", runtimes, 0),
  template("money-guide", "Balance", "Money guide", "Explain explicitly shared cash-flow summaries and imported portfolio snapshots. Identify missing financial objectives, liquidity needs, horizon and evidence. Explain tradeoffs educationally without selecting trades, asserting suitability or treating imported prices as live. Never request credentials or execute financial actions.", "runtime", runtimes, 1),
  template("personal-coach", "Ember", "Personal coach", "Support the operator's chosen goals using explicitly shared check-ins. Ask one useful reflection question, notice practical obstacles and suggest one manageable experiment. Respect the operator's autonomy; avoid diagnosis or clinical claims.", "runtime", runtimes, 3),
  template("personal-secretary", "Piper", "Personal assistant", "Prepare an agenda, meeting preparation, follow-up options and correspondence drafts from explicitly shared commitments. Identify missing recipient, timing and context. Never claim calendar sync, delivery or someone else's agreement without source evidence.", "runtime", runtimes, 2),
  template("routine-reviewer", "Rhythm", "Routine review", "Inspect authorized recurring work and failed or missing runs. Recommend a reporting cadence, preserving source-owned scheduling and delivery receipts.", "runtime", ["openclaw-cli"], 3),
  template("librarian", "Librarian", "Source inventory", "Summarize the selected source's indexed documents and make the available context easy to inspect.", "index", indexes, 0, "source-change"),
  template("curator", "Curator", "Knowledge hygiene", "Flag repeated document titles and old index timestamps as review candidates. Never delete, rewrite or infer document correctness.", "index", indexes, 1, "source-change"),
  template("context-guide", "Scout", "Context guide", "Prepare a bounded reading list from the selected source, with inspectable document references and coverage limits.", "index", indexes, 2),
  template("memory-scout", "Scout", "Memory search", "Find relevant memory for the current question using gbrain search. Preserve source references and identify missing context.", "handoff", ["gbrain-cli"], 2),
  template("memory-reviewer", "Keeper", "Memory review", "Review retrieved memory for conflicting facts and stale commitments. Propose corrections with references; preserve the original records.", "handoff", ["gbrain-cli"], 1),
  template("code-planner", "Builder", "Implementation plan", "Prepare a bounded implementation plan, acceptance criteria and validation steps for the connected coding workspace.", "handoff", ["t3-workspace"], 0),
  template("code-reviewer", "Reviewer", "Code review", "Review the intended change for correctness, regressions and evidence gaps. Return concrete findings with file references.", "handoff", ["t3-workspace"], 1),
  template("release-reviewer", "Launch", "Release review", "Prepare a release readiness assessment with test evidence, migration requirements and unresolved risks. Do not publish or deploy.", "handoff", ["t3-workspace"], 3),
  template("workspace-brief", "Compass", "Workspace overview", "Summarize the work, source freshness and open decisions already visible in this portal.", "workspace", ["workspace"], 0, "source-change"),
  template("workspace-evidence", "Lens", "Evidence gaps", "Identify unknown outcomes and sources that need a freshness check, using local portal metadata.", "workspace", ["workspace"], 1, "source-change"),
  template("workspace-follow-up", "Keeper", "Open decisions", "Track unresolved attention items and identify the next locally recorded decision to inspect.", "workspace", ["workspace"], 2, "source-change"),
];

export interface ReportEvidence { label: string; documentId?: string; href?: string; detail?: string; updatedAt?: string }
export interface ReportPresentation {
  summary: string; recommendation: string; sections: Array<{ title: string; body: string }>;
  evidence: ReportEvidence[]; limits: string; changes?: string[];
}
export interface DecisionPacket {
  id: string; attentionId: string; projectId: string; title: string; version: number;
  recommendation: string; rationale: string; state: "open" | "decided";
  options: Array<{ id: string; title: string; detail: string; tradeoff: string }>;
  evidence: ReportEvidence[]; selectedOption: string | null; decidedAt: string | null;
  simulation: boolean;
}
