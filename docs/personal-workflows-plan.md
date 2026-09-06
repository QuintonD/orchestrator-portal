# Personal workflows implementation plan

The personal-needs review exposed missing operational records, not merely missing
assistant prompts. This change adds persistent workflows above existing source
runtimes. It includes the previously validated, uncommitted beta work on which it
depends; user design references under `assets/` remain outside the PR.

## Delivery and acceptance

1. **Projects:** one objective creates a three-stage draft plan. Bind a runtime
   assistant, explicitly authorize the project's context and a bounded sequence
   of drafting turns, persist each request before dispatch, and retain deliverables.
   Separate draft production from human acceptance with evidence. Pause, restart,
   uncertain delivery, stale edits and changed runtime mandates must fail safely.
2. **Money:** preview and import transaction/holding CSVs with stable source IDs;
   reject malformed or conflicting rows atomically and make repeated imports safe.
   Show monthly cash flow, category limits, refund/transfer handling, holdings,
   allocation drift against user targets and record freshness. Prepare budget
   baselines from a completed month. No quotes, trades or bank access are implied.
3. **Life and PA:** persist measurable goals, check-ins and dated commitments.
   Prepare an agenda, overdue follow-ups, goal review prompts and weekly reflection
   from those records. Provide repeatable calendar CSV import and calendar export.
4. **Today:** combine the most actionable signals, with links to the underlying
   work and compact visual progress. Local analysis runs without model calls.
   Empty states offer a useful first action; synthetic examples exist only in demo.
5. **Validate and land:** server failure/adversarial and persistence tests, browser
   journeys, desktop/phone light/dark screenshots, native Android inspection,
   full repository checks, PR with honest limitations, CI and merge to main.

## Additional capabilities inferred from the needs

Cross-domain attention, explicit data freshness, deterministic duplicate protection,
portable calendar export, goal-linked commitments, a weekly reflection, and
revocable project automation make the individual features useful together.
Private financial and coaching records stay local; project dispatch sends only
the selected project's context, after the operator confirms that sharing.

## Research basis

Budget calculations separate income, expenses and timing, following the
[CFPB cash-flow toolkit](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/).
Investment setup records objectives, horizon and risk tolerance and compares
holdings with user-entered targets, informed by
[Investor.gov's introduction](https://www.investor.gov/introduction-investing).
These are educational design references, not personalized investment advice or a
claim that an allocation is suitable. External execution remains source-native.
