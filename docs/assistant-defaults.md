# Default assistants and model guidance

Reviewed 10 September 2026 against the source implementation and Artificial
Analysis Intelligence Index **v4.3**. This describes the current source build;
published alpha.6 downloads do not contain these changes.

## Assessment

The previous 19 defaults had useful authority boundaries but weak specialization:
every role shared the same acceptance criteria, no model guidance existed, and
the local Context Scout produced the same inventory as Librarian. A model name
or a scripted demo response did not establish assistant quality.

The library now has **22 active presets**: 15 portable roles, two gbrain handoffs
and five deterministic local guides. Context Scout remains supported for existing
profiles but is retired from new installations. Roles now specify inputs,
acceptance checks and escalation conditions. New teams start with one role;
requesting an external first brief is off by default.

These are reviewed task contracts, **not measured per-model success rates**.
Adapter fixtures, migration tests, browser journeys and an adversarial code review
check implementation behavior. Live comparative role evaluations remain unrun;
use the synthetic cases below before calling any provider/role combination proven.

## Coverage

| Integration | Shared 15-role library | Additional defaults | Execution and model selection |
| --- | --- | --- | --- |
| OpenClaw | Yes | Native schedule records can support Rhythm | Source turns; configured native agent owns model, tools and permissions |
| Hermes | Yes | None | Bounded text turns; source model configuration applies to all its roles |
| Subscription / local model API | Yes | None | Text turns on the exact configured model; no native tools or sessions |
| Generic webhook | Yes | None | Source turns only when messaging is supported; downstream execution is source-owned |
| T3 workspace | Yes, as prepared tasks | Technical roles shown first | Copy into T3 and choose its provider/model there; no portal dispatch |
| Markdown directory / Obsidian / Notion | Yes, as prepared tasks | Librarian and Curator | Local inventories need no model. Other roles attach no documents and require a receiving assistant |
| gbrain | Yes, as prepared tasks | Memory Scout and Memory Keeper | Search remains in Knowledge; handoff execution requires a chosen assistant with authorized access |
| This workspace | Yes, as prepared tasks | Compass, Lens and workspace Keeper | Local records only; portable tasks can be copied into another assistant |
| Grok Bot | Yes, in the task editor | Existing manual result import | Select a role to populate an editable handoff; model choice and execution remain in Grok Bot |
| Demo | Yes, simulated | Synthetic sample team | No inference or evidence of live model quality |

Native ChatGPT, Codex, Claude, Gemini, Muse and other platform adapters are not
created by this library. See [platform coverage](assistant-platforms.md).
Knowledge integrations cannot run models merely because a role is available.
Missing messaging capability resolves to a handoff, never to invented dispatch.

## Model classes

Classes describe the task's needs, not permanent score bands or provider tiers.
Recommendations are a starting hypothesis to test with the role's actual inputs.

| Class | Starting configuration | Use and escalation |
| --- | --- | --- |
| No model | Deterministic local code | Inventories, index-age flags, open decisions; ask for interpretation separately |
| Routine | Luna medium | Clear extraction and short drafts; move to Balanced for conflicts or failed acceptance checks |
| Balanced | Astra low; Sol high as an alternative | Plans, synthesis and writing; move to Deep for difficult code or unresolved material uncertainty |
| Deep | Astra high | Critical review and complex analysis; consider xhigh/max in the source for unresolved hard cases, then seek independent evidence or human review |

The recommendations above are our inference from workload fit and the benchmark
snapshot, not Artificial Analysis recommendations. Its latest method increases
the relevance of agentic work; old v4.1/v4.2 scores must not be combined with v4.3.
[Method update](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3),
[methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking).

