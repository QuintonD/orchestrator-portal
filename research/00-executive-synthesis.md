# Executive synthesis

Research snapshot: 28 August 2026.

## The opportunity

The open-source ecosystem contains capable personal-assistant runtimes, coding-agent control
surfaces, workflow engines, task managers, and observability products. It does not yet have a clear,
runtime-independent answer to this question:

> What should a person open when several autonomous systems are doing work on their behalf and they
> want to understand what matters, make the few decisions that genuinely require them, and otherwise
> get on with their day?

That is the product opportunity. The portal should explore **T3 Code for the rest of life**, with a
different center of gravity: not conversations and repositories, but commitments, outcomes,
exceptions, artifacts, permissions, and evidence across supported assistant runtimes. “Every” is a
vision, not a credible v0 promise.

The strongest current products validate pieces of the thesis:

- [T3 Code](https://github.com/pingdotgg/t3code) proves that a high-performance, remote-ready,
  multi-surface control layer can sit above existing local harnesses.
- [OpenClaw](https://github.com/openclaw/openclaw) proves demand for an always-on, local-first
  personal assistant and now includes durable tasks, operator controls, dashboards, channels, and
  Tailscale-oriented remote access.
- [OpenHands](https://github.com/OpenHands/OpenHands),
  [LangGraph](https://github.com/langchain-ai/langgraph), and
  [Temporal](https://github.com/temporalio/temporal) demonstrate event histories, interrupts,
  checkpoints, and durable execution.
- [Magentic-UI](https://www.microsoft.com/en-us/research/publication/magentic-ui-report/) identifies
  low-cost human involvement mechanisms: co-planning, co-tasking, action approval, answer
  verification, memory, and multi-tasking.
- [AgentGUI](https://arxiv.org/abs/2607.26300) provides early empirical evidence that a purpose-built
  agent interface can reduce trace-comprehension time and mental demand.
- [Plane](https://github.com/makeplane/plane),
  [Super Productivity](https://github.com/johannesjo/super-productivity), and
  [Home Assistant](https://github.com/home-assistant/core) show mature patterns for triage,
  local-first state, integrations, and exception-oriented control.

None of these products cleanly unifies multiple independent assistants into a personal attention
and work layer while remaining only a monitoring/control surface. OpenClaw and CoWork OS approach
the full vision by owning the assistant runtime; T3 Code and Agent Cockpit approach the architectural
shape but remain focused on coding. The wedge is therefore **cross-runtime personal orchestration**.

## Product position

### Category

An **AI work control surface**: a local-first portal above assistant runtimes.

It is not:

- a foundation model client;
- an agent framework;
- a workflow builder;
- an observability dashboard for developers;
- a replacement for the user's assistant;
- a chat app with more sidebar sections.

### Job to be done

> When my assistants are working across my life, show me the smallest truthful picture that lets me
> stay in control: what needs me, what is happening, what changed, what is done, and how to inspect or
> undo it.

### Initial target user

Start with technical early adopters already running two or more long-lived assistants or agent
harnesses—especially OpenClaw plus Codex, Claude Code, T3 Code, n8n, or Home Assistant. They feel
the problem today, tolerate a host-local daemon and Tailscale, can contribute adapters, and create a
credible path to broader personal-assistant users.

The first wedge should not be “replace your tools.” It should be:

1. connect existing tools;
2. project their tasks, requests, outcomes, and artifacts without erasing source-native meaning;
3. give the user one attention inbox and one audit trail;
4. let them approve, answer, steer, pause, cancel, retry, and open the source runtime;
5. work locally without an account, then add private remote access after threat-model testing.

## The core design decision

The canonical product primitive should be a **work item with runs and events**, not a chat thread.

```text
Objective / commitment
  └─ Work item
      ├─ Run
      │   ├─ Plan or phases
      │   ├─ Event stream
      │   ├─ Requests for authority or information
      │   ├─ Artifacts and evidence
      │   └─ Outcome
      ├─ Policy and permission envelope
      └─ Human decisions and recovery history
```

Chat remains valuable as a universal command and steering surface, but it is one projection over
the work model. This avoids the dominant failure of current products: forcing users to reconstruct
commitments and status from a list of conversations.

## The interface: five surfaces

### 1. Needs you

A durable, prioritized exception inbox containing only requests that require human judgment or
authority:

- approve or reject a consequential action;
- answer a decision-relevant question;
- resolve a contradiction or ambiguity;
- recover a failed, stalled, or drifting task;
- review an outcome whose risk policy requires sign-off.

Each item must show the proposed action, why the user is needed, affected systems, consequence,
reversibility, evidence, expiry/deadline, safe default, and available recovery. Related requests are
bundled by root cause rather than emitted per agent or tool call.

### 2. Now

A calm live view of active work. Cards show objective, current phase, latest meaningful event,
runtime/worker, elapsed time, expected next milestone, budget, and whether the task is inside policy.
Raw model tokens and every tool call stay out of the glance layer.

### 3. Today

A brief rather than another task backlog:

- outcomes delivered;
- commitments due or at risk;
- important changes made on the user's behalf;
- upcoming scheduled work;
- exceptions deferred or snoozed;
- a small, risk-weighted sample of routine actions for calibration.

### 4. Work and outcomes

Searchable history of objectives, work items, runs, messages, artifacts, and external effects. This
is where a user reviews a report, email draft, calendar change, purchase, code diff, research result,
or workflow output in its native form.

### 5. Brain and governance

What the assistant believes and what it is allowed to do:

- durable preferences and memories, with provenance and change history;
- standing instructions and policies;
- permissions and connector scopes;
- schedules and recurring commitments;
- models, runtimes, workers, and health;
- budgets, retention, and notification settings.

Memory edits, policy changes, and new standing permissions are themselves auditable work items.

## Progressive disclosure

The interface should support three evidence depths everywhere:

1. **Glance:** state, consequence, confidence/calibration, next action, short rationale.
2. **Inspect:** plan, assumptions, evidence, alternatives, policy checks, uncertainty, artifact diffs.
3. **Audit:** complete normalized event trace, tool calls, source timestamps, runtime/model versions,
   approvals, side effects, checkpoints, and recovery history.

Do not expose raw chain-of-thought. Expose verifiable evidence, actions, observations, and concise
system-authored rationales.

## Product principles

1. **Minimize low-value attention, not human authority.**
2. **Outcomes first; traces on demand.**
3. **Exceptions raise a hand; routine chatter does not.**
4. **Every consequential action is attributable and every reversible action is undoable.**
5. **Autonomy is task-, stage-, consequence-, and reversibility-specific—not one global slider.**
6. **The portal tells the truth about freshness, coverage, uncertainty, and stale state.**
7. **The source runtime/host retains credentials and execution authority; portal clients stay thin.**
8. **The portal is useful with one runtime and becomes more valuable with each adapter.**
9. **No account, cloud relay, or telemetry is required for the core product.**
10. **Open protocols and exportable history prevent the control layer from becoming a new lock-in.**

## Reference architecture

```text
Web / desktop / mobile-PWA clients
        │  authenticated HTTPS + WSS/SSE
        ▼
Host-local portal daemon
  ├─ device pairing, sessions, per-method scopes
  ├─ adapter registry and capability discovery
  ├─ command router and durable receipts
  ├─ canonical event store and projections
  ├─ attention router and policy-translation labels
  ├─ artifact and provenance index
  ├─ notification outbox
  ├─ source-auth handles isolated inside adapters
  └─ optional OpenTelemetry export
        │
        ├─ OpenClaw adapter
        ├─ T3 Code / Codex / Claude adapters
        ├─ OpenHands / LangGraph adapters
        ├─ n8n / Home Assistant adapters
        └─ generic MCP, A2A, webhook, and OTLP bridges

Remote access: client → Tailscale Serve HTTPS → loopback-bound daemon
```

The portal should not become the executor of record for work owned by another runtime. Each adapter
declares capabilities and maps source-native state into the canonical model. Commands are routed
back with idempotency keys and source receipts. The source runtime remains authoritative; the portal
is authoritative only for attention state, human decisions, its policy definitions and mapping
status, and its source-labelled audit projection. It cannot claim that an advisory policy was
enforced downstream.

## What to reuse from T3 Code

T3 Code is MIT-licensed and the best concrete architectural starting point, but a wholesale fork
would import a large amount of coding-specific domain complexity. Prefer a selective fork/extraction
after a code-level spike.

High-value patterns and candidate code:

- server-owned execution/environment boundary and thin multi-surface clients;
- typed HTTP/WebSocket contracts and subscription streams;
- event-sourced commands, events, projections, and transactional command receipts;
- queue-backed reactors and reconnect-by-sequence behavior;
- device pairing, revocable sessions, and per-RPC scopes;
- saved remote environments and endpoint-provider abstraction;
- `packages/tailscale`, including discovery, safe diagnostics, Serve configuration, and endpoint
  probing;
- thread `active / snoozed / settled` lifecycle and its “raises its hand” behavior;
- pending-approval and pending-input attention states;
- multi-agent fleet panel, stable rows, phase rail, elapsed time, activity, and token totals;
- web/desktop/mobile separation through a shared nonvisual client runtime;
- checkpoint/diff/revert concepts where an adapter can supply them.

Primary references:
[architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[remote model](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md),
[remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md),
[settled/snoozed state](https://github.com/pingdotgg/t3code/blob/main/packages/client-runtime/src/state/threadSettled.ts),
and [agent fleet panel](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/AgentsPanel.tsx).

The decisive spike is to determine whether the cleanest path is:

- fork T3 and replace the project/thread domain;
- extract its server/auth/connection/Tailscale packages into a smaller monorepo; or
- build a new daemon while initially embedding or linking to T3 as one adapter.

The code-level audit recommends a hybrid: **an independent neutral domain plus selective extraction
of small, pure MIT-licensed pieces**. The portal's canonical domain differs enough that hiding it
inside T3's repository/thread assumptions will create long-term friction. T3's reducers, connection
model, event/receipt pattern, and Tailscale helper remain valuable references and possible targeted
imports. See the [T3 reuse audit](./06-t3-reuse-audit.md).

## First falsifiable wedge

The first build should prove attention compression, not breadth of execution. The red-team finding
is important: runtimes already own approval, session, identity, persistence, and policy semantics.
A portal adds value only if it coordinates exceptions without becoming a second execution
authority or a stale duplicate inbox.

The working hypothesis is:

> For one trusted operator running two compatible local agent runtimes, a metadata-minimized
> exception relay reduces time-to-resume and cross-runtime context switching by at least 30% without
> owning credentials, execution, or policy enforcement.

The protocol proof is read-only: acknowledge, snooze, draft a response, and deep-link to the native
runtime. Exact decision forwarding is a later, separately privileged graduation within the wedge,
not an assumption baked into the first experiment.

A subsequent [high-level gap review](./11-high-level-gap-review.md) adds four edge roles that the
original architecture blurred together: runtime adapters, commitment connectors, independent
verifier adapters, and attention-delivery adapters. It also makes placement/push availability,
multi-principal authority, operational key/update/recovery, and a zero-new-dashboard baseline
explicit pre-build concerns.

### In scope

- host-local daemon, loopback browser UI, and responsive PWA shell;
- two adapters selected only after lifecycle and approval protocol probes;
- metadata-first exception and run projection in SQLite, with source-native IDs and raw references;
- Needs you, Active work, Work detail, and Audit views;
- after the read-only gate, exact approve/reject or input forwarding only when source request,
  arguments, identity, and expiry can be deterministically bound; otherwise a read-only deep link;
- steer, cancel, resume, retry, snooze, and settle only where an adapter declares exact semantics;
- durable command receipts and reconnect/cursor replay;
- notification outbox with actionable-only, state-change, digest, and silent policies;
- observed budgets and basic cost/token accounting without claiming enforcement;
- local export and redaction controls.

### Explicitly out of scope

- building an agent loop, memory engine, model router, browser agent, or workflow builder;
- arbitrary public internet exposure;
- multi-tenant enterprise control plane;
- executing untrusted code in the portal process;
- a marketplace before the adapter and permission model is stable;
- trying to normalize every source-native tool event in v0.1.
- a universal policy editor or claims of cross-runtime enforcement;
- storing full prompts, source, outputs, secrets, or chain-of-thought by default;
- storing provider credentials or proxying every tool call;
- Tailscale/remote approval until stale-request, device-identity, and replay tests pass.

### Success criteria

A technically sophisticated user running two assistants can:

1. install without creating an account;
2. connect both assistants in under ten minutes;
3. see active work and every supported pending decision in one place, with coverage gaps visible;
4. act on a correctly bound request and observe a durable source receipt;
5. distinguish accepted, committed, source-claimed complete, and externally verified outcomes;
6. reconstruct an exception without reading or retaining a full transcript;
7. recover from a portal/runtime restart without a false terminal state or duplicate decision;
8. reduce median time-to-resume and context switching by at least 30% against native UIs;
9. receive fewer low-value interruptions without missing a seeded critical event.

## Research hypotheses

The first product studies should compare:

- risk/reversibility routing versus approval of every action;
- root-cause decision bundles versus one prompt per agent/tool;
- glance → inspect → audit versus always-show-all and chat-only baselines;
- event-aware negotiated notifications versus immediate notifications;
- periodic health summaries and risk-weighted samples versus exception-only supervision;
- a moderator/gap-finder agent versus adding more parallel worker agents;
- explicit human-role labels versus a generic “human in the loop” label.

The governing metric is:

> Less low-value attention per completed objective, with equal or better outcome quality, calibrated
> reliance, failure detection, and recoverability.

Supporting measures include interruptions/hour, oversight minutes/objective, prompt count,
high-load interruptions, approval dwell time, false acceptance/rejection, seeded-failure detection,
pause/kill latency, rollback success, state-reconstruction accuracy, stale-state incidents, and
provenance completeness.

## Strategic risks

- **Incumbent convergence:** OpenClaw is rapidly adding tasks, workboards, dashboards, clients, and
  governance. Cross-runtime neutrality must be real, not a slogan.
- **Adapter fragility:** CLI and private APIs change. Capabilities, versions, graceful degradation,
  and contract tests must be first-class.
- **The portal becomes the bottleneck:** central visibility is useful; central execution ownership
  can create failure coupling. Keep adapters and source authority explicit.
- **Approval theater:** too many low-context prompts make users auto-approve. Measure decision
  quality and later rollback, not approval volume.
- **False calm:** summarization can hide uncertainty or missing telemetry. Always show freshness,
  coverage, and the existence of unobserved surfaces.
- **Sensitive traces:** prompts, tool arguments, personal messages, and artifacts contain secrets.
  Default to redacted metadata and local encrypted references, not indiscriminate full-payload logs.
- **Scope collapse:** building a universal runtime, workflow editor, knowledge base, and chat app
  would erase the product's differentiation and delay the attention-layer proof.

## Decisions to make before implementation

1. The first two source runtimes: OpenClaw + T3 Code, or OpenClaw + direct Codex/Claude.
2. Which small T3 components justify selective reuse inside an independent neutral daemon.
3. Whether v0.1 can remain a PWA or needs an Electron/Tauri host for local integration.
4. Confirm the current Apache-2.0 core recommendation and DCO contribution model.
5. The normalized event boundary: how much raw activity is stored versus referenced at source.
6. Which policies each adapter can translate exactly; all others remain visibly advisory.
7. The first attention-routing policy and what evidence is sufficient for a safe batch approval.

The most important decision is conceptual rather than technical: keep the project faithful to being
the user's **portal into delegated work**, not the place that secretly reimplements all delegated
work.
