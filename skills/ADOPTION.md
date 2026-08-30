# Adoption guide

The initial set focuses on two failure points that show up early in AI projects:
generic prose and poorly surfaced design assumptions. It deliberately avoids a
large engineering framework until your real projects show which parts you need.

## Five-minute test drive

### Stress-test a project decision

From the project root, prompt:

```text
$grill-with-docs Grill me on the smallest useful version of this project. Capture
confirmed domain terms and only decisions worth preserving. Do not implement yet.
```

The agent should inspect the project first, ask one consequential question at a
time, recommend an answer, and update `CONTEXT.md` only after terminology is
confirmed. An ADR should be rare. The session ends with a recap, not code.

Use `$grilling` instead when you want the same interview without file changes.

### Tighten prose

Prompt:

```text
$unslop Rewrite README.md for a technical reader. Preserve every command, link,
claim, and limitation. Return the revision first.
```

Ask for an audit instead of a rewrite when you want to review each change:

```text
$unslop Audit this proposal for machine-shaped writing. Do not rewrite it yet.
```

## Defaults chosen for this template

| Choice | Current default | Why |
| --- | --- | --- |
| Unslop trigger | Important prose tasks, not every reply | Keeps ordinary agent work fast and avoids flattening casual voice. |
| Editing style | Smallest useful rewrite | Protects meaning and makes review easier. |
| Punctuation | Remove repetitive habits, not blanket bans | Preserves natural author voice. |
| Grill cadence | One branching question, up to three independent small questions | Keeps momentum without presenting a questionnaire. |
| Recommendations | Every material question gets one | You can answer quickly with `accept recommendations`. |
| Documentation | Root `CONTEXT.md`; ADRs under `docs/adr/` | Simple default for a new project. |
| Write timing | Only after a term or decision is confirmed | Keeps speculative ideas out of durable docs. |
| End boundary | Stop after interview and docs | Prevents an alignment session from turning into unrequested implementation. |

Change these only after you notice real friction. Useful calibration requests are:

- "Make `$unslop` preserve more of my punctuation and sentence length."
- "During `$grill-with-docs`, ask exactly one question per turn."
- "Use British English for newly drafted prose."
- "Our domain docs belong under `docs/domain/`; adapt the skills."

A few samples of your own writing are more useful than a long style questionnaire.
When you have them, use `$unslop` to compare the samples, extract stable patterns,
and update only the `Default voice for this template` section.

## Sensible next wave

Do not install both authors' entire libraries. Add one workflow when a recurring
need becomes visible.

| Need | Candidate | Source | Adoption note |
| --- | --- | --- | --- |
| Understand unfamiliar code | `how` | Pstack | Good read-only next step; low overlap with this set. |
| Diagnose difficult defects | `diagnosing-bugs` | Matt Pocock | Adds a gated evidence loop before fixes. |
| Test-driven implementation | `tdd` | Either author | Compare both and choose one; duplicate TDD skills create ambiguous routing. |
| Turn aligned discussion into delivery work | `to-spec`, then `to-tickets` | Matt Pocock | Adopt after `grill-with-docs` feels useful and you want a fuller chain. |
| Review a completed change | `code-review` | Matt Pocock | Useful once the template has a stable test and diff workflow. |
| Stronger technical documentation rules | `technical-writing` | Pstack | Add only if `unslop` is too light for long-form documentation. |

The recommended next experiment is `how`. It adds useful read-only investigation
without imposing a project-management system. After that, choose one diagnosis or
TDD workflow based on the kinds of projects you actually run.

## Updating from upstream

These files are adapted forks, not managed subscriptions. Do not overwrite them
with a bulk updater.

1. Open the pinned upstream source in `THIRD_PARTY_NOTICES.md`.
2. Compare the newer `SKILL.md` with the local version.
3. Bring across changes that improve decisions or fix a demonstrated failure.
4. Preserve local trigger scope, documentation paths, and the stop-before-build
   boundary unless you intentionally change them.
5. Run the skill validator and test one realistic prompt.
6. Update the source pin and adaptation notes.