| Model configuration | v4.3 intelligence score | Evidence |
| --- | --- | --- |
| Luna medium | 26, estimated; independent evaluation forthcoming | [Model page](https://artificialanalysis.ai/models/gpt-5-6-luna-medium) |
| Luna max | 38 | [Model page](https://artificialanalysis.ai/models/gpt-5-6-luna) |
| Sol high / max | 42 / 47 | [High](https://artificialanalysis.ai/models/gpt-5-6-sol-high), [max](https://artificialanalysis.ai/models/gpt-5-6-sol) |
| Astra low / high / max | 46 / 51 / 53 | [Low](https://artificialanalysis.ai/models/gpt-6-astra-low), [high](https://artificialanalysis.ai/models/gpt-6-astra-high), [max](https://artificialanalysis.ai/models/gpt-6-astra) |

Astra low and Sol high cost about $0.82 and $0.81 per benchmark task respectively,
which supports trying Astra low for Balanced work. Those figures are benchmark
averages, not portal prices or subscription charges. Source latency, cached input,
task length and quota still matter. [Astra low](https://artificialanalysis.ai/models/gpt-6-astra-low),
[Sol high](https://artificialanalysis.ai/models/gpt-5-6-sol-high).

The 9 September Astra update reports stronger overall and agentic performance
than Sol, while Sol retains strengths in presentation and some coding tasks.
This does not justify replacing every role with Astra max.
[Artificial Analysis update](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra).

Terra remains a reasonable candidate for interactive work: official guidance
recommends it for conversation, and its max-effort benchmark reaches 42 with faster
token generation than Astra in the reviewed snapshots. We have not made it a
separate class: measure end-to-end response quality and latency, not just token
speed. [OpenAI agent guidance](https://developers.openai.com/tracks/building-agents#how-to-choose),
[Terra benchmark](https://artificialanalysis.ai/models/gpt-5-6-terra).

The classes are provider-neutral. Claude Fable 5.1 max with fallback also scores
53; GLM-5.3 Flash scores 42 and Qwen3.8 2.4T A95B scores 40. These are candidates
for task-specific evaluation, not claims of interchangeable behavior or local
hardware suitability. The provider's fallback settings also need review.
[v4.3 results](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3).

An existing subscription may have a different cost tradeoff from the API benchmark.
Official OpenAI guidance distinguishes model usage allowances and says task size,
reasoning, tool use and caching affect consumption.
[OpenAI usage guidance](https://learn.chatgpt.com/docs/pricing#what-are-the-usage-limits-for-my-plan).

## Review of every preset

“Improve” means the previous mandate needed a sharper input/output contract;
“keep” means the bounded implementation is useful. Neither label is a live
model-quality grade. The right column records the resulting checks or limitation.

| Preset | Assessment | Class | Resulting contract or limit |
| --- | --- | --- | --- |
| Atlas — coordinator | Improve | Balanced | Objective, decision owner, alternatives, dependencies and evidence that changes the recommendation |
| Sage — evidence reviewer | Improve | Deep | Counterevidence, impact and resolving check; no manufactured disagreement |
| Relay — follow-up | Improve | Routine | Explicit owner/date/status, unknown acknowledgements and a next check |
| Forge — project partner | Keep and sharpen | Balanced | Usable draft and acceptance review; planned versus executed checks |
| Balance — money guide | Keep optional; sharpen | Deep | Dated records, currencies, reproducible arithmetic and educational limits; no trades or suitability claims |
| Ember — coach | Keep optional; sharpen | Balanced | One feasible experiment tied to a voluntary goal; no diagnosis or pressure |
| Piper — personal assistant | Improve | Routine | Marked draft, recipients, chronology and time-zone gaps; no delivery claim |
| Rhythm — routine reviewer | Broaden carefully | Routine | Expected versus observed runs and delivery evidence; supplied logs outside OpenClaw |
| Librarian — inventory | Keep | No model | Bounded source inventory; it does not perform semantic reading-list selection |
| Curator — hygiene | Fix evidence | No model | Cite flagged documents, including those beyond the first inventory page |
| Context Scout — reading list | Retire from new installs | No model | Duplicated Librarian; existing profiles and reports remain intact |
| Memory Scout | Clarify handoff | Routine | Focused query and actual retrieved passages; preparing a task does not run gbrain |
| Memory Keeper | Improve handoff | Deep | Conflicting passages, provenance, dates and proposed corrections; originals retained |
| Builder — code planner | Broaden and sharpen | Balanced | Actual supplied code, interfaces, constraints, error paths and acceptance checks |
| Reviewer — code review | Broaden and sharpen | Deep | Concrete trigger, severity, file and supporting evidence; no invented test results |
| Launch — release review | Broaden and sharpen | Deep | Candidate-bound checks, artifacts, signing/upgrade/rollback evidence; no publication |
| Compass — workspace brief | Keep automatic; fix evidence | No model | Local records and links to relevant attention/source state |
| Lens — evidence gaps | Fix evidence | No model | Current unknown reports and stale documents; superseded results excluded |
| Workspace Keeper — decisions | Improve ordering | No model | Recorded deadlines first, missing dates explicit; relevant attention links |
| Quest — research analyst | Add | Deep | Claim-to-source mapping, conflicting evidence and honest retrieval limits |
| Quill — writer/editor | Add | Balanced | Finished draft, preserved facts/voice and separate editorial notes |
| Delta — data analyst | Add | Deep | Units, missing data, reproducible method and limits on causal claims |
| Aegis — security reviewer | Add | Deep | Defensive trust-boundary findings with evidence; no external scanning or certification |

## Configuration, upgrades and limits

Choose a role in **Team → Add prepared team**. Search or filter the library;
expand a card for inputs, mandate and model guidance. Bring those inputs to the
first conversation. The compatible connection form also explains model classes.
Grok Bot exposes the same 15 roles as editable task starters.

Model and effort recommendations do not alter provider configuration. All roles
on one connection share its configured route. Add separate connections or native
agents for different models. Choose **Reasoning level** in an assistant's conversation
or Team profile, or while adding a custom assistant or prepared team. The setting
is saved per assistant and applies to future portal turns, including reports and
councils. Saving does not dispatch, resume paused work, or edit native schedules.
Existing profiles default to **Source controlled**, which sends no override.
Installing a role again preserves its existing preference.

| Source | Explicit reasoning preference |
| --- | --- |
| Compatible Chat Completions API | Top-level `reasoning_effort` with `max_completion_tokens` |
| Hermes API | Request-scoped `model_options.reasoning_effort` |
| OpenClaw CLI | `agent --thinking`; portal `none` maps to native `off` |
| Generic webhook / prepared handoff | Configure reasoning in the receiving source |
| Local guide / demo | No model reasoning control |

The selector offers none, minimal, low, medium, high, xhigh and max. These are
request values, not discovered model capabilities. Sources may reject or ignore
unsupported values, and some models always reason even when asked not to.
Start with medium for everyday tasks, low for quick tasks, and high for complex
work when supported by the chosen model; consult the role's model recommendation.
OpenClaw retains the last requested level in that assistant's native session.
Choosing Source controlled stops sending an override but does not clear that
native setting: use `/think default` in the same source session to reset it.

The compatible adapter's default output limit is 4,096 tokens, configurable from
256 to 16,384. With explicit effort, that budget includes reasoning tokens; an
answer may be truncated or absent if reasoning consumes it. Without an override,
the adapter preserves the legacy `max_tokens` request format. Hermes, compatible and
webhook turns have a 120-second deadline; OpenClaw's CLI deadline is 610 seconds.
Long reasoning tasks may need the source's native workflow. No automatic retry,
model escalation or paid fallback is introduced. Timeouts remain uncertain.

Wire contracts checked on 2026-09-10 against the
[OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Hermes API server documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server),
[OpenClaw agent CLI](https://docs.openclaw.ai/cli/agent), and
[OpenClaw thinking controls](https://docs.openclaw.ai/tools/thinking).
The installed OpenClaw 2026.9.1 implementation also confirms session persistence.
Tests use synthetic sources and a CLI fixture; they do not establish model quality
or prove that a live provider honors every level.

Version 2 installs copy the new mandate and guidance metadata. On startup, only
exact fingerprints of untouched shipped v1 purpose/criteria pairs are upgraded.
Names, connection, scope, execution mode, provider, pause state and histories are
preserved. Custom mandates and retired Context Scout are left intact. Changing
a mandate clears its old input/model recommendation fields so they cannot silently
constrain a different role. Existing profiles are never dispatched by migration.

Council first passes and synthesis now use separate council session keys instead
of ordinary chat sessions. They may still share a model, native agent memory or
system instructions; session separation does not prove independent verification.
OpenClaw no longer invents a reply for an empty result. Hermes retains truncated
text as unknown and does not promote blank, tool-only or unconfirmed completions.

## Quality evaluation and maintenance

[Synthetic evaluation cases](../evals/assistant-defaults.json) cover every active
preset plus common missing-input, stale-evidence and prompt-injection challenges.
They contain no user data. For a model-backed candidate:

1. Use the actual versioned mandate, listed inputs and one case in a fresh source
   session. Record commit, template/guidance versions, exact model ID, effort,
   source version, available tools, output cap, timeout and access mode.
2. Run each case three times at the proposed class and one adjacent candidate;
   capture latency, source-reported tokens/cost or “unavailable”, and actual output.
   Never substitute API benchmark prices for subscription usage.
3. Score each acceptance check pass/fail/unsupported with an evidence quotation.
   A fabricated source, secret disclosure, unauthorized effect or false completion
   is a failure regardless of other scores. Have a reviewer assess outputs without
   seeing the model label and challenge alleged defects against the evidence.
4. Prefer the least costly configuration meeting the role's checks. Escalate
   failures deliberately; retain failures and uncertainty. Report sample sizes and
   limitations instead of extrapolating a small fixture run to production accuracy.

For deterministic guides, use the server fixtures with controlled index dates,
documents, report states and attention records; no LLM evaluation is required.
Keep task-contract review, adapter conformance, live role quality and user-rated
usefulness separate. The Reports “useful” flag is feedback, not verified accuracy.

Refresh the snapshot in `packages/contracts/src/model-guidance.ts` when source
results, methodology or model availability change. Inspect the current canonical
pages, record estimate status and effort, increment its guidance version, and
repeat the affected evaluations. Never rewrite a stored recommendation as if a
new benchmark had been measured on its old setup. Automatic benchmark scraping
and automatic model routing are not implemented.
