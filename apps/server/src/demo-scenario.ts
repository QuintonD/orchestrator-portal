import type { AssistantProfile, DecisionPacket, ReportPresentation } from "@orchestrator/contracts";

export const launchDecision: DecisionPacket = {
  id: "launch-positioning", attentionId: "attn-1", projectId: "launch", version: 1,
  title: "Choose the Studio launch positioning", state: "open", simulation: true,
  recommendation: "outcome", rationale: "The sample audience brief prioritizes fewer interruptions and visible results. Lead with that outcome; explain the technology underneath.",
  options: [
    { id: "outcome", title: "Your work moves. Your attention stays yours.", detail: "An assistant team that prepares the work and brings you only the decisions that matter.", tradeoff: "Clear user benefit; needs a concrete example to avoid sounding generic." },
    { id: "technology", title: "One workspace for your autonomous agents.", detail: "Connect your runtimes, coordinate their work, and inspect every outcome.", tradeoff: "Precise for technical operators; less distinctive and less clear about the personal benefit." },
  ],
  evidence: [{ label: "Launch audience brief", documentId: "demo-launch-brief" }, { label: "Copy review", documentId: "demo-copy-review" }],
  selectedOption: null, decidedAt: null,
};

// Deterministic simulation, deliberately separate from live runtime behavior.
export function demoAssessment(profile: AssistantProfile, prompt: string, packet: DecisionPacket): ReportPresentation {
  const evidence = packet.evidence;
  const role = profile.templateId ?? ({ atlas: "coordinator", sage: "reviewer", relay: "follow-up" } as Record<string, string>)[profile.id] ?? "coordinator";
  const decided = packet.state === "decided";
  const chosen = packet.options.find((o) => o.id === packet.selectedOption)?.title;
  const limits = "Simulation using the two sample documents. No audience testing, live source checks, publication, or external follow-up has occurred.";
  if (prompt.startsWith("Council synthesis")) return {
    summary: "Atlas favors a clear benefit; Sage requires evidence before claiming it works; Relay identifies the next owner and checkpoint.",
    recommendation: decided ? `Use the recorded direction “${chosen}” for the draft review.` : "Choose the outcome-led direction for a draft, then test comprehension before publishing.",
    sections: [{ title: "Agreement", body: "The audience needs a concrete example of work completed and an inspectable result." }, { title: "Disagreement", body: "Atlas prioritizes speed to a draft. Sage would delay any performance claim until an audience check. Keep that uncertainty visible." }, { title: "Next checkpoint", body: "Relay proposes: draft → evidence check → owner review. Publication remains a separate source action." }, { title: "Question considered", body: prompt.split("Question: ")[1]?.split("\n")[0] ?? "Launch decision" }], evidence, limits,
  };
  const revision = prompt.includes("Operator correction:\n") ? prompt.split("Operator correction:\n").at(-1)!.slice(0, 4000) : "";
  const focused = /evidence|test|verify|proof/i.test(revision);
  const base: ReportPresentation = role === "reviewer" ? {
    summary: "The copy fits the sample audience brief. Its effectiveness is still untested.",
    recommendation: "Use the outcome-led copy as a hypothesis. Run a five-second comprehension check before treating it as validated.",
    sections: [{ title: "Supported", body: "The audience brief names interruption reduction and inspectable results as priorities." }, { title: "Not established", body: "There are no conversion results or comprehension interviews in the sample. Project progress is not evidence of launch readiness." }, { title: "What would change this", body: "If operators cannot explain the product after reading the headline, switch to a more explicit technical description." }], evidence, limits,
  } : role === "follow-up" ? {
    summary: decided ? "The direction is recorded. The draft and evidence check are the remaining handoffs." : "One choice blocks the draft review. Ownership and the next checkpoint need to be explicit.",
    recommendation: decided ? "Prepare a copy draft using the recorded direction, then ask the owner to review it in the source workspace." : "Record the positioning choice, then assign the draft and evidence check in the source workspace.",
    sections: [{ title: "Prepared sequence", body: "Positioning decision → copy draft → comprehension check → owner review. Each step has one deliverable." }, { title: "Missing commitment", body: "No source owner or publishing commitment is recorded. This report has not assigned work or sent a reminder." }], evidence, limits,
  } : {
    summary: decided ? `Direction recorded: ${chosen}` : "Studio launch is waiting on one positioning choice. Both options are ready to compare.",
    recommendation: decided ? "Move to draft review; retain the audience check before publication." : "Choose the outcome-led direction. It matches the audience's stated need for less supervision.",
    sections: [{ title: "Prepared for you", body: "Two complete headline and supporting-copy options, a tradeoff for each, and Sage's evidence review." }, { title: "Next step", body: decided ? "The local demo work item now reflects the choice. No copy has been published." : "Review the two options in Attention. Recording a choice updates the linked demo project and outcome history." }], evidence, limits,
  };
  if (revision) return { ...base, summary: focused ? "Evidence review first: audience fit is supported; effectiveness remains untested." : "Revised plan with your requested constraint recorded.", recommendation: focused ? "Hold publication until the comprehension check has evidence. Use the copy only as a draft hypothesis." : "Apply the requested constraint in the next draft review; check it against the source brief before publication.", sections: [...base.sections, { title: "Requested change", body: revision }], changes: [focused ? "Added an evidence checkpoint before publication." : "Added your constraint to the draft review.", "Kept the original report and the unverified effectiveness claim separate."] };
  if (!prompt.startsWith("Portal briefing") && !prompt.startsWith("Council")) base.sections.push({ title: "Your question", body: prompt.slice(0, 2000) });
  return base;
}

export function presentationText(value: ReportPresentation) {
  return [value.summary, `Recommendation\n${value.recommendation}`, ...value.sections.map((s) => `${s.title}\n${s.body}`), `Limits\n${value.limits}`].join("\n\n");
}
