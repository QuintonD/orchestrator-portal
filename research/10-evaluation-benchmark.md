# Evaluation and benchmark specification

## Claim under test

> For one trusted operator managing at least two local runtimes, a metadata-minimized exception
> relay plus outcome ledger reduces verified safe-resumption time by at least 30% relative to the
> runtimes' separate interfaces, without reducing task correctness or gaining execution authority.

The evaluation harness—not the portal—must inject ground truth and record timestamps. A product
cannot be allowed to define its own success.

## Evidence anchors

- [HCAST](https://arxiv.org/abs/2503.17354) includes 189 software/ML/cybersecurity tasks and 563
  human baselines spanning about one minute to more than eight hours. Agent success falls sharply on
  longer human tasks, supporting real operator-time and workflow-difficulty measurement.
- [OSWorld-Human](https://arxiv.org/abs/2506.16042) separates planning/reflection overhead from
  action and reports large step inefficiency. Throughput, waiting, reorientation, and correctness
  are different variables.
- METR's [2025 randomized study](https://arxiv.org/abs/2507.09089) found experienced developers
  were objectively slower in its setting despite positive expectations; its
  [2026 update](https://metr.org/blog/2026-02-24-uplift-update/) explains why selection and
  concurrent-agent timing complicate later measurement. Self-reported productivity is not a
  sufficient outcome.
- [AgentDojo](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html)
  demonstrates the need to test tool-using agents with adversarial, untrusted content.
- [NASA-TLX](https://www.nasa.gov/human-systems-integration-division/nasa-task-load-index-tlx/)
  supplies a standard workload instrument.
- [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/) supports data minimization,
  granular control, and care around disruptive notifications.

## Primary metric

For each injected exception:

- `t0`: source exception or checkpoint generated;
- `td`: operator first becomes aware of the actionable exception;
- `tr`: first correct, task-directed resume action;
- `Tdetect = td - t0`;
- `Tcontext = tr - td`;
- `TTSR = tr - t0`, total time to safe resume.

Primary effect:

```text
TTSR reduction = 1 - geometric_mean(TTSR_portal / TTSR_baseline)
```

Resumption times are likely heavy-tailed. Analyze log time with a mixed-effects model over operator
and scenario. The strong 30% product claim requires the pre-registered 95% confidence interval's
lower bound to reach 30% on held-out scenarios—not merely a favorable point estimate.

Operational north star:

```text
externally verified safe resumptions / active operator attention-minute
```

Always report exception coverage, missed alerts, correctness, and false reassurance beside this
ratio. Otherwise the portal can “improve” by hiding work.

## Metrics tree

### Attention and value

- TTSR, detection delay, and context-reconstruction delay;
- active attention minutes per run;
- runtime/portal focus switches and repeated status checks;
- correct resume rate;
- time to identify runtime, last checkpoint, blocker, and next safe action;
- relay precision, recall, deduplication, and interrupt rate.

### Outcome quality

- task correctness and externally verified completion;
- partial-success recognition and false-done rate;
- rework, rollback, and repeated attempts;
- ledger accuracy against source/harness ground truth;
- correct discrimination of stale, unknown, claimed, and verified state.
- active runs linked to a current source-backed objective;
- work continued after objective cancellation/supersession, duplicate/conflicting runs, and
  priority-weighted neglected commitments.

### Human factors

- NASA-TLX total and subscales;
- situation-awareness probe: runtime, checkpoint, blocker, next action;
- appropriate reliance on correct versus stale/malicious relays;
- false reassurance;
- perceived interruption burden, learnability, setup, and UI-error recovery.

### Reliability, privacy, and adoption

- event-to-relay/display latency; event loss, duplicate, reorder, and stale duration;
- deterministic replay, crash recovery, and offline reconciliation;
- CPU, memory, disk, network, and thermal overhead;
- unauthorized side effects, spoofing, injection, secret leakage, and deletion correctness;
- connector setup success, time to first useful relay, continued use, and maintenance burden.

Dashboard time, active-agent count, token volume, event count, approval count, and hours “saved” are
diagnostic at best. None is a product north star.

## Baselines and ablations

Use identical models, runtimes, hardware, tasks, seeds, and induced failures:

- **B0 current practice:** separate native terminals/UIs; manual monitoring and reconstruction.
- **B1 raw unified dashboard:** centralized status without prioritization or outcome ledger.
- **B2 exception relay:** prioritized/deduplicated exceptions without history.
- **B3 full wedge:** exception relay plus outcome ledger.
- **B4 ambient control:** prioritized exception delivery through an existing OS/menu-bar/messaging
  surface, with the portal opened only for detail and audit.

B0 versus B3 is primary. B1 and B2 reveal whether value comes from centralization, prioritization,
or historical context. B4 tests whether the lowest-overhead product should be a protocol/gateway
with thin ambient clients rather than a dashboard destination. Include a one-runtime arm to test
whether cross-runtime use is genuinely the threshold.

## Instrumented scenarios

Build 12–16 matched scenarios with variants:

1. normal asynchronous completion while the operator works elsewhere;
2. recoverable dependency, test, or permission failure;
3. ambiguous requirement needing a human choice;
4. cross-runtime dependency;
5. near-simultaneous exception burst;
6. out-of-order, duplicate, or stale events;
7. runtime restart after partial progress;
8. offline operation, reconnect, and delayed delivery;
9. false-success claim with a hidden blocker;
10. interruption after a 5-, 15-, or 30-minute idle period;
11. malicious runtime content asking the operator or portal to ignore policy;
12. partial success requiring an outcome correction;
13. one actionable exception hidden in high-volume benign status;
14. explicit ledger correction or rollback.

## Human study

- Pilot with one operator and 30–50 randomized resume opportunities; label it a case study.
- For MVP evidence, use at least 12 independent technical operators, preferably 16–20.
- Run within-subject, counterbalanced B0–B3 conditions with matched variants and Latin-square order.
- Give each participant a concurrent primary task so the test measures interruption/resumption, not
  dashboard vigilance.
- Randomize runtime, severity, delay, and bursts; seed stale and misleading cases.
- Collect NASA-TLX by block and situation-awareness probes after selected interruptions.
- Keep any study screen/focus telemetry local, temporary, consented, and deleted after adjudication.

Suggested model:

```text
log(TTSR) ~ condition + runtime_count + exception_type + interruption_delay
            + (1 | operator) + (1 | scenario)
```

Report geometric ratios, confidence intervals, per-scenario results, and every missed critical
exception. Repeated trials from one person are not independent participants.

## Protocol and conformance tests

| Area | Required invariant | Test | Pass condition |
| --- | --- | --- | --- |
| Schema | only typed/size-bounded fields | valid, invalid, unknown, oversized fixtures | all expected accept/reject results |
| Identity | duplicate IDs are idempotent | replay each event 2–10 times | one transition and one alert |
| Ordering | reordered input converges | permute source events | identical final projection or explicit conflict |
| Absence | missing telemetry is unknown/stale | drop heartbeat and terminal event | never false complete |
| Relay | only actionable classes interrupt | mix info, duplicate, burst, and action | pre-registered precision/recall |
| Untrusted content | source text remains inert | HTML, Markdown, ANSI, command-like strings | escaped, bounded, non-executing |
| Ledger | every outcome has provenance | inspect references/corrections | provenance present, corrections append-only |
| Status | completion needs evidence | send unsupported “done” text | still claimed/unverified |
| Authority | observer cannot act | capability, route, syscall, and network audit | no spawn/write/tool-call/action endpoint |
| Operator intent | viewing/ack/mute is local | exercise all passive controls | source state unchanged |
| Offline | events reconcile idempotently | disconnect, create, reconnect | no silent loss or duplicate effect |
| Crash | committed events survive | kill at every transition | no silent loss or false success |
| Migration | old fixtures remain meaningful | upgrade/downgrade/replay | same semantics or explicit migration error |
| Privacy | content cannot persist accidentally | seed secret canaries | none in stores, logs, dumps, export, preview |
| User control | pause ingest/delete/export work | exercise under load | immediate, legible, auditable behavior |

The first protocol proof should be read-only. A later forwarding component is separately privileged
and may graduate only after it binds a decision to the exact source runtime, session, request ID,
canonical arguments hash, identity, and expiry. Acknowledging an inbox item must never mutate the
runtime.

## Security gates

Treat the portal as a potential confused deputy. Test:

- indirect prompt injection in output, filenames, logs, tool results, and exception text;
- cross-runtime ID, sequence, severity, outcome, and provenance spoofing;
- replayed success, reordered state, ledger rollback, and local tampering;
- process spawn, writable control sockets, file/environment/credential access, and network egress;
- a runtime-A event crafted to target runtime B;
- XSS, Markdown autolinks, terminal escapes, path traversal, and log forging;
- event floods, huge fields, malformed schemas, duplicate storms, disk exhaustion, notification DoS;
- unsigned connector updates, dependency substitution, and downgrade;
- privacy leakage through exact paths, names, IDs, sizes, and timing.

If an LLM summarizes exceptions, isolate it without tools, credentials, or network; bound its input;
require a strict output schema; display its result as an untrusted summary. Prefer deterministic
classification in the first proof.

Release requires zero unauthorized side effects, secret-canary leakage, false success from spoofed
or missing telemetry, and unresolved high/critical findings.

## Reliability and chaos tests

Inject portal/runtime crash, forced termination, power loss, sleep/wake, partitions, delay,
duplication, reordering, reconnect storms, clock skew, disk full, read-only filesystem, DB lock,
corrupt index, active migration, runtime ID reuse, UI delay, and local model resource contention.

Proposed technical gates:

- at least 99% injected-event coverage;
- zero silent loss or false success across 1,000 fault/replay trials;
- deterministic replay of the same log;
- local p95 event-to-relay below 250 ms and p99 below one second at a declared load;
- process-restart recovery below 30 seconds;
- portal overhead below 5% of runtime wall time and no sustained contention that changes outcomes.

These thresholds are recommendations and must be tuned after baseline variance is known.

## Privacy tests

Place canaries in prompts, outputs, commands, paths, URLs, environment variables, and runtime logs.
Verify absence from event database, logs, crash dumps, clipboard, exports/imports, notification
previews, browser storage, network requests, backups, indexes, caches, and temp files.

The production measurement schema should contain no free text:

```text
schema_version
event_id                  # random, install-local
event_name                # fixed enum
run_id                    # random, local
runtime_id                # random, install-local
source_kind               # runtime | portal | operator
parent_event_id
source_sequence
occurred_monotonic_ms
received_monotonic_ms
state                     # queued | running | waiting | blocked | failed |
                          # partial | succeeded | cancelled | unknown | stale
reason_code               # fixed taxonomy
severity                  # info | attention | high | critical
attention_required        # boolean
delivery_mode             # in_app | digest | notification | suppressed
operator_action           # none | opened | acknowledged | muted
outcome_code              # unknown | success | partial | failed | cancelled
error_class               # fixed enum
payload_size_bucket       # optional coarse bucket
privacy_filter_status     # passed | rejected | redacted
integrity_status          # valid | invalid | unavailable
```

Study-only ground truth and correctness live in the evaluation harness, never normal telemetry.
Production measurement excludes prompts, outputs, commands, paths, URLs, repo/branch names,
hostnames, IPs, model context, and free-text summaries. Network egress is visibly disabled by
default.

## Staged gates

### Stage 0: pre-build

Instrument B0 independently; specify matched scenarios and state transitions; record task/operator
time distributions; freeze the metadata schema and authority invariants.

### Stage 1: read-only protocol proof

Require conformance, offline/replay/deduplication/migration, canary, deletion, and egress tests. The
component has no command-capable credential or endpoint.

### Stage 2: technical alpha

Require at least 99% event coverage; zero silent loss, false success, or side effect; performance
budgets; deterministic replay; correct unknown/stale/partial/failed/complete semantics.

### Stage 3: controlled human experiment

Proceed when the TTSR point estimate improves at least 30%, confidence excludes no improvement,
safe-resume correctness is non-inferior, high-severity false reassurance is zero, active attention
does not increase more than 5%, NASA-TLX does not increase materially, and missed critical events
are zero. Do not market a confirmed 30% effect unless its pre-registered lower confidence bound
reaches 30%.

### Stage 4: field pilot

Run two to four weeks with at least two runtimes per operator. Broaden release only if held-out real
tasks preserve the effect, no critical security/privacy incident or unauthorized action occurs,
stale/correction semantics remain understandable, users can stop/export/delete without help, and
runtime outcomes do not degrade.

Synthetic replay can prove protocol invariants and expose some security bugs. It cannot establish
real interruption burden, cognitive reorientation, trust calibration, habituation, productivity,
open-world injection resistance, or generalization across people and workflows. Those require
humans doing real work.
