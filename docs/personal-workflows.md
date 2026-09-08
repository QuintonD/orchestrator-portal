# Personal workflows — beta 2

Open **Today** for the personal workspace. **Portal** and **Work** still show the
connected runtimes' existing work. This release adds personal records and bounded
draft preparation above those runtimes, without replacing their execution authority.

## Projects

Enter an outcome and success criteria. A research, software, content or general
template immediately prepares three stages: plan, produce and review. Select a
runtime assistant and confirm the exact project context and source restrictions
before enabling preparation. Forge is the new suggested project role; existing
runtime assistants also work.

The gateway requests one drafting turn at a time, at 30-second intervals, and stops
after the three stages. It runs while the gateway is awake, even after leaving
the page. Global dispatch pause, assistant pause and the existing provider policy
apply. Metered execution remains unavailable without enforceable shared budgets.
Each request is recorded before delivery. Changed assistant/configuration mandates
stop preparation; ambiguous delivery and interrupted requests become `unknown`
and are never automatically repeated. Each project requests its own source session.
This is a routing boundary; isolation and tool restrictions must be enforced by
the source, not by the prompt.

The artifacts are text drafts: plans, code/patch proposals, research, content and
reviews. They do not install files, run implementation tests, deploy, communicate
externally or establish project success. The review stage checks the preceding
draft against the criteria using the selected runtime. Source results remain
claims. Acceptance requires the operator's evidence and is labelled accordingly.

Corrections preserve previous versions and invalidate dependent drafts and their
old acceptance state. Reauthorize the corrected plan to prepare it again. A plan
allows twenty revision rounds; a new objective needs a new project. Pause stops
future requests; running source work can finish. Reconciliation requires source
inspection and a written result or confirmation that a request was not sent.
The assistant's unknown state must also be reconciled in Team before new dispatch.

## Budget and portfolio

Import CSV records through a preview. Each file supports up to 1,000 rows and
200 KB; each record type supports 10,000 records. Preview expiry is 15 minutes.
Use stable row IDs and the same source name when importing again. Conflicting
transactions fail atomically. Financial dates cannot be in the future.

Transaction columns:

```csv
id,date,description,amount,type,category,currency
bank-001,2026-08-01,Salary,3200.00,income,Income,EUR
bank-002,2026-08-03,Groceries,42.15,expense,Food,EUR
```

Amounts are positive decimal strings, with at most two decimal places; calculations
use integer minor units. Types are `income`, `expense`, `refund` and `transfer`.
Refunds offset spending in their category; transfers are excluded from cash flow.
Correct categories/types in place. Identical reimports preserve those corrections.
The displayed net flow is not a bank balance or a forecast. Coverage of a statement
cannot be inferred from its first and last transactions.

Use the month picker for history. **My money plan** can prepare category limits
from the previous completed calendar month's recorded spending. Inspect coverage
and adopt or edit the proposal. Limits are an editable recurring monthly plan.
The current alpha does not retain separate historical versions of those limits.

Holding columns:

```csv
id,name,assetClass,value,currency,asOf
position-001,Example equity basket,Equities,7500.00,EUR,2026-08-31
position-002,Example cash balance,Cash,2500.00,EUR,2026-08-31
```

`value` is the total position valuation, not its share price. A newer date replaces
the same source/holding ID. Missing rows do not remove holdings: use a zero-value
newer record for a closed position or remove the source before a full replacement.
Older snapshots and conflicting values on the same date are rejected.

Budget categories and asset-class labels match without regard to capitalization.
The app groups holdings by your asset-class labels and compares them with targets
you enter. Targets must total 100%; a five-percentage-point difference produces a
review signal. This threshold is a product review rule, not a financial recommendation.
The app records investing objectives, horizon and comfort with losses but does not
infer a suitable portfolio. Values are imported, not live prices. EUR, USD, GBP and
CHF are supported separately; no foreign-exchange conversion is guessed. One active
currency plan is stored; changing its currency clears the draft limits and targets.

**Export or correct an imported source** exports readable personal records or
removes a mistaken financial source and its import receipts. Other sources remain.
Personal records and import previews are encrypted at rest. Exports are readable
JSON and must be kept private by their owner.

## Goals, coaching and PA

Set a measurable goal, why it matters and a weekly intention. Check-ins add progress
and reflection, can be undone, and survive restart. Goals can be edited or archived
with history retained. **Make time** prepares a commitment linked to a goal.
Completing the commitment does not fabricate progress; record a check-in yourself.

Commitments have dates, optional times, duration and preparation notes. The agenda
flags overdue items and overlapping timed commitments, including across midnight.
Items can be edited, completed, reopened and removed. Calendar CSV columns are:

```csv
id,title,date,time,minutes,note
calendar-001,Review the project,2026-09-08,16:00,30,Read the draft beforehand
```

This is a repeatable snapshot import, not live sync. Changed calendar rows require
a different import ID or an in-app edit. Recurrences are not expanded. Calendar
export includes open commitments as iCalendar events, with escaped text and stable
UIDs. Timed events use floating local times; date-based Today checks use UTC.
The export sends no invitation. Time-zone-aware remote calendar synchronization
remains future integration work.

The new suggested runtime roles are **Forge** (projects), **Balance** (money),
**Ember** (coaching) and **Piper** (PA). They are selectable alongside the existing
connection defaults; installing a profile does not provision a native runtime agent.

Optional personal responses require explicit context sharing:

- Money: settings and aggregate monthly/allocation summaries, excluding individual
  merchants and holding records.
- Coach: up to ten active goals and ten latest check-ins per goal.
- PA: the next twenty open commitments, including their notes.

Each request uses a separate source session and an idempotent request ID. Responses
are retained in Reports as claims; uncertain responses block replay. The runtime
can prepare educational reviews, practical reflections and correspondence drafts.
It does not send correspondence or make financial decisions on your behalf.

## What this release does and does not establish

Today automatically gathers project drafts, stalled or due work, commitments,
budget overruns, stale holdings, allocation differences and goal check-in prompts.
It also prepares a reflection from recorded progress. These are deterministic
checks, not evidence that an autonomous system is continuously executing all of
your personal responsibilities.

The release closes the missing-record and draft-follow-through gaps. Live bank,
broker, email and calendar integrations, transaction execution, clinically capable
coaching, independent outcome verification and always-on notification delivery
are not implemented. A CSV-backed workflow is useful now but does not meet the
full vision of a zero-supervision personal assistant. Real provider and operator
pilots remain necessary before claiming that level of coverage.

Financial interface design was informed by the
[CFPB cash-flow toolkit](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/)
and [Investor.gov's introduction to investing](https://www.investor.gov/introduction-investing).
Validation evidence is in [the historical personal-workflows review](personal-validation.md).
