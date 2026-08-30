# Human factors and oversight

## Governing philosophy

Treat autonomy as **bounded delegation**, not disappearance of the human.

The assistant should own routine execution inside explicit constraints. The person should spend
attention on goals, policies, consequential ambiguity, exceptions, sampled evidence, and recovery.
The design objective is not the fewest human interactions at any cost. It is the least **low-value
attention** that preserves appropriate reliance, situation awareness, authority, and recoverability.

A practical test for every “human oversight” claim is:

> Does the person have enough context, time, authority, and recovery capability to make the decision
> real?

If any one is missing, the interface is likely performing approval theater.

## Evidence-backed principles

### Mixed initiative, not passive automation

[Horvitz's mixed-initiative principles](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf)
remain a strong foundation: automation should account for uncertainty in user goals, the value of
action, the cost of interruption, and the user's attention. It should ask only when missing
information is decision-relevant and should always preserve direct invocation and termination.

Product consequences:

- the assistant may suggest, execute, defer, or ask, but should expose why it chose that mode;
- clarifications are routed by expected decision value, not by every missing detail;
- pause, stop, cancel, retask, and takeover are permanent top-level affordances;
- learned timing preferences must not silently broaden permissions or risk tolerance.

### Automate by task stage and consequence

[Parasuraman, Sheridan, and Wickens](https://doi.org/10.1109/3468.844354) separate automation into
information acquisition, analysis, decision/action selection, and action implementation. Each can
have a different automation level. A single “autonomy” slider is therefore the wrong abstraction.

| Situation | Default interaction |
|---|---|
| Low impact, reversible, understood | Execute; include in digest; provide undo |
| Moderate impact or uncertainty | Execute with notification, bounded review, and rollback |
| High impact, externally visible, or ambiguous | Human selects or approves before the side effect |
| Irreversible or catastrophic potential | No unilateral action; explicit human or dual review |

A task may autonomously gather and analyze information, ask the user to choose a strategy, and then
require approval before sending a message or changing an external system. The policy belongs to the
stage and effect, not the conversation.

Higher automation can reduce routine workload while weakening situation awareness and failure
performance; that tradeoff appears in the [Wickens et al. meta-analysis](https://journals.sagepub.com/doi/10.1177/154193121005400425)
and the long tradition of out-of-the-loop research.

### Name the human role

“Human in the loop” hides different architectures. The [“Preposition Salad” paper](https://ojs.aaai.org/index.php/AAAI-SS/article/view/35571)
argues for greater precision. The portal should show the role and actual authority at each point:

- **Selector:** choose among plans or options.
- **Approver:** authorize one bounded action.
- **Supervisor:** monitor and intervene on conditions.
- **On-loop operator:** pause, veto, retask, or take over during execution.
- **Over-loop governor:** set policies, permissions, budgets, and feedback rather than inspect every
  action.
- **Collaborator:** contribute information or split work with the assistant.

Badges matter only if the corresponding control exists. Labeling someone “supervisor” while the
runtime cannot be interrupted is misleading.

### Optimize for calibrated reliance

[Lee and See](https://doi.org/10.1518/hfes.46.1.50_30392) frame trust as a basis for reliance under
uncertainty. The design target is appropriate reliance—not maximum trust, adoption, or approval.
Explanations can restore trust even when that trust is unwarranted, so explanation satisfaction is
not a sufficient measure.

Measure:

- probability the assistant was correct when followed;
- probability it was wrong when rejected;
- false acceptance and false rejection;
- confidence calibration error;
- quality and timing of overrides;
- rollback or correction after approval;
- actual reliance separately from self-reported trust.

One compact measure is:

```text
appropriate reliance =
  (correct follow decisions + correct reject decisions) / all decision opportunities
```

Approval rate alone rewards fatigue and over-trust.

### Exception management must maintain awareness

Exception-oriented supervision reduces routine work but can leave a person with rare, abnormal,
time-critical failures after their mental model has decayed. This is the central warning in
[Bainbridge's “Ironies of Automation”](https://doi.org/10.1016/0005-1098(83)90046-8),
[Endsley and Kiris](https://doi.org/10.1518/001872095779064555), and automation complacency
research.

An exception-first portal therefore also needs:

- periodic health summaries showing what was checked and what was not;
- freshness and coverage indicators;
- risk-weighted or random audit samples of routine work;
- trend and drift views;
- the current goal, plan, constraints, and state on every exception;
- one-action pause, takeover, or rollback;
- occasional recovery rehearsal for high-consequence workflows.

“Nothing is wrong” must never mean merely “nothing emitted an exception.”

### Calm technology for peripheral state

[Weiser and Brown's calm-technology principle](https://calmtech.com/papers/designing-calm-technology)
is to move information between the periphery and center. The portal should use:

- **periphery:** stable connection/health strip, subtle progress, policy state, freshness, anomaly
  pulse;
- **center:** decisions, exceptions, deadlines, conflicts, and requested input;
- **deep inspection:** evidence, action plans, provenance, and replay.

Calm is not silence. High-impact events should interrupt. Routine subagent and tool chatter should
be summarized or batched.

### Treat attention as a budget

[Attention-sensitive alerting](https://erichorvitz.com/attend.htm) frames interruption as expected
utility: value of timely information minus cost of attention. Controlled interruption studies also
show the importance of timing and negotiation:
[Adamczyk and Bailey](https://interruptions.net/literature/Adamczyk-CHI04-p271-adamczyk.pdf) and
[McFarlane](https://www.interruptions.net/literature/McFarlane-HCI02_2.pdf).

The routing model should combine urgency, impact, uncertainty, reversibility, and the user's current
attention state. Provide quiet hours, focus modes, snooze, digest, “ask after this task,” and root-
cause batching. Never send repeated notifications for the same unresolved condition.

Useful attention measures:

- interruptions per hour and per completed objective;
- high-load interruption rate;
- deferral and snooze rate;
- resumption lag and goal-recall errors;
- missed-critical-event rate;
- annoyance and mental effort.

### Approval fatigue is alert fatigue

Repeated reminders reduce acceptance and decision quality; clinical alert-fatigue research such as
[Ancker et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC5387195/) is a useful analogue.

Design consequences:

- pre-authorize well-bounded, low-risk actions;
- bundle related changes into one inspectable decision;
- show affected systems, side effects, policy match, and rollback;
- ask for justification only for unusual or high-impact deviations;
- do not offer ambiguous “approve all” actions;
- sample routine approvals later to maintain calibration;
- measure cumulative review load against later override and rollback quality.

An approval is a security object and an attention object at the same time.

### Progressive disclosure over explanation dumps

[Springer and Whittaker](https://arxiv.org/abs/1811.02164) found that users often expected more
transparency to help, then preferred simpler feedback after experience. Too much incremental detail
can distract and destroy useful heuristics.

Use a consistent three-layer model:

1. **Glance:** what happened, why the user is needed, consequence, freshness, next action.
2. **Inspect:** plan, assumptions, evidence, alternatives, policy checks, uncertainty, contradictions.
3. **Audit:** immutable event sequence, source times, tool actions/results, runtime/model/version,
   human decisions, external effects, checkpoints, and recovery.

Do not expose raw chain-of-thought. Expose observable action, evidence, results, and a compact
rationale that can be checked.

### Provenance is a product object

[NIST AI RMF](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) expects explicit roles,
oversight, measurement, production monitoring, and documented limits. For each consequential claim
or action, retain:

- source and relevant reference;
- retrieval time and freshness;
- source quality and independence;
- transformations and summarization steps;
- agent/runtime, model/version, and tools;
- uncertainty and contradictory evidence;
- policy/risk checks;
- final human decision and external receipt.

Provenance supports debugging, accountability, correction, and deletion. It is not merely a citation
drawer.

### Recovery is part of interaction design

[ISO 9241-110](https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso%3A9241%3A-110%3Adis%3Aed-2%3Av1%3Aen)
includes controllability and error robustness. Every long-running workflow should make the following
capabilities explicit when the source runtime supports them:

- checkpoint before side effects;
- idempotent retry;
- partial progress and resumability;
- safe-state fallback;
- compensating action or rollback;
- permission boundary;
- compact handoff packet: goal, current state, evidence, attempts, unresolved uncertainty, next
  options;
- incident severity, affected systems, and recovery status.

“Replay” should reconstruct the record. A new side-effecting execution is a fork/rerun and must
re-enter policy gates.

## Information architecture

```text
Global shell
  ├─ Attention / Needs you
  ├─ Active work
  ├─ Outcomes
  ├─ Today / Digest
  ├─ Brain / Memory
  ├─ Audit / Replay
  └─ Settings / Policies / Connections
```

### Attention inbox

Canonical item types:

- approval required;
- clarification required;
- failed, timed-out, lost, or delivery-blocked run;
- stale or drifting work;
- outcome requiring acceptance;
- memory or policy proposal;
- authentication, permission, or connection issue.

Deterministic priority:

1. safety, financial, destructive, or externally irreversible action;
2. deadline-critical blockers and questions;
3. stale, lost, or drifting work;
4. outcome review and memory/policy proposals.

Within a tier, sort by deadline, blocking duration, risk, then most recent meaningful change. “Read”
is not “resolved.” Resolve only through a decision, explicit dismissal reason, policy change, or
source-native completion.

An approval card should show:

```text
[External / high impact]  Publish the weekly report
Assistant · Work item · Needs approval

Proposed: send report.pdf to 14 recipients
Why now: generation and checks completed; send is the next step
Impact: external communication; not retractable
Evidence: artifact preview · recipient diff · 3 checks passed
Policy: external sends require explicit approval · expires in 12m

[Approve once] [Inspect] [Reject] [Snooze] […]
```

Bulk actions are allowed only for identical, machine-verifiable policy scopes.

### Active work

Show a list by default; optionally group as queued, running, waiting, blocked, and paused.

```text
Research travel options
Running · phase 4 of 8 · 12m elapsed · last event 22s ago
Assistant: Scout · 2 child runs · inside policy
Next: compare cancellation policies
[Inspect] [Steer] [Pause] [Stop]
```

Show percentages only for real bounded work reported by the runtime. Otherwise show elapsed time,
phase/milestone, and freshness without fabricated precision.

Run detail projections:

- Summary: current interpretation, next step, blockers, verification.
- Plan: editable phases, dependencies, decisions.
- Activity: semantic events with expandable raw source details.
- Artifacts: previews, versions, diffs, external effects.
- Child work: compact parent/child lineage.
- Audit: immutable events, commands, receipts, policies, and gaps.

### Outcomes and artifacts

The last assistant message is not the outcome. Keep artifacts and effects separate:

```text
Weekly report generated
Completed 09:42 · source run R-184
3 artifacts · 7 checks passed · 1 warning
[Preview] [Accept] [Revise] [Export] [Open audit]
```

Acceptance may close a work item or release a guarded next step. Downloading or viewing does not
implicitly mean acceptance.

### Brain and memory

Use a reviewable ledger rather than an opaque “brain.” Each durable memory includes statement,
scope, source/time, confidence, status (proposed/accepted/rejected/superseded), and the behavior it
will change. Never silently promote an inference to a durable fact or permission.

### Universal composer

The composer is available from every surface and supports:

- ask;
- start work;
- steer active work;
- answer/approve/deny;
- search/retrieve;
- capture a commitment, note, or correction.

Selected context, destination work item, attachments, and requested execution mode should be
explicit. Drafts persist locally across navigation and offline periods.

### Phone role

Phone is for glance, answers, and bounded intervention—not full forensic audit. Use four destinations:
Attention, Active, Outcomes, More. Push notifications deep-link to the canonical attention item and
show at most two or three actions. Sensitive lock-screen content is hidden by default. An expired
approval opens as “no longer current” rather than executing.

## Truthful connection states

Runtime state and client connection state are different:

- `Running · last source event 14s ago`
- `Running · portal connected; source stream delayed`
- `Possibly stale · last source event 8m ago`
- `Unknown/lost · no authoritative source update after grace period`
- `Cached view · last sync 09:42 · 2 commands queued locally`

Offline approval and stop commands must never appear executed before a source acknowledgement.
Optimistic UI is appropriate for navigation and local drafts, not for authority or side effects.

## Accessibility baseline

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/):

- all actions keyboard-operable and no drag-only interaction;
- visible, unobscured focus and predictable restoration after dialogs;
- semantic landmarks, headings, lists/grids, and named controls;
- polite live regions for meaningful status transitions, not every token or timer tick;
- state communicated through text/icon as well as color;
- at least the WCAG 24×24 target minimum and preferably 44×44 phone actions;
- high zoom/narrow reflow, reduced motion, high contrast, light/dark themes;
- touch alternatives for hover and drag;
- screen-reader labels containing entity, state, freshness, and primary action.

## Empirical anchors for this product

### Human oversight in practice

[Interviews with 17 experienced developers](https://arxiv.org/abs/2606.05391) identified four kinds
of emergent oversight work: a priori control, co-planning, real-time monitoring, and post-hoc review.
The portal must support all four rather than treating approval as the only human role.

### Autonomy behavior in the wild

[Anthropic's 2026 autonomy analysis](https://www.anthropic.com/research/measuring-agent-autonomy)
found long sessions getting longer, experienced users using auto-approval more, and those same users
interrupting more often. This supports a shift from action-by-action approval toward strong
intervention, monitoring, and post-deployment infrastructure.

### Purpose-built interfaces can reduce oversight cost

[AgentGUI](https://arxiv.org/abs/2607.26300) reports users answered trajectory questions 38% faster
than with a baseline dashboard, with lower mental demand, frustration, and effort. The study is small
and should not be generalized too far, but it validates the value of structured run breakdowns over
raw traces.

### Always-on multi-agent work overwhelms review

A six-week reflective deployment of more than 200 multi-agent research proposals/experiments
reported 24/7 information overload, parallelism amplifying oversight, the need to distinguish
infrastructure health from agent behavior, and the importance of post-completion artifact review:
[HEAL@CHI 2026 paper](https://heal-workshop.github.io/chi2026_papers/Managing%20Multi-Agent%20Research%20Systems%20A%20Dashboard%20for%20Human%20Oversight%20of%20Coordin.pdf).

## STORM and Co-STORM: what actually transfers

[STORM](https://aclanthology.org/2024.naacl-long.347/) is from Stanford's OVAL lab, not Harvard.
It generates Wikipedia-like research articles using perspective discovery, retrieval-grounded
simulated conversations, outline construction/refinement, and section synthesis. Role-conditioned
agents often share the same underlying model, so multiplying perspectives is not the same as gaining
independent expertise.

[Co-STORM](https://aclanthology.org/2024.emnlp-main.554/) is more relevant here. It adds multiple
expert roles, a moderator that asks gap-finding questions based on unused retrieved material, a
dynamic hierarchical mind map, and a human who may observe or intervene. Its ablations suggest that
the moderator/gap-finding function can matter more than merely increasing agent count.

The adapted research loop for this project is:

```text
scope and taxonomy
  → perspective discovery
  → parallel grounded investigations
  → moderator gap and contradiction questions
  → claim/evidence graph
  → source independence and provenance audit
  → synthesis
  → human release decision
```

Required additions beyond STORM:

- real source/model/retrieval diversity where independence matters;
- contradiction and negative-evidence search;
- explicit stakeholder and risk registers;
- source-quality, freshness, and independence scoring;
- human control over perspective weights and stopping;
- preservation of evidence and synthesis decisions for replay.

Many agents with different role prompts can still share the same retrieval gaps and model bias.

## Anti-patterns

- generic HITL checkbox with no role, authority, or recovery;
- opaque one-click approvals and broad “approve all” controls;
- one notification per agent, tool, or subtask;
- one global autonomy slider;
- confidence without calibration history;
- full explanation dumps or raw chain-of-thought;
- “healthy” meaning no exception was emitted;
- quiet UI that conceals stale state or missing telemetry;
- asking a disengaged person to handle rare emergencies without a compact context handoff;
- treating role-prompt diversity as source independence;
- merging parallel work without deduplication, contradiction detection, or provenance;
- silent modification of policy, permission, memory, threshold, or autonomy;
- optimizing task speed, engagement, tokens, or approvals while ignoring outcome quality and recovery.

## Evaluation program

Test:

1. Risk/reversibility routing versus approving every action.
2. Root-cause decision bundles versus prompts per tool/agent.
3. Negotiated, event-aware notifications versus immediate alerts.
4. Glance → inspect → audit versus always-show-all and chat-only.
5. Periodic health summaries and risk-weighted samples versus exception-only supervision.
6. Moderator/gap-finder agent versus more worker agents.
7. Explicit role/authority labels versus generic HITL language.

Instrumentation groups:

- **Attention:** interruptions, high-load interruptions, snooze/defer, resumption lag, annoyance,
  missed-critical events.
- **Burden:** oversight minutes/objective, requests/objective, evidence clicks, dwell time, repeated
  requests.
- **Reliance and safety:** false acceptance/rejection, calibration, intervention quality, policy
  violations, rollback, pause/kill latency.
- **Awareness and recovery:** state reconstruction, seeded-failure detection, takeover time,
  correct recovery, checkpoint resume.
- **Provenance:** complete traces, event-gap rate, replay success, version coverage, unresolved
  exceptions.

The north-star measure is less low-value attention per completed objective without sacrificing
quality, calibrated reliance, failure detection, or recovery.
