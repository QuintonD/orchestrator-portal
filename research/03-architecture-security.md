# Architecture and security

## Architectural objective

Build a host-local control plane that can observe heterogeneous assistant runtimes and, only after a
separate capability/security gate, forward exactly bound commands without pretending to become
those runtimes.

```text
Web / desktop / mobile-PWA clients
        │ authenticated HTTPS + WSS/SSE
        ▼
Host-local portal daemon
  ├─ device pairing, sessions, per-method authorization
  ├─ adapter registry and capability negotiation
  ├─ optional privileged command forwarder, receipts/outbox
  ├─ normalized event store and projections
  ├─ attention router
  ├─ artifact/provenance index
  ├─ notification outbox
  ├─ adapter-isolated source authentication handles
  └─ optional telemetry export
        │
        ├─ OpenClaw
        ├─ T3 Code / Codex / Claude / OpenCode
        ├─ OpenHands / LangGraph
        ├─ n8n / Home Assistant
        └─ generic MCP / A2A / webhook / OTLP bridges

Optional remote client → Tailscale Serve HTTPS → loopback-bound portal
```

The first protocol proof is read-only and loopback-only. Remote access and command forwarding are
separate graduations with separate threat-model and test gates; neither is required to validate the
attention-layer hypothesis.

The client is a thin observer/controller. Provider credentials, processes, terminals, local files,
and source-native side effects remain on the host or execution environment. T3 Code provides a
proven example of this boundary in its [architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)
and [remote model](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md).

## Authority boundaries

The portal must record who is authoritative for each kind of state.

| State | Authority |
|---|---|
| Source run/session status and tool execution | Connected runtime |
| Source artifact bytes and external provider result | Runtime or external system, referenced by receipt/digest |
| Normalized work graph and cross-runtime correlation | Portal projection |
| Human attention state: read, snoozed, dismissed, resolved | Portal |
| Portal-level policy and standing permission | Portal, but enforcement strength depends on adapter capability |
| Approval or answer decision made through the portal | Portal record plus source acknowledgement |
| Actual side-effect completion | Source/provider receipt; never inferred from assistant prose |
| Connection freshness and observability coverage | Portal |

Every adapter declares enforcement capability. A `monitor_only` adapter can observe and deep-link but
cannot honestly claim to block actions. A gated `command` adapter can pause/answer/approve. A
`policy_enforced` adapter guarantees that relevant source side effects pass through a portal-verifiable
gate. The UI must not use the same “protected” label for all three.

Do not make a single adapter abstraction do four different jobs:

- **Runtime adapter:** observes source execution and, after separate graduation, forwards exactly
  bound source commands.
- **Commitment connector:** reads objectives, priority, deadlines, and cancellation from existing
  systems of record.
- **Verifier adapter:** independently reads an external postcondition or reconciliation state.
- **Delivery adapter:** brings an attention item to a person and records delivery/interaction, but
  does not itself confer approval authority.

Each role has different credentials, trust, retention, and failure semantics.

## Canonical domain model

Keep the normalized model smaller than any source runtime.

### Entities

- **Environment:** a runtime boundary and its connection/identity.
- **Principal:** human, portal service, agent, subagent, runtime, or connector identity.
- **Stakeholder/data subject/resource owner:** people whose data, resources, or interests are
  affected, even when they are not portal users.
- **Delegation:** versioned authorization linking authorizer, delegatee, resource/effect scope,
  conditions, expiry, and revocation.
- **Agent:** a durable assistant identity/profile where the source exposes one.
- **Objective:** a user commitment or desired outcome, possibly spanning runtimes.
- **Work item:** one bounded unit of delegated work.
- **Run:** one execution attempt in one source runtime.
- **Step/phase:** optional source-reported structure; never fabricate bounded progress.
- **Request:** approval, clarification, review, authentication, or recovery need.
- **Decision:** the human or policy response and its scope.
- **Artifact:** output or evidence, usually referenced by digest and source locator.
- **Effect:** externally observable mutation such as a sent message, file write, purchase, calendar
  change, deployment, or deletion.
