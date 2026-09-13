# Phone-control source SDK and task checkpoints

The source runtime owns planning, model calls, execution and task history. The
phone-control package supplies typed libraries for that runtime; neither the
broker nor the portal executes model code. Use the reviewed isolated deployment
for untrusted source code. Importing this SDK into an unrestricted owner process
does not isolate that process or restrict its other tools.

## Provision the broker identity and executor lease

`init` creates `broker-signing.pem` and `broker-public.pem`. The owner provisions
only the public key and the scoped credential into the source. For an existing
configuration, stop the broker and run `broker-identity --config PATH` once.
That command refuses partial identities and does not rotate existing keys.

Supply the public PEM as `brokerPublicKey` to `PhonePilot`/`createClient`, or use
`--broker-public-key-file PATH` / `PHONE_CONTROL_BROKER_PUBLIC_KEY` (raw PEM) for
the CLI and MCP. The pin must come from the owner's trusted provisioning channel;
never accept a replacement key from an HTTP response. Every response is checked
against a fresh request nonce, HTTP method, route, exact request bytes, status and
exact response bytes before accepting its contents. The signature does not
encrypt the channel or prevent disclosure of the bearer token to an impostor
endpoint; deployment must protect the scoped channel as well.

Requests require a pin. Emergency Stop can still be attempted without one, but
its unsigned response remains unconfirmed. A broker-signed, request-bound
`dispatch.state: not_dispatched` rejection can preserve a definite error such as
`scope_forbidden`. An arbitrary HTTP 4xx, forged HTTP 200 receipt, altered body,
replayed signature or transport failure cannot establish non-dispatch.

Acquire a bounded executor lease before UI mutations. Each lease belongs to the
source credential, device and session, lasts at most 300 seconds and allows at
most 100 action attempts. All mutations except Stop require its `taskId`. The
lease serializes workflows; it is not a document, recipient or effect grant.
Generic UI actions still require native consent and existing app/operation scope.
Observe after acquisition because the handoff invalidates older observations.

```js
import { readFileSync } from 'node:fs';
import { PhonePilot, selectNode } from '@orchestrator/phone-control/pilot';
import { SourcePhoneTask } from '@orchestrator/phone-control/task';

const phone = new PhonePilot({
  secret: process.env.PHONE_CONTROL_TOKEN,
  brokerPublicKey: readFileSync('/source/broker-public.pem', 'utf8'),
  deviceId: 'phone',
  sessionId: process.env.PHONE_SESSION_ID,
  budget: { maxActions: 5, maxObservations: 20, timeoutMs: 120_000 },
});
await phone.acquireTask({ ttlSeconds: 120, maxActions: 5 });

// The source creates a private checkpoint directory before constructing the task.
// Reusing an existing checkpoint is deliberately refused.
const task = new SourcePhoneTask({
  pilot: phone,
  checkpointFile: '/source/private/task-unique-id.json',
  budget: { timeoutMs: 120_000, maxModelCalls: 3, maxModelTokens: 6000 },
  onEvent: (event) => sourceEvents.publish(event),
});
const view = await task.observe();
const control = selectNode(view, { resourceId: 'com.example.app:id/next', enabled: true });
const receipt = await task.act('node.click', { nodeId: control.id });
if (receipt.status !== 'completed') {
  task.handoff('owner_decision');
} else {
  task.finish(); // awaiting_verification, independentlyVerified: false
  await phone.releaseTask();
}
```

`sourceEvents` represents the source runtime's own event sink. Events emitted by
this helper are labelled `source_reported`. `action_requested` means the helper
has saved an intent; it does not assert that a biometric prompt is visible.
The helper does not observe native pending-consent state. The broker's completed
lease status means execution authority was released, not that the task succeeded.

## Recovery, cancellation and budgets

`waitFor(selector, options)` repeats fresh semantic observations within explicit
time, read-count and stability limits. Its defaults are a 10-second timeout,
10 total reads, a 400 ms interval, two consecutive identical unique matches and
at most two transient read failures. The retry allowlist is broker unavailability,
device busy, screenshot geometry/window/display changes, screenshot rate limiting
and screenshot timeout. Set `maxTransientFailures: 0` to disable recovery.

Every failed read consumes the same read and time budgets as a successful read.
A transient failure resets consecutive matching. Successful results include
`recoveries`, with each failed attempt number and a fixed code. Protected-window,
device-lock, permission, session and malformed-response failures terminate the
wait. Recovery never enables pixels, changes a target binding or resends a
mutation. Exact selectors reject ambiguity.

`observe`, `waitFor` and `act` accept an `AbortSignal`. Cancelling a sent mutation
leaves its outcome unknown. `PhonePilot` also enforces aggregate action-attempt,
observation-attempt and monotonic time budgets across calls. Stop bypasses those
budgets and the ordinary operation lock; an in-flight OS gesture may still finish.

`SourcePhoneTask.model({maxTokens, maxCostMicros}, invoke)` reserves worst-case
usage before invoking the source's provider adapter. Reservations are not refunded
on failure and the helper never retries the call. The adapter must honor its
supplied signal and output/cost limits. These are cooperative source-library
budgets, not independently enforced provider spend limits. Arbitrary source code
could bypass the library; deployment and provider controls remain necessary.

## Checkpoint and outcome semantics

The helper writes and flushes an atomic, private checkpoint before each action,
including its request ID, method and pending status. It records no screen data,
action parameters, credentials, model prompts or model outputs. Checkpoint write
failure stops ordinary execution. `cancel()` still attempts Stop if checkpoint
storage is unavailable, and reports `checkpointPersisted` separately.

An existing checkpoint cannot start execution, including one left after a clean
finish. `readTaskCheckpoint` validates metadata, and `inspectTaskCheckpoint` reads
the broker's mutation receipts without resending actions. `PhonePilot.actionStatus`
is intentionally limited to mutation receipts. All reconciliation reports retain
`resumeAllowed: false`. Not-found, expired or unavailable evidence remains
unconfirmed. A new read, a signed completed dispatch receipt, or a source assertion
cannot clear `PhonePilot.uncertain`.

After interruption, retain the old checkpoint and hand off for reconciliation.
Starting a new task requires fresh owner/session authority and a new checkpoint
file; do not transplant or replay the old inputs. `finish()` reports only
`awaiting_verification`, with `independentlyVerified: false`. This package supplies
no independent document-persistence verifier. A production verifier must have
identified criteria and evidence outside the source's write authority.

CLI equivalents are `tasks-create`, `tasks-get --id ID`, `tasks-release --id ID`
and `receipt-status --id REQUEST_ID`. Method commands take `--task TASK_ID`; raw
`call` input includes `taskId`. MCP exposes `phone_task_acquire`,
`phone_task_status`, `phone_task_release` and `phone_receipt_status` beside
`phone_state` and `phone_call`. These interfaces cannot create owner grants or
resume an uncertain task.
