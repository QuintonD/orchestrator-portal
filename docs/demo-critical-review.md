# Critical demo review — 6 September 2026

## Verdict

The demo is visually coherent and mechanically usable, but it does not yet
convincingly demonstrate assistants taking work off the human. The main journey
still asks the operator to choose an assistant, request a report, read it,
interpret the evidence and initiate the next step. More icon themes would not
address this gap.

This review used a fresh local demo on port 4425, direct Playwright interactions,
393 × 851 phone screenshots, a 1440 × 1000 desktop screenshot and implementation
inspection. It exercised assistant setup, two report requests, a council, the
attention dialog and assistant-to-conversation navigation. It is a heuristic
walkthrough, not independent user research. No application code was changed.

The previous demo process was no longer reachable and was restarted. Demo startup
should be dependable before the application is handed to someone else to evaluate.

## Observed problems, in priority order

1. **The primary decision is not actually reviewable.** Portal highlights launch
   copy needing a decision. The attention dialog says two positioning options are
   ready, but shows neither option and provides no source link. Its only action
   is local acknowledgment. Acknowledgment must remain distinct from resolution,
   but the missing options and source route prevent a useful handoff.

2. **Assistant identity breaks across views.** Opening Sage's conversation
   navigates to `/assistant?connector=demo`; the source selector says Atlas and
   the composer says “Message Atlas…”. Profiles share a connector, while the
   conversation UI is connector-scoped. Preserve the selected profile, its role
   and its conversation identity; expose the underlying runtime as secondary
   information.

3. **The demo's outputs do not demonstrate different capabilities.** Atlas and
   Sage returned identical briefing bodies. A council asked whether launch should
   wait for reliable evidence handling returned identical generic acknowledgments
   for both participants and the lead synthesis. Corrections are simulated by
   appending the operator's text to a prepared revision. This tests delivery and
   persistence, not the quality of reasoning, disagreement or revision.

4. **Useful work remains manually initiated.** All three seeded assistants are
   ready, on request, with a Request report button. There is no strong first-open
   presentation of what they have already investigated or prepared. A seeded
   report exists, but it does not drive a connected first-use journey.

5. **Setup still transfers runtime configuration work to the user.** The standard
   setup exposes runtime, cadence and provider policy, plus an attestation about
   source restrictions. Defaults help but do not establish or check those
   restrictions. Infer only settings that the connection can actually establish;
   prepare the read-only plan automatically and ask about genuinely unresolved
   scope or authority. Separate expected follow-up from an activated schedule.

6. **Reports remain difficult to scan.** The phone report opens with a date-based
   title, delivery metadata, criteria and a demo disclaimer before its finding.
   Headings inside the body are plain text; sources are names rather than usable
   references. Review and correction controls require scrolling. Use an outcome
   title, a one-sentence finding, recommendation, source references and an action
   area; keep criteria and provenance accessible through expandable details.

7. **Navigation reflects internal feature boundaries.** Assistant and Assistants
   are adjacent primary destinations. Reports, Attention and Work also divide a
   single review journey. Organize around the operator's intent: Today, Work,
   Team and Knowledge are candidate labels to test. Keep conversation contextual
   to a person or task; retain advanced history and runtime controls elsewhere.

8. **Screen space is calm but not consistently productive.** The phone Portal
   repeats urgency in its headline, count strip and section label. The useful
   decision appears well down the initial viewport. Desktop assistant rows span
   almost the whole available width, with a long gap between description and
   controls, while showing no latest result or substantive progress. Replace
   repetition with the latest finding and next action; avoid filling whitespace
   merely to increase density.

9. **Metrics emphasize operation over value.** Tokens, cost and aggregate success
   dominate Insights. They do not answer what moved forward, what needs checking,
   or whether a decision was resolved. Preserve usage metrics as secondary detail;
   foreground changed outcomes, unresolved exceptions and evidence freshness.
   Make time ranges and outcome definitions explicit. Do not invent time-saved
   claims without measurement.

10. **The icon system adds character but cannot carry the product identity.**
    Animals are more immediately recognizable than several abstract symbols.
    Thin strokes and restrained motion fit the theme. Four identities per theme
    necessarily repeat as the team grows, and automatic name hashing can assign
    the same icon to different assistants. Keep names explicit, prioritize stable
    per-assistant assignment, and make further theme expansion a low priority.

## Recommended next increment

Build one complete, explicitly simulated launch scenario:

1. On entry, Atlas has prepared a brief and Sage has checked its assumptions.
2. The homepage shows what has been handled and the one unresolved decision.
3. Review opens two actual options, a recommendation and inspectable evidence.
4. A follow-up produces a meaningfully changed revision with the differences clear.
5. A simulated choice updates the related work, report and attention state.
6. For real connections, unsupported consequential actions remain source-native:
   show the prepared handoff and actual source receipt instead of claiming execution.

Use distinct, deterministic fixtures for the roles, an actual disagreement and
an unavailable-source case. Make simulation explicit without repeating long
disclaimers in each content block. Validate the causal links between views.

## Next usability study

Recruit five people who have not seen the build, including representative
operators of multiple assistants. Ask them to identify the decision, explain
what each assistant has done, inspect its evidence, request a change, and explain
what acknowledgment or pause would affect. Do not guide their navigation.

Record time to the first meaningful result, navigation reversals, requests for
help, mistaken beliefs about execution or verification, and successful task
completion. Suggested targets to test are identifying the main decision within
ten seconds and reaching a useful first result within a minute. These are
proposed acceptance targets, not measured results or industry benchmarks.

The existing automated tests establish that controls, states and persistence
work. Add semantic assertions for the demo: distinct role outputs, relevant
synthesis, changed revisions, preserved identity and consistent cross-view state.
Passing navigation tests alone does not establish product value or ease of use.