- **Verification:** source-labelled evidence that a postcondition was externally observed or
  reconciled; absence remains `unknown`.
- **Policy:** versioned rule/permission/budget envelope.
- **Notification delivery:** an attempt to bring an attention item to a person.

### Source-neutral run state

```text
discovered
  → queued
  → running
  → waiting_approval | waiting_input | paused | blocked
  → running
  → succeeded | failed | cancelled | timed_out | lost | unknown
```

`unknown` is important: a timeout or disconnect does not prove failure, and retrying an unknown
write can duplicate side effects. Delivery state is separate:

```text
not_requested | queued | delivered | acknowledged | failed | dismissed
```

[OpenClaw's background-task model](https://docs.openclaw.ai/automation/tasks) is a strong precedent:
it separates execution outcome from completion delivery, retains canonical results, audits stale or
lost work, and uses fenced retries for delivery.

### Event envelope

```text
event_id
source_environment_id
source_event_id / source_sequence
aggregate_type / aggregate_id
portal_sequence
schema_version
event_type
occurred_at / observed_at
actor_principal_id
correlation_id / causation_id
traceparent
trust_zone / sensitivity
redacted_payload
payload_digest
raw_source_reference (optional)
```

`occurred_at` is source time; `observed_at` is portal ingest time. Keep both so delayed events are
not mistaken for recent behavior. Source-native payloads should normally remain at the source or in
an encrypted bounded store; the canonical event contains only fields needed for projections,
attention, policy, and audit.

### Commands and receipts

Every command carries:

```text
command_id (idempotency key)
target_environment / target_run
expected_source_version or cursor
requested action and normalized arguments
actor/device/session
policy version and approval/decision reference
workspace/artifact digest where relevant
created_at / expires_at
```

Lifecycle:

```text
local intent
  → portal accepted receipt
  → policy decision
  → source dispatch attempted
  → source acknowledged/rejected/unknown
  → authoritative source event and provider receipt
```

Persist the command, accepted receipt, resulting portal events, and projection updates in one SQLite
transaction. Dispatch to the source through an outbox after commit. A source acknowledgement is not
the same as completed side effect.

## Persistence and processing

SQLite in WAL mode is sufficient for a single-user MVP. Use:

- append-only normalized event table;
- source cursor table per adapter/stream;
- transactional materialized projections for UI queries;
- accepted-command and source-receipt tables;
- durable source-command outbox;
- durable notification outbox;
- bounded encrypted payload/artifact-reference store;
- schema migrations and periodic snapshots for fast hydration.

On reconnect:

```text
authenticate
  → hydrate a consistent projection snapshot
  → replay events after client cursor
  → subscribe to live events
```

Client commands created offline stay visibly queued until a portal receipt arrives. Approval, stop,
and destructive commands should be disabled offline in the first release because stale authority is
more dangerous than delayed convenience.

The portal does not initially need Temporal, DBOS, or another general workflow engine. It owns short
durable processes—ingest, projection, source dispatch, notifications, reconciliation—which are well
served by an event log and outboxes. Evaluate [DBOS](https://docs.dbos.dev/),
[Restate](https://docs.restate.dev/foundations/key-concepts), or
[Temporal](https://docs.temporal.io/workflows) only when the portal itself begins owning long-lived
multi-worker workflows. Keep the portal domain above the chosen engine so execution infrastructure
does not become the product model.

## Attention routing

Attention is a deterministic projection, not an LLM-only classification.

Base priority inputs:

- effect class: read, draft, reversible write, external communication, financial, destructive;
- reversibility and compensation availability;
- urgency/deadline;
- uncertainty and contradiction;
- policy status;
- blocking duration;
- source health/freshness;
- whether similar unresolved items already exist;
- user focus mode and quiet hours.

An optional model can summarize and group candidates, but deterministic rules decide whether a
safety-critical item can be suppressed. The model's recommendation and the final routing decision
are recorded separately.

## Approval integrity and policy

Provider-native permission modes are useful but not a universal security boundary. A portal approval
is safe only when the adapter can bind it to the exact source action.

Evaluate a policy over:

```text
human principal and delegated agent
objective/work item/run
tool and version
normalized arguments and target resource
requested capabilities
source environment and trust zone
effect/risk/reversibility class
budgets and current execution state
```

Candidate capabilities:

```text
workspace.read
workspace.write
process.exec
network.egress:<origin>
secret.use:<name>
connector.call:<connector>/<operation>
message.send:<account/audience>
calendar.write:<calendar>
git.push:<repository/ref>
financial.commit:<account/limit>
irreversible.external_action
```

Approval requirements:

- show the canonical full action and arguments without truncation;
- bind the decision to action hash, target, tool/runtime version, policy version, workspace/artifact
  digest, person, device/session, and expiry;
- one-time nonce and replay protection;
- invalidate when any bound field changes or the connection/runtime restarts in a way that loses the
  pending action;
- distinguish allow once, allow for this work item, and standing policy;
- never let a push-notification token itself carry approval authority;
- write both portal decision and source acknowledgement to the audit trail.

[OPA](https://www.openpolicyagent.org/docs) is a reasonable future policy engine. If a later alpha
graduates to command forwarding, a small typed native evaluator is easier first and can later
compile or delegate to OPA. Do not hide product semantics in opaque Rego before the permission
vocabulary stabilizes.

## Identity and authentication

### Device access

Adopt T3 Code's useful pattern:

1. host creates a short-lived, one-time pairing credential;
2. device exchanges it for a revocable session;
3. session has explicit method scopes;
4. pairing credential is never reused for ordinary access;
5. devices and sessions can be inspected and revoked.

T3's [remote-access documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)
also places pairing tokens in URL fragments for hosted handoff so they are not sent to the hosted
page origin. Prefer a fully local/PWA pairing page for this project; if a hosted static client exists,
it must connect directly to the user's daemon and must not proxy or learn local data.

Example scopes:

```text
work:read
attention:read
attention:decide
work:steer
work:cancel
artifact:read
audit:read
policy:read
policy:admin
connection:admin
secret:admin
terminal:use (future, off by default)
```

A valid socket never implies all scopes. Use an authenticated HTTP exchange followed by a short-lived
WebSocket/SSE ticket; do not place long-lived bearer tokens in query strings.

### Agent and connector identity

Each adapter, agent, and connector gets a distinct principal. Never use one omnipotent portal token
for every downstream service. Prefer short-lived, audience-bound credentials through a broker.
For HTTP MCP, follow the current
[MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):
OAuth 2.1 ecosystem protections, PKCE where applicable, protected-resource metadata, resource
indicators/audience validation, issuer validation, secure storage, CIMD where supported, and no
token passthrough.

SPIFFE/SPIRE becomes relevant only if the local daemon grows into several separately isolated
services or remote workers. It is unnecessary infrastructure for a single-process MVP.

## Placement, availability, and notification delivery

Tailscale provides private reachability; it does not keep the portal, runtime, or host online and it
does not replace background push. Placement is therefore product state, not deployment trivia.

Declare whether the portal is co-located on an active workstation, installed on an always-on private
node near the runtimes, or split from remote runtimes through authenticated adapters. Show portal,
runtime, delivery-channel, and client health separately.

On iOS/iPadOS, Web Push requires a Home Screen web app, user-initiated permission, service workers,
and Apple Push Notification service. A private PWA may therefore still rely on platform push
infrastructure. Delivery adapters should carry an opaque attention ID and coarse severity only;
authenticated clients fetch detail afterward. A successful push receipt proves delivery handling,
not that the right human saw or authorized anything.

The initial loopback proof needs no push. Before claiming unattended/mobile operation, test host
sleep, runtime/portal split placement, APNs/browser push loss, notification expiry, duplicate
delivery, quiet hours, and recovery after each dependency returns.

## Tailscale remote access

Preferred remote path after the replay, stale-approval, pairing, and device-identity gates pass:

```text
phone/browser → tailnet HTTPS + MagicDNS → Tailscale Serve → 127.0.0.1:portal
```

[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) exposes a local service only
inside the tailnet and can proxy a loopback listener. [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)
is public internet exposure and should not be part of the default product.

Candidate T3 code in `packages/tailscale` already handles:

- cross-platform CLI naming;
- bounded status/serve/probe timeouts;
- MagicDNS and tailnet IPv4 discovery;
- safe classification of stderr without logging auth keys or node names;
- `tailscale serve --bg --https=<port> http://127.0.0.1:<localPort>`;
- HTTPS endpoint probing.

If reused, preserve the T3 MIT notice and attribution. Always keep application-level device auth and
per-method authorization; a tailnet is a network trust boundary, not sufficient application auth.

## Adapter boundaries

An adapter should implement only the capabilities its source exposes:

```text
discover metadata and capabilities
authenticate / health / version
hydrate source snapshot
subscribe or poll after cursor
normalize source events
start work (optional)
answer / approve / reject (optional)
steer / pause / resume / cancel (optional)
fetch artifacts or signed references (optional)
verify source receipt / reconcile unknown outcome
open native UI deep link
```

Capability negotiation includes source/version, supported commands, resumability, approval binding,
artifact access, checkpoint/undo support, sequence/replay guarantees, and enforcement level.

MCP is a connector protocol, not a universal authorization or task-history layer. Treat tool names,
descriptions, annotations, inputs, and outputs as untrusted unless the server is explicitly trusted.
Run third-party local MCP servers out-of-process and without access to the portal database or secret
store. Use A2A only for independent agents; preserve local policy and provenance at the gateway.

## Sandboxing

The portal should not execute untrusted code. The first proof only reads from trusted installed
runtimes through constrained adapters. If future plugins contain executable code:

- manifest discovery and validation must not execute the plugin;
- declare capabilities, network origins, data scopes, and activation conditions;
- run untrusted connectors out-of-process;
- provide read-only portal APIs by default;
- never give plugins raw database, secret-store, Docker socket, or unrestricted filesystem access;
- pin versions and content hashes; show changes before reauthorizing;
- add platform isolation such as containers/gVisor or a separate Linux execution host before
  allowing generated code.

Firecracker is strong Linux isolation but is not a practical cross-platform requirement for this
monitoring-layer MVP.

## Artifacts, effects, and provenance

Artifacts are content-addressed references where possible:

```text
artifact_id
media_type / logical kind
source locator and environment
content digest / size
created time and producing run/step
input artifact/source digests
runtime/model/tool versions
policy and approval references
sensitivity / retention
preview/redaction metadata
```

Do not copy every personal artifact into a new database. Cache small previews and normalized metadata;
fetch source bytes on demand or store encrypted user-opt-in copies. Every external effect carries
provider request/receipt IDs, target, before/after state when available, and compensation/rollback
classification.

Represent an effect as a reconciliation ladder, not one `success` Boolean:

```text
intended → requested → accepted_by_source → committed_by_source
         → externally_observed → reconciled_to_postcondition → human_verified (when required)

orthogonal: unknown | disputed | reversed | compensation_requested | compensated
```

Runtime adapters supply source states; verifier adapters supply external observation and
postcondition evidence. A missing verifier or failed read-back leaves the effect `unknown` rather
than downgrading or upgrading it by inference.

For repository work, T3's hidden Git checkpoint/diff/revert pattern is excellent. For non-code
systems, use source-native versions, drafts, undo APIs, transactions, or explicit compensation.
Never label a best-effort compensating action as a guaranteed undo.

## Observability

Keep two streams separate:

1. **Product events:** durable normalized facts used to reconstruct portal state.
2. **Telemetry:** traces, metrics, and logs used to diagnose performance and failures.

Adopt [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) where they
fit, including the evolving [GenAI agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md).
Map `invoke_agent`, workflows/plans, tool execution, model calls, retrieval, and MCP operations to
traces. The GenAI conventions are still moving, so keep translation in one adapter layer.

Default privacy rules:

- prompts, personal messages, tool arguments/results, and artifacts are not exported by default;
- store redacted metadata and digests;
- truncate and encrypt optional local detail;
- never record hidden chain-of-thought;
- make every remote telemetry destination visible and opt-in;
- telemetry is off by default for the open-source distribution.

Cost accounting records provider/model, billable input/output/cache/reasoning counts, retry count,
latency, rate limits, a versioned local price card, and source request IDs. Put run IDs in traces/logs,
not high-cardinality metrics.

## Notifications

Use a durable outbox keyed by `attention_item + recipient + channel + generation`. Route by severity,
effect class, quiet hours, user focus state, and user policy. Collapse repeated progress events by
work item/root cause. Push payloads contain a short-lived authenticated deep link, not the underlying
approval token or sensitive content.

Adopt OpenClaw's useful policy vocabulary:

- **done only:** terminal outcome;
- **state changes:** meaningful phase/progress transitions;
- **silent:** retained in the ledger but not pushed.

Delivery acknowledgement and execution outcome remain separate.

## Failure and threat matrix

Evidence labels: **V** verified vulnerability/vendor incident; **E** empirical study/benchmark;
**G** official guidance; **R** reported anecdote.

| Failure | Evidence and signal | Prevention / containment / recovery | Required UI truth |
|---|---|---|---|
| Constraint loss after context compaction | **E:** [ConstraintRot/Governance Decay](https://arxiv.org/abs/2606.22528) reports higher violations after compaction, especially when summaries omit constraints. Compaction without the expected policy hash is a portal signal. | Keep policy outside model context; reassert/verify after context boundaries; pause consequential work if policy state is incomplete. | Policy version/hash, last compaction, whether constraints were rehydrated, explicit pause reason. |
| Indirect prompt injection | **V:** [EchoLeak CVE-2025-32711](https://nvd.nist.gov/vuln/detail/CVE-2025-32711). **E:** [AgentDojo](https://arxiv.org/abs/2406.13352). Signals include imperative external content and unexpected outbound targets. | Label trust zones; keep data separate from instructions; authorize at the tool boundary; DLP/egress controls; revoke exposed credentials. | Source trust badge, attempted instruction, blocked action/destination, remediation. |
| Malicious plugin/skill/MCP | **G:** [NSA MCP security guidance](https://www.nsa.gov/Portals/75/documents/Cybersecurity/CSI_MCP_SECURITY.PDF). Descriptor/hash/permission changes are strong signals. | Signed/pinned registry, manifest-before-execution, sandbox, least privilege, egress allowlist, credential rotation. | Publisher, hash/version, requested permissions, install code/network activity, “behavior changed since approval.” |
| Destructive source action | **V:** [Replit database deletion incident](https://replit.com/blog/doubling-down-on-our-commitment-to-secure-vibe-coding). Bulk writes/deletes and production targets are signals. | Read-only/dry run first; environment separation; exact batch approval; snapshot/checkpoint; independent kill switch. | Object count, target, before/after diff, reversibility, checkpoint, approval state. |
| Stale/replayed/mismatched approval | **V:** OpenClaw advisories including [GHSA-gv46-4xfq-jv58](https://github.com/openclaw/openclaw/security/advisories/GHSA-gv46-4xfq-jv58), [GHSA-2j8v-hwgc-x698](https://github.com/openclaw/openclaw/security/advisories/GHSA-2j8v-hwgc-x698), and [GHSA-xww8-gqvh-92x9](https://github.com/openclaw/openclaw/security/advisories/GHSA-xww8-gqvh-92x9). | Canonicalize and hash exact action; bind identity/target/version/digest/policy; one-time TTL; reapprove on any change. | Full untruncated request, hash, expiry/use state, bindings, prominent reapproval warning. |
| Over-broad OAuth/MCP scopes | **G:** MCP auth spec and NSA guidance. Wildcards, audience mismatch, passthrough, and long-lived tokens are signals. | Per-agent identity; resource scopes; short-lived audience-bound tokens; PKCE; re-consent on drift; revocation. | Exact resources/scopes/audience/expiry, delegated identity, scope-change warning and revoke. |
| Secret/file leakage and SSRF | **V:** OpenClaw advisories such as [GHSA-cv7m-c9jx-vg7q](https://github.com/openclaw/openclaw/security/advisories/GHSA-cv7m-c9jx-vg7q) and [GHSA-wfp2-v9c7-fh79](https://github.com/openclaw/openclaw/security/advisories/GHSA-wfp2-v9c7-fh79). | Workspace roots, canonical paths, secret scanning/redaction, private-address blocking, DNS rebinding defenses, rotation. | Redacted preview, blocked path/destination, secret type, trace ID, suspected vs confirmed exposure. |
| Public dashboard exposure | **V/G:** [Censys exposure survey](https://censys.com/blog/openclaw-in-the-wild-mapping-the-public-exposure-of-a-viral-ai-assistant/) found many internet-reachable instances; exposure is not proof of compromise. | Loopback default, Tailscale/SSH, app auth/TLS, firewall/rate limit, audit after exposure, token rotation. | Bind/reachability, auth/TLS, recent external probes, exposed capabilities, remediation. |
| Runaway loop/cost/DoS | **E:** [AgentDoS at USENIX Security 2026](https://www.usenix.org/conference/usenixsecurity26/presentation/luo), [Guardrail DoS](https://arxiv.org/abs/2606.14517), and loop-failure studies. | Hard token/time/tool/bytes/cost/depth budgets; no-progress detector; circuit breaker outside model; kill and cleanup. | Live budget, projected maximum, repetition warning, breaker state, stop acknowledgement/effectiveness. |
| Drift or misleading completion | **E:** [MAST](https://arxiv.org/abs/2503.13657) and [AgentAbstain](https://agentabstain.github.io/). Signals include skipped plan steps, verifier disagreement, and no provider receipt. | Explicit postconditions; independent verification; abstain on ambiguity; partial/unknown result states. | Distinguish verified, attempted, blocked, not performed, and unknown; show evidence and skipped steps. |
| Duplicate side effect after retry | Timeout after possible execution or repeated action/dedupe key. | Idempotency key for each write; query provider before retry; reconcile unknown outcome; transactional outbox and resource lock. | Provider request ID, retry reason, dedupe result, “unknown—verify before retry.” |
| Multi-agent identity/handoff failure | **E:** MAST; **G:** NSA guidance. Missing origin/scope, conflicting writes, unverified agent, or absent ACK. | Distinct principals; signed/scoped/expiring delegation; schema validation; provenance; conflict locks; bounded retries. | Sender, delegation chain, source objective, scope, handoff status, conflict, verifier identity. |

## Ten non-negotiable safety requirements

1. Durable, versioned constraints outside model context, verified after compaction.
2. Provenance and trust-zone labels on every input, tool, output, and handoff.
3. Least agency by default: read-only first and narrow capabilities.
4. Exact, hashed, one-time, expiring, identity/target/version-bound approvals.
5. Distinct agent/connector identities with short-lived audience-bound credentials and no token
   passthrough.
6. Sandboxed, filesystem/network/process/secret-constrained execution for any untrusted component.
7. Append-only audit containing commands, provenance, policy decisions, identities, receipts,
   effects, retries, and cancellation.
8. Hard budgets, model-independent loop breakers, and an out-of-band kill path.
9. Idempotent/reconciled side effects with explicit unknown outcomes and honest rollback semantics.
10. Success only after authoritative receipts and postconditions; partial, blocked, failed, lost, and
    unknown remain distinct.

## Build versus adopt

Build:

- canonical work/event/request/decision schema;
- adapter capability and source-authority model;
- attention routing and approval UX;
- portal policy vocabulary;
- source command/receipt and offline reconciliation;
- artifact/effect/provenance projections;
- notification routing and product-specific redaction.

Adopt or selectively reuse:

- SQLite and standard migrations;
- T3 auth/connection/Tailscale/event-processing patterns after code audit;
- OpenTelemetry and OTLP for optional diagnostics export;
- OAuth/PKCE/resource-indicator standards at connector boundaries;
- MCP/A2A only through constrained adapters;
- OS keychain/credential store;
- Tailscale Serve/Grants;
- source-native checkpoints, Git, and undo/compensation rather than inventing replacements.

The security posture depends more on honest boundaries and recoverable command semantics than on
adding an impressive stack of governance components.
