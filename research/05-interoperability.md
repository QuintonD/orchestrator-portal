# Interoperability and canonical protocol

> Status: research recommendation, 28 August 2026. Protocol versions must be pinned and
> rechecked before implementation.

## The boundary to preserve

No existing agent protocol should become the portal's internal truth model. The useful standards
solve different parts of the problem:

| Standard | Use it for | Do not treat it as |
| --- | --- | --- |
| [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) | tools, resources, prompts, elicitation, and optional task/UI extensions | a universal agent lifecycle, durable ledger, or authorization policy |
| [A2A 1.0](https://a2a-protocol.org/latest/specification/) | discovering and delegating to independent agents; exchanging task artifacts | a human oversight UI or an exact representation of every runtime |
| [ACP](https://agentclientprotocol.com/protocol/overview) | client/agent sessions, updates, tool calls, terminals, diffs, and source-native permission requests | a cross-runtime outcome ledger or portable policy authority |
| [AP2 v0.2](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md) | future domain-native checkout/payment mandates, Trusted Surface consent, and signed receipts | a generic approval protocol or reason to put payment credentials in the portal |
| [AG-UI](https://docs.ag-ui.com/) | projecting live run state and interrupts into frontends | the canonical event ledger or a dependable replay contract |
| [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) | sandboxed HTML UI supplied by an MCP server | a trusted first-party UI or the same thing as A2UI |
| [A2UI](https://github.com/google/A2UI) | optional declarative UI artifacts | a stable core dependency while the protocol remains in preview |
| [CloudEvents 1.0.2](https://github.com/cloudevents/spec/tree/v1.0.2) | a standard outer event envelope for buses and webhooks | ordering, replay, idempotency, authentication, or delivery guarantees |
| [OpenTelemetry/OTLP](https://opentelemetry.io/docs/specs/otlp/) | traces, metrics, logs, and correlation | product state, command receipts, or proof of a committed effect |
| [JSON-RPC 2.0](https://www.jsonrpc.org/specification) | typed commands over HTTPS or stdio | persistence, retries, ordering, or authorization |
| [SSE](https://html.spec.whatwg.org/dev/server-sent-events.html) / [WebSocket](https://www.rfc-editor.org/rfc/rfc6455) | browser projections and low-latency sessions | durable workflow semantics |

The portal should adopt these at its edges and build only the small amount of semantics that no
one standard owns: capability negotiation, a source-preserving event projection, idempotent
commands and receipts, cursor/replay behavior, artifact manifests, and provenance links.

## Minimal adapter contract

Every runtime adapter should implement this conceptual interface:

```text
describe() -> CapabilityDocument

start(command, idempotencyKey, context)
  -> Accepted | Completed | NeedsInput

attach(runId, cursor?)
  -> ordered Event stream | SnapshotRequired

sendInput(runId, input, idempotencyKey) -> Receipt
cancel(runId, mode) -> Receipt
get(runId, view/cursor?) -> Snapshot
getArtifact(artifactRef) -> metadata/bytes
verifyReceipt(receipt) -> verification result
```

An adapter may be backed by MCP, A2A, AG-UI, a native API, a subprocess, or webhooks. The adapter
must preserve the source protocol, native identifiers, event type, checkpoint/cursor, and raw
payload. If canonicalization drops information, it must emit a `lossiness` or
`projectionWarnings` field rather than silently flattening the source.

## Capability negotiation

Use a versioned capability document and negotiate the intersection. Unknown capabilities should
be URI-keyed extensions, not additions to an ever-growing universal enum.

```json
{
  "schemaVersion": "work.capabilities.v1",
  "agent": {
    "id": "agent://provider/instance",
    "name": "example",
    "version": "1.2.3"
  },
  "protocols": [
    {
      "name": "control",
      "versions": ["work.v1"],
      "bindings": ["https-jsonrpc", "stdio-jsonrpc"]
    },
    {
      "name": "events",
      "versions": ["work.v1"],
      "bindings": ["sse", "websocket", "cloudevents-http", "webhook"]
    },
    {
      "name": "mcp",
      "versions": ["2026-07-28"],
      "extensions": ["io.modelcontextprotocol/tasks", "io.modelcontextprotocol/ui"]
    },
    {
      "name": "a2a",
      "versions": ["1.0"],
      "features": ["streaming", "pushNotifications", "artifacts"]
    }
  ],
  "features": {
    "commands": ["run.start", "run.cancel", "run.resume", "run.input"],
    "events": ["snapshot", "delta", "progress", "approval.requested"],
    "replay": { "supports": true, "retentionMs": 86400000 },
    "idempotency": { "required": true }
  },
  "auth": {
    "schemes": ["oauth2", "mtls", "spiffe"],
    "scopes": ["work.run"]
  },
  "extensions": {}
}
```

Capabilities must distinguish required, optional, and forbidden support. The portal must never
silently assume A2A streaming, MCP Tasks, AG-UI resumability, or an A2UI component catalog.

## Canonical event projection

Use CloudEvents as an outer envelope, with a small and stable product vocabulary:

- `work.run.started`, `work.run.progressed`, `work.run.completed`, `work.run.failed`
- `work.run.cancel_requested`, `work.run.cancelled`
- `work.input.requested`, `work.input.supplied`
- `work.approval.requested`, `work.approval.decided`
- `work.message`, `work.tool.called`, `work.tool.result`
- `work.artifact.created`, `work.artifact.updated`
- `work.snapshot`

```json
{
  "specversion": "1.0",
  "id": "evt_123",
  "source": "agent://provider/instance",
  "type": "work.run.started",
  "time": "2026-08-28T12:00:00Z",
  "subject": "run/run_123",
  "datacontenttype": "application/json",
  "dataschema": "https://example.org/work/v1/event",
  "data": {
    "schema": "work.v1",
    "runId": "run_123",
    "seq": 42,
    "cursor": { "stream": "run_123", "position": "42", "epoch": "e1" },
    "causationId": "cmd_123",
    "correlationId": "corr_123",
    "actor": {
      "agent": "spiffe://trust.example/agent/foo",
      "principal": "user/sub",
      "delegation": [],
      "authz": {
        "decision": "allow",
        "scopes": ["work.run"],
        "expiresAt": "2026-08-28T13:00:00Z"
      }
    },
    "payload": {},
    "artifacts": [],
    "sourceNative": {
      "protocol": "langgraph",
      "eventType": "updates",
      "sourceCursor": "source-sequence-or-checkpoint",
      "raw": {}
    },
    "trace": { "traceparent": "00-...", "spanId": "..." }
  }
}
```

Prompts, completions, secrets, chain-of-thought, and large binaries should not be copied into this
envelope by default. Keep sensitive content opt-in and refer to artifacts with explicit access
controls.

## Commands and receipts

A control request and its downstream effect are different facts. Commands therefore need stable
idempotency keys, and receipts must distinguish acceptance from commitment.

```json
{
  "commandId": "cmd_123",
  "kind": "run.start",
  "attempt": 1,
  "idempotencyKey": "stable-client-key",
  "expectedVersion": null,
  "deadline": "2026-08-28T12:05:00Z",
  "requestedBy": {
    "principal": "user/sub",
    "agent": "spiffe://trust.example/agent/controller"
  },
  "input": {}
}
```

```json
{
  "receiptId": "rcpt_123",
  "commandId": "cmd_123",
  "status": "accepted",
  "committed": false,
  "runId": "run_123",
  "operationId": "native-operation-id",
  "retryable": true,
  "nextCursor": "run_123:e1:42",
  "sourceNative": { "protocol": "a2a", "id": "task-native-id" }
}
```

Required semantics:

- `committed` is `true`, `false`, or `unknown`; acceptance is never represented as proof of effect.
- Retrying an idempotency key returns the same logical receipt or an explicit `unknown` result.
- `operationId` names source-native work; `commandId` names the portal request.
- Cancellation is cooperative. Emit `cancel_requested` immediately and terminal `cancelled` only
  after the source runtime confirms it.
- Input and approval requests carry a request ID, JSON Schema, expiry, sensitivity class, and
  allowed response channels.

## Cursor and replay semantics

- Each replayable stream has a monotonic per-stream sequence, globally unique event IDs, and an
  opaque `{stream, sequence, epoch}` cursor.
- Expose `snapshot(cursor)` and `events_after(cursor)`.
- An expired or wrong-epoch cursor produces `cursor_invalid` or `snapshot_required`; it never
  silently restarts or re-executes work.
- SSE maps the cursor to `id` and `Last-Event-ID`; WebSocket uses an explicit resume message.
- Webhooks are at-least-once. Receivers deduplicate on event ID and handlers are idempotent.
- Replay means redelivery only, never side-effecting re-execution.
- Deltas identify their base sequence and preferably a state/content hash.
- Cross-stream relationships use causation, correlation, and trace links rather than a fabricated
  global order.

This layer is necessary because current MCP Tasks subscriptions do not promise historical replay,
and AG-UI has a documented [resumability gap](https://github.com/ag-ui-protocol/ag-ui/issues/2105).

## Artifact and provenance representation

Artifacts should be immutable and preferably content-addressed:

```json
{
  "artifactId": "art_123",
  "uri": "artifact://sha256/...",
  "mediaType": "application/json",
  "size": 1234,
  "sha256": "...",
  "producer": { "agent": "agent://provider/instance", "runId": "run_123" },
  "parentArtifactIds": ["art_100"],
  "sensitivity": "private",
  "access": { "scopes": ["artifact.read"] },
  "sourceNative": { "protocol": "openhands", "id": "native-output-id" }
}
```

Use A2A's Artifact/Part concepts for interchange, but keep the portal manifest independent. Model
lineage with [W3C PROV](https://www.w3.org/TR/prov-dm/) concepts such as `wasGeneratedBy`,
`wasDerivedFrom`, `used`, and `wasAssociatedWith`. Link each artifact to its command, run, agent
identity, delegation chain, signature, and trace.

## Identity and authorization

- Use OAuth/OIDC for people and remote clients. For remote MCP, follow its current authorization
  profile, including protected-resource metadata and resource indicators.
- [SPIFFE](https://spiffe.io/docs/latest/spiffe-specs/) is appropriate for runtime/workload identity,
  but it does not express the human principal, delegation, or policy decision.
- Carry principal, delegation chain, audience/resource, scopes, expiry, and decision with every
  privileged command.
- [AuthZEN 1.0](https://openid.net/specs/authorization-api-1_0.html) is suitable where the gateway
  delegates authorization decisions.
- Keep emerging agent-identity drafts behind an adapter. Do not bake WIMSE, AIP, or AI-Auth drafts
  into stored event schemas yet.

## Runtime mapping notes

- **T3 Code:** model provider, session, and process identity separately; preserve provider-native
  events and subprocess/MCP details.
- **OpenClaw:** retain channel, conversation, plugin, and native action semantics. Treat community
  A2A bridges as adapters, not native truth.
- **OpenHands:** map action/observation lifecycle while retaining complete native events and action
  source. Never expose hidden reasoning as oversight data.
- **LangGraph:** preserve `thread_id`, subgraph namespace, source sequence, checkpoint/version, and
  resume commands. Its source sequence is not a global order.
- **n8n:** preserve workflow, execution, node-run index, trigger/webhook identity, and output data.
- **Generic runtime:** accept any useful combination of A2A, MCP, AG-UI, SSE, WebSocket, and webhook,
  with the canonical adapter as the fallback.

## Interoperability traps

1. MCP 2026 differs materially from 2025-era session assumptions; Tasks is now an extension.
2. MCP Tasks and A2A Tasks have different state, ID, operation, and artifact semantics.
3. ACP permission options remain source-session/tool-call decisions; they do not grant the portal a
   universal approval or policy model.
4. MCP Apps is sandboxed HTML/postMessage; A2UI is declarative native-component data.
5. A2A push and webhooks can duplicate deliveries.
6. AG-UI is a projection protocol, not a reliable history store.
7. A2UI has active version skew and must be negotiated.
8. OpenTelemetry GenAI conventions are still marked Development.
9. An OTLP acknowledgement is hop-level, and retry can duplicate observations.
10. CloudEvents standardizes shape, not behavior.
11. SPIFFE identifies a workload, not the person who delegated authority to it.
12. Financial mandates and receipts must remain domain-native; a Boolean portal approval is not a
    substitute for AP2-style checkout/payment binding, settlement, refund, or dispute evidence.
13. Flattening native checkpoints, node executions, actions, or artifacts into generic tool calls
    destroys exactly the recovery evidence an oversight portal needs.

## Recommendation

Adopt the stable edge standards; build the thin canonical layer above; preserve native data below.
Keep AP2 and comparable consequential-domain protocols behind future adapters until their authority
and liability model is explicitly in scope.
The portal should be opinionated about human attention, authority, evidence, and recovery, while
remaining deliberately unopinionated about how an assistant thinks or executes.
