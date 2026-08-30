# T3 Code reuse audit

## Audit basis

The audit inspected the [T3 Code repository](https://github.com/pingdotgg/t3code) at commit
`018d7f2775daabd2ef07898af29586915a0b7f67` on 28 August 2026. It was a read-only code audit; the
app was not run and the working tree was not modified.

T3 Code is a strong architectural reference, but a full fork is the wrong default for this portal.
The recommended approach is:

> Build an independent, portal-neutral domain boundary; selectively reuse small pure contracts,
> reducers, and utilities; adapt the event/receipt/reconnect patterns; do not inherit T3's complete
> product surface.

## Why not a full fork

T3's generic-looking infrastructure is deliberately optimized for coding-agent sessions. A fork
would also inherit provider CLIs, Git workspaces, T3 Connect/relay behavior, Clerk, Electron, Expo,
mobile notifications, update infrastructure, SSH bootstrap, and provider-specific usage parsing.
Those are assets for a T3-derived coding product and liabilities for a runtime-neutral personal
attention layer.

| Strategy | Advantage | Cost | Verdict |
| --- | --- | --- | --- |
| Full fork | fastest route to preserve all current T3 behavior and integrations | large inherited product/schema/deployment surface; continuing upstream merge burden | only if intentionally building a T3-derived coding client |
| Selective extraction | best leverage from tested pure modules and small utilities | hidden imports and semantic coupling must be removed | use for carefully audited MIT-licensed pieces |
| Independent neutral implementation | clean domain, simple local-first auth, no cloud/native/provider inheritance | reimplements proven event, projection, reconnect, and attention behavior | recommended foundation, using T3 as a design and test reference |

## High-value patterns

T3 is particularly good reference material for:

- typed Effect contracts and RPC;
- event-sourced orchestration with deterministic projections;
- transactional command receipts;
- reconnecting multi-environment client state;
- capability-scoped authorization;
- thread attention and settled/unsettled reducers;
- provider activity normalization;
- hidden Git checkpoints, diffs, and recovery;
- local, SSH, relay, and Tailscale placement behind a shared client model.

The portal should reuse these ideas while changing the primary nouns from repository/thread/turn to
objective/work item/run/exception/outcome.

## Code-level reuse map

| Area | Inspected source | Assessment |
| --- | --- | --- |
| Contract package | `packages/contracts/src`, 55 files; about 15.8k production LOC | strong schema patterns; split aggressively |
| RPC contract | `packages/contracts/src/rpc.ts`, about 1.1k LOC and roughly 100 methods | too monolithic; define 8–12 portal methods first |
| Orchestration contract | `packages/contracts/src/orchestration.ts`, about 1.8k LOC | reuse lifecycle/event concepts, remove project/Git/provider assumptions |
| Provider runtime | `packages/contracts/src/providerRuntime.ts`, about 1.2k LOC | adapt only activity, task, and usage concepts behind neutral adapters |
| Auth contract | `packages/contracts/src/auth.ts`, 355 LOC | scope model useful; pairing/session details need a portal threat model |
| Server orchestration | `apps/server/src/orchestration`, about 14.5k production LOC plus about 20k test LOC | excellent architecture, high coupling |
| Event store and receipts | `OrchestrationEventStore.ts`, `OrchestrationCommandReceipts.ts` | good small extraction candidates after replacing schemas/config |
| Event engine | `OrchestrationEngine.ts`, 375 LOC | strong append/receipt/transaction pattern; depends on T3's Effect/SQL layers |
| Projection pipeline | `ProjectionPipeline.ts`, about 1.8k LOC | reference only; coupled to nine projections, attachments, files, and migrations |
| Snapshot query | `ProjectionSnapshotQuery.ts`, about 2.9k LOC | not a selective-copy candidate; read model is T3-shaped |
| Persistence | `apps/server/src/persistence`, 75 production files; about 6.8k LOC | do not import its 43-migration schema into the portal |
| Client runtime | `packages/client-runtime/src`, about 17.7k production LOC and 16.4k test LOC | extract by submodule, never wholesale |
| Connection runtime | `connection/{model,catalog,resolver,driver,registry,supervisor,onboarding}.ts` | valuable reconnect design; first implement one local driver |
| RPC client | `rpc/{session,client,http}.ts` | clean session abstraction, suitable reference |
| Client state | `state/{threadReducer,threadSettled,threadDetail,entities,models}.ts` | best immediate pure extraction candidates |
| Tailscale helper | `packages/tailscale/src/tailscale.ts`, 404 LOC | small and relatively isolated; still depends on a process platform |
| SSH | `packages/ssh/src`, about 2.5k production LOC | reusable but assumes T3 remote bootstrap/pairing; defer |
| Desktop app | `apps/desktop/src`, about 24.4k production LOC | do not extract wholesale |
| Mobile app | `apps/mobile/src`, about 63.9k production LOC | do not extract wholesale |
| Agent awareness | `packages/shared/src/agentAwareness.ts`, 152 LOC | strong pure candidate for phase/deep-link projection |
| Subagent state | `client-runtime/src/state/subagentRuntime.ts`, 941 LOC | mostly pure; adapt subagent vocabulary to neutral run/job concepts |
| Git checkpoints | `CheckpointStore.ts`, `CheckpointDiffQuery.ts`, `Diffs.ts` | valuable only for Git-backed workspaces |
| Artifact/attachment code | `AssetAccess.ts`, `AttachmentUpload.ts`, `attachmentStore.ts` | security-sensitive and workspace-specific; design neutral artifact auth first |
| Usage helpers | `usageAggregation.ts`, `usagePricing.ts`, `usageMerge.ts`, `usageFormat.ts` | reusable after removing fixed provider types; transcript readers are provider-specific |

LOC counts are navigation aids, not estimates of reuse effort.

## Coupling that is easy to miss

### Orchestration

The orchestration engine depends on `@t3tools/contracts`, Effect SQL/Queue/PubSub/Stream/Clock/Crypto,
the durable event and receipt stores, decider/projector logic, projection layers, configuration, and
server identity. `ProjectionPipeline` and `ProjectionSnapshotQuery` encode T3's SQL schema,
attachments, thread/project models, background liveness, plans, approvals, and search/pagination.
Copying the engine without its surroundings is not a shortcut.

### Client connection runtime

The client boundary is cleaner, but it expects platform implementations for network and app
lifecycle, credential storage, environment/catalog persistence, cache, device identity, and
optional SSH. This is a useful architecture for the portal if the first version supplies exactly
one host-local environment driver.

### Authorization

T3's auth implementation spans browser sessions, bearer exchange, DPoP, short-lived WebSocket
tickets, pairing grants, persisted sessions, scopes, secrets, and SQLite. Its current scopes include
orchestration read/operate, terminal operate, review write, access read/write, and relay read/write.

Reuse the capability vocabulary, not the complete flow. Begin with authenticated local sessions and
separate `read` and `operate` scopes. Add remote pairing, DPoP, and relay only after threat-model and
protocol testing.

### Attention lifecycle

The most reusable client pieces are `threadSettled.ts`, `threadReducer.ts`, `threadDetail.ts`, and
`agentAwareness.ts`. They model running, waiting, snoozed, pinned, active-list visibility,
activities, messages, and checkpoints. The authoritative server rules, however, are distributed
across the decider, projector, thread projection, and migrations. Copying only the reducer could
make the browser disagree with durable state.

## Proposed extraction sequence

1. **Define a neutral contract package.** Use workspace, objective, work item, run, activity,
   exception, approval, artifact, checkpoint, outcome, and usage. Keep runtime/provider IDs inside
   adapter metadata.
2. **Adapt pure domain/client logic.** Start with entity models, settled/detail reducers,
   awareness phases, and usage formatting. Replace “subagent” with neutral job/run semantics.
3. **Implement the smallest event store.** Adapt the event-store/receipt pattern to a new SQLite
   schema and one projection; do not import T3 migrations.
4. **Write a neutral decider/projector and replay tests.** Prove deterministic replay and
   idempotent commands before building UI depth.
5. **Add local RPC and one connection driver.** Use T3's session and supervisor behavior as a test
   oracle for reconnect, cache, and stale-state handling.
6. **Add local auth and scopes.** Read and operate are distinct. Remote access comes later.
7. **Add optional capabilities one at a time.** Tailscale, Git checkpointing, artifacts, usage, and
   SSH only after their owning domain/security contract exists.
8. **Treat desktop and mobile as platform adapters.** Do not port the entire Electron or Expo apps.

## Two-to-three-day technical spike

This spike tests portability; it is not the MVP.

### Day 1: model and persistence

- Define minimal schemas for objective, work item, run, activity, exception, approval, and artifact.
- Define 8–12 RPC methods.
- Implement SQLite append/read, one projector, and command receipts.
- Add a deterministic fake runtime.

Acceptance criteria:

- replay produces the identical read model;
- duplicate command IDs produce one receipt and no duplicate events;
- provider-specific types do not cross the contract boundary;
- the core has no React, Electron, Expo, or provider SDK import.

### Day 2: local connection and attention state

- Implement authenticated local WebSocket RPC.
- Add one environment driver with reconnect supervision.
- Cache list/detail projections and apply live events.
- Exercise running, input/approval wait, completion, failure, snooze, and settled transitions.

Acceptance criteria:

- the client reconnects after server restart;
- cached state remains legible offline and is visibly marked stale;
- live events safely supersede stale cache;
- unauthorized methods fail by scope;
- the fake run traverses every attention state without UI/server disagreement.

### Day 3: one optional probe

Choose only one: Tailscale Serve diagnostics, a Git checkpoint/diff, content-addressed artifact
access, or provider-neutral usage aggregation. The go/no-go output is a measured boundary between
portable logic and T3-specific behavior.

## Main reuse risks

- importing `rpc.ts` creates broad schema lock-in;
- importing orchestration pulls the projection/migration system behind it;
- test LOC nearly matches client production LOC, which signals meaningful hidden behavior;
- auth needs independent security review;
- relay, Clerk, Cloudflare, Electron, Expo, and update paths are deployment-specific;
- SSH assumes T3 server bootstrap and pairing;
- Git checkpointing assumes worktrees and hidden refs;
- attachment signing and path validation are security-sensitive;
- usage readers assume provider-specific transcript formats and home-directory layouts.

## License and attribution

The inspected repository root is MIT licensed, copyright 2026 T3 Tools Inc. If substantial source is
copied, preserve the complete MIT notice, name the repository, inspected commit, paths, and
modifications in `THIRD_PARTY_NOTICES.md`, and audit transitive dependencies separately. An
independent implementation of architectural ideas should still acknowledge T3 as a design
inspiration. This is an engineering recommendation, not legal advice.
