# Orchestrator Phone Control

Orchestrator Phone Control — created by the Orchestrator contributors.
https://github.com/QuintonD/orchestrator-portal

An independent, local Android control broker, console client and MCP stdio adapter.
This component is **0.1.0-alpha.1**. Its native companion is in
`apps/phone-android`. The broker does not import the portal or own source planning.
An optional isolated launcher executes source-owned code inside a container.
Node.js 24 or newer is required. There are no npm dependencies.

Original material is licensed **AGPL-3.0-only**, with the attribution preservation
term in [ATTRIBUTION.md](ATTRIBUTION.md). Read [LICENSE](LICENSE) and
[NOTICE](NOTICE). No warranty is provided. The Apache-2.0 portal integrates through
HTTP; this directory deliberately sits outside the portal's npm workspaces.

## What is authorized

The owner establishes an app and operation allowlist on the phone, starts its
visible ten-minute local session, and separately creates a broker session and
scoped source credentials. Effective permission is the intersection of the
phone policy, broker session, and authenticated credential. Exact Android package
names are required; wildcards, self-grants and caller-supplied identity or policy
fields are rejected.

`observe` permission explicitly shares the allowed foreground app's screen text
and accessibility tree with that credential's holder. Screenshots are denied by
default and require the phone's separate pixel grant, `disclosure.screenshots:
true` on both the broker session and source credential, and
`includeScreenshot: true` on that request. Grant observation only when
that data may be shared with the receiving runtime and its configured models.
An app allowlist cannot classify every sensitive item inside an otherwise allowed
app. Screen contents, descriptions and app labels remain untrusted input; they
cannot grant permissions or override the tool policy.

Generic launches, gestures, typing, element clicks and navigation require a
separate strong biometric confirmation on the phone for each mutation. The sole
unattended mutation is `fixture.increment`, which the companion restricts to its
own cryptographically pinned, harmless counter fixture and a separate local
operation grant. Its successful dispatch is checked with a new observation.
This is a bounded delegation proof. It does not establish unattended authority
over arbitrary applications or consequential actions. Every mutation except
Stop also requires a bounded executor task lease. Acquire it before observing the
target for a mutation: acquisition invalidates previous observations. The lease
serializes execution; it does not authorize a document, recipient or effect.

## Owner setup

Build/install and enable the native companion according to the
[companion setup](../../apps/phone-android/README.md). Choose allowed apps,
operations and any separate screenshot disclosure on the phone,
enable notifications, and start its visible session. A strong enrolled biometric
is required for generic mutations. Keep the phone awake and unlocked.

Run these commands from the repository root. `init` creates a dedicated private
directory; it refuses a nonempty directory or a symlink before changing permissions.

```powershell
node components/phone-control/bin/phone-control.mjs init
```

The default directory is `$HOME/.orchestrator-phone-control`. Initialization prints
only the config and admin-token **file paths**, never the token. POSIX files use
0600 and directories 0700. Windows setup removes inherited access, grants the
current account access and explicitly assigns it ownership, including when an
elevated token defaults new objects to the Administrators group. It then verifies
the owner and ACL using Windows PowerShell's built-in Security module, independently
of the parent shell's module search path. Configuration loading refuses accessible
private files, symlinks and invalid ciphertext.

Initialization also creates the private Ed25519 signing key `broker-signing.pem`
and public pin `broker-public.pem`. Provision only the public pin to clients,
through the owner's trusted channel. Set it in each owner/source terminal:

```powershell
$env:PHONE_CONTROL_BROKER_PUBLIC_KEY = Get-Content -Raw -LiteralPath "$HOME/.orchestrator-phone-control/broker-public.pem"
```

Alternatively pass `--broker-public-key-file PATH` on each online CLI command.
Every broker response is verified against that pin, a fresh nonce, the method,
route, exact request bytes, HTTP status and exact response bytes before its
contents are accepted. A response cannot supply its own trusted replacement key.
The signature authenticates the reply; it does not encrypt the scoped channel.
Emergency Stop can be attempted without a pin, but its result stays unconfirmed.

For an existing configuration without signing files, stop the broker and run:

```powershell
node components/phone-control/bin/phone-control.mjs broker-identity --config "$HOME/.orchestrator-phone-control/config.json"
```

This offline migration creates a missing identity, refuses partial/damaged
identities and never rotates an existing key implicitly. Provision its public
pin and restart the broker; restart still requires fresh session authority.

Manually forward the **explicitly selected device**. The broker never runs ADB:

```powershell
adb -s SERIAL forward tcp:8837 tcp:8837
```

Copy the session token shown on the phone into `native.token` inside the private
directory using a local editor. Do not place it in shell arguments, a chat,
clipboard history, repository files, an agent's workspace, or source-control
configuration. Then register the device and start the broker:

```powershell
node components/phone-control/bin/phone-control.mjs device-add --id phone --label Phone --native-port 8837 --native-token-file "$HOME/.orchestrator-phone-control/native.token"
node components/phone-control/bin/phone-control.mjs serve
```

The broker binds **127.0.0.1:4421**. Custom config and port are available through
`init --dir ... --port ...` and `serve --config ...`; the portal integration uses
the fixed default origin. Device forwarding ports must be local numeric ports.
There is no arbitrary URL, shell, ADB, script, file-read or code-execution RPC.

The native token rotates every time a phone session starts. When it expires or
the phone stops access, stop the broker, replace the private `native.token` file,
then update it and restart:

```powershell
node components/phone-control/bin/phone-control.mjs device-token-update --id phone --native-token-file "$HOME/.orchestrator-phone-control/native.token"
node components/phone-control/bin/phone-control.mjs serve
```

Token updates require the broker to be stopped and revoke its previous sessions
for that device. A process lock prevents simultaneous owner updates and broker
writes. Stale locks are removed only after their recorded process no longer
exists. Never remove a live broker's lock to bypass this check. A new token,
native session and broker session are required after stopping the phone. A graceful
broker shutdown attempts native stop for its active device sessions. A forced
process termination cannot promise delivery; use the phone's local Stop control
and reconcile any interrupted action. Broker startup durably revokes every prior
broker session and quarantines devices with a previously active session. An
acknowledged owner Stop, fresh phone grant/token and new broker session are
required to resume input. Startup fails if this revocation cannot be saved.

## Sessions and source credentials

Use a second owner terminal and provision `PHONE_CONTROL_BROKER_PUBLIC_KEY` there
as above. Substitute actual allowed package names. Input JSON can be piped to the
CLI or read from an owner-only `--input-file`:

```powershell
'{"deviceId":"phone","apps":["com.example.app"],"operations":["describe","observe","node.click","node.scroll","type","stop"],"disclosure":{"screenshots":false},"ttlSeconds":600}' | node components/phone-control/bin/phone-control.mjs sessions-create --token-file "$HOME/.orchestrator-phone-control/admin.token"

'{"label":"source-a","devices":["phone"],"sessionIds":["SESSION_ID"],"apps":["com.example.app"],"operations":["describe","observe","node.click","node.scroll","type","stop"],"disclosure":{"screenshots":false},"ttlSeconds":600}' | node components/phone-control/bin/phone-control.mjs credentials-create --token-file "$HOME/.orchestrator-phone-control/admin.token" --out-token "$HOME/.orchestrator-phone-control/source-a.token"
```

Replace `SESSION_ID` with the returned session ID before creating the credential.
The examples keep pixel disclosure off. Omitted disclosure fields also deny
pixels, including on existing grants. Credential creation writes the newly issued
token once to a new private file and prints only metadata and its file path. The
destination parent must already be private; existing files are never overwritten.
If token storage fails after issuance, the CLI attempts revocation and reports
the credential ID and revocation result. List and revoke any unresolved grant.
Each source gets a different credential. Credentials expire after at most 24 hours;
broker sessions after at most one hour, and the phone's ten-minute session is an
additional upper bound. There is no refresh token or automatic scope renewal.

For a task-specific delegate, include `"sessionIds":["SESSION_ID"]` in credential
creation. The optional nonempty list contains at most 256 distinct, current
session IDs on the granted devices. Such a credential can discover and use only
those sessions, including for Stop; creating a later matching session does not
extend its authority. Existing grants without `sessionIds` retain device/app/
operation scope across sessions. Prefer explicit session binding for new agents.

Do not give a source the admin or native token, encryption key, private config
directory, ADB, or shell authority over the broker account. If a runtime uses a
different OS account, deliver only its scoped token through its secret mechanism
or an owner-only file in that account. The receiving process can use
`PHONE_CONTROL_TOKEN` or `--token-file`. Token arguments are unsupported.

Equivalent owner commands are `credentials-list`, `credentials-revoke --id ID`,
`sessions-revoke --id ID`, `device-stop --device phone`, `state` and `audit`.
They use the same HTTP management routes as the portal. Session revocation stops
the companion's device-wide session and therefore revokes every broker session on
that device. Revoking an idle credential leaves other credentials active; revoking
an in-flight credential also stops and revokes its affected device sessions.

## Console control

Use the source token, session ID and trusted public pin from setup. For a UI
mutation workflow, acquire the lease first, then obtain a fresh observation:

```powershell
$env:PHONE_CONTROL_BROKER_PUBLIC_KEY = Get-Content -Raw -LiteralPath PATH_TO_BROKER_PUBLIC_PEM
node components/phone-control/bin/phone-control.mjs state --token-file PATH_TO_SCOPED_TOKEN
'{"deviceId":"phone","sessionId":"SESSION_ID","ttlSeconds":60,"maxActions":5}' | node components/phone-control/bin/phone-control.mjs tasks-create --token-file PATH_TO_SCOPED_TOKEN
node components/phone-control/bin/phone-control.mjs observe --device phone --session SESSION_ID --token-file PATH_TO_SCOPED_TOKEN
node components/phone-control/bin/phone-control.mjs node-click --device phone --session SESSION_ID --task TASK_ID --observation OBSERVATION_ID --node NODE_ID --request-id UNIQUE_ACTION_ID --token-file PATH_TO_SCOPED_TOKEN
```

Use the returned `TASK_ID`. A lease belongs to one credential, device and session,
lasts at most 300 seconds and permits at most 100 mutation attempts. Only one
executor lease is active per device. Read-only observation does not require a
lease; observation before lease acquisition cannot authorize the next mutation.
Stop bypasses the lease and ordinary budgets.

Add `--screenshot` only when all three owner/session/credential pixel grants allow
sharing. Use `--output PRIVATE_FILE`
to save a response without printing screen data. A `completed` response means the
native dispatch call completed; `result.status: "dispatched"` is **not** proof
that an external transaction completed. Observe again to inspect the visible
result. This component has no independent outcome verifier; a screenshot or
assistant prose cannot establish persisted document or transaction success.

Use `tasks-get --id TASK_ID`, `tasks-release --id TASK_ID`, and
`receipt-status --id REQUEST_ID` to inspect/release authority or inspect dispatch
status. A completed lease means it was released, not that the task succeeded.
Receipt status never resends input or clears an unknown outcome. Interruption
requires owner reconciliation and fresh authority.

`--help` lists the command forms. Every method also has an exact JSON equivalent:

```json
{
  "id": "unique-action-id",
  "deviceId": "phone",
  "sessionId": "session-id",
  "taskId": "task-id",
  "method": "tap",
  "params": { "observationId": "observation-id", "x": 120, "y": 240 }
}
```

Pipe this envelope to `phone-control call`, or use `--input-file PRIVATE_JSON`.
Prefer `type --text-file PRIVATE_TEXT` to putting private text in command history.
Coordinates are integer pixels within the observed window, not normalized values.

| Method | Exact caller params | Console command |
| --- | --- | --- |
| `describe` | `{}` | `describe` |
| `observe` | `{includeScreenshot?: boolean}`; default false | `observe [--screenshot]` |
| `apps.list` | `{}`; filtered to intersecting app scope | `apps` |
| `app.launch` | `{packageName}` | `launch --package PACKAGE` |
| `tap` | `{observationId,x,y}` | `tap --observation ID --x N --y N` |
| `longPress` | `{observationId,x,y,durationMs}`; 200–2000 ms | `long-press ... --duration 500` |
| `swipe` | `{observationId,points:[{x,y}],durationMs}`; 2–20 points, 100–2000 ms | `swipe --observation ID --points-file PRIVATE_JSON --duration 500` |
| `pinch` | `{observationId,centerX,centerY,scale,durationMs}`; scale 0.5–2 except 1, 100–2000 ms | `pinch --observation ID --x N --y N --scale 1.5 --duration 500` |
| `node.click` | `{observationId,nodeId}`; observed clickable node | `node-click --observation ID --node ID` |
| `node.scroll` | `{observationId,nodeId,direction:"forward"\|"backward"}`; enabled scrollable node with the matching observed action | `node-scroll --observation ID --node ID --direction forward` |
| `type` | `{observationId,nodeId,text}`; observed editable node, 1–2000 characters | `type --observation ID --node ID --text-file PRIVATE_TEXT` |
| `key` | `{observationId,key:"back"\|"home"}` | `key --observation ID --key back` |
| `fixture.increment` | `{observationId}`; native signed fixture only | `fixture-increment --observation ID` |
| `stop` | `{}` | `stop` |

All method commands require `--device ID --session ID`; mutations other than Stop
also require `--task TASK_ID`. Commands accept
`--request-id ID`. IDs use 1–96 ASCII letters, digits, `_` or `-`, starting with a
letter or digit. Unknown fields are rejected. The broker derives and injects
`allowedPackages`, `expectedPackage` and `deadlineAt`; a source cannot supply them.
If the CLI generated an ID and loses the response, its error includes that request
ID and device/session IDs, without private parameters. Retain the request ID for
read-only reconciliation; never retry an uncertain mutation under a new ID.
Exit code 2 denotes
a rejected/unknown receipt or ambiguous transport outcome; other failures use 1.

## MCP integration

Configure a source runtime to launch Node with the component's CLI:

```json
{
  "command": "node",
  "args": ["ABSOLUTE_PATH/components/phone-control/bin/phone-control.mjs", "mcp", "--token-file", "SOURCE_ACCOUNT_PRIVATE_TOKEN_FILE", "--broker-public-key-file", "OWNER_PROVISIONED_PUBLIC_PEM"],
  "env": {}
}
```

Use the runtime's own supported MCP configuration and secret facility. Do not
paste a token into a checked-in configuration. The stdio adapter exposes
`phone_state`, `phone_call`, `phone_task_acquire`, `phone_task_status`,
`phone_task_release` and `phone_receipt_status`; it cannot create owner grants, pair devices or read
arbitrary files. `phone_call` has a machine-readable per-method parameter schema
and the same broker enforcement as CLI and HTTP. Images appear as MCP image
content only after all pixel grants and explicit request opt-in. Acquire the
executor lease before the observation used for a mutation. Tool errors and unknown outcomes
set `isError: true`. Standard output contains JSON-RPC only.

The implemented profile pins MCP `2025-11-25`: newline-delimited UTF-8 stdio,
`initialize` / `notifications/initialized`, `ping`, `tools/list`, and `tools/call`.
It negotiates that supported version instead of echoing arbitrary versions. It
does not offer sampling, prompts, MCP protocol tasks, resources or a remote MCP
HTTP transport. The executor-lease tools are ordinary tools, not MCP protocol tasks.
See the pinned primary specifications for
[transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## HTTP contract

Every route requires `Authorization: Bearer TOKEN`. Management requires the owner
token. `Origin` headers, cross-site fetch metadata, non-loopback Host values,
unrecognized routes, oversized bodies and unknown JSON fields are rejected.
There is no CORS, cookie authentication, query-string token or network binding.
Responses use `Cache-Control: no-store`. Clients send `x-phone-request-nonce` and
verify `x-phone-response-signature` with their provisioned public key. Full
response authentication includes successful receipts and management results.
Only a signed, request-bound `dispatch.state: "not_dispatched"` refusal establishes
definite non-dispatch. Unsigned/altered responses and arbitrary HTTP 4xx responses
cannot make an uncertain mutation safely retryable.

| Route | Input / response |
| --- | --- |
| `GET /v1/state` | `{storageState,devices,sessions,credentials,tasks}`; source scope filtered, no tokens |
| `GET /v1/credentials` | Owner; `{credentials:[metadata]}` |
| `POST /v1/credentials` | Owner; `{label,devices,apps,operations,ttlSeconds,sessionIds?,disclosure?:{screenshots:boolean}}` → `{credential:{metadata,token}}`, token once |
| `DELETE /v1/credentials/:id` | Owner; `{revoked:true}` after revocation; storage failures remain errors |
| `POST /v1/sessions` | Owner; `{deviceId,apps,operations,ttlSeconds,disclosure?:{screenshots:boolean}}` → `{session:{id,deviceId,apps,operations,disclosure,createdAt,expiresAt}}` |
| `DELETE /v1/sessions/:id` | Owner; `{revoked:true,stopStatus:"completed"\|"unknown"}` |
| `POST /v1/devices/:id/stop` | Owner; `{}` → same stop result |
| `GET /v1/audit` | Owner; `{events:[{at,actorId,status,deviceId?,method?,code?}]}` |
| `GET /v1/legal` | Authenticated attribution, source and license metadata |
| `POST /v1/call` | Scoped envelope above → `{id,status,result?,error?:{code,message}}` |
| `POST /v1/tasks` | Scoped; `{deviceId,sessionId,ttlSeconds:1..300,maxActions:1..100,label?}` → `{task}` |
| `GET /v1/tasks/:id` / `DELETE /v1/tasks/:id` | Scoped status/release; `{task}`, outcome remains `unverified` |
| `GET /v1/receipts/:id` | Requester-scoped dispatch metadata, `reconciliation:"status_only"`, `resumeAllowed:false`; no observation or input |

Call status is `observed`, `completed`, `rejected` or `unknown`. Boundary failures
use an appropriate non-2xx status and `{error:{code,message}}`. A native operation
may return a 200 broker response containing a rejected/unknown receipt; inspect
the receipt rather than only the HTTP status.

Devices report `busy`, `actionState: "ready" | "unknown"`, and
`connection: "recently_observed" | "unknown"`; successful native replies refresh
`lastSeenAt`. After sixty seconds it becomes unknown. This is freshness metadata,
not a heartbeat or a claim that a phone remains connected. Device labels and IDs
come from owner configuration, never from claimed source identities.

Observe returns `{observationId,packageName,windowId,width,height,capturedAt,nodes,
screenshot?,touchBounds?}`. Optional `touchBounds:{left,top,right,bottom}` uses
screenshot-local integer pixels and excludes Android system gesture regions.
Its right/bottom edges are exclusive. The all-zero rectangle means no coordinate
gestures are permitted; the full permitted screenshot and semantic node/key
operations remain available. Positive rectangles must fit inside the observed
window. Older companions may omit the field. Tap/press/swipe points and both
horizontal pinch paths must remain inside the reported rectangle. Pinch finger
paths start at ten percent of the smaller window dimension from the center and
end at that radius multiplied by the scale. The native companion rechecks the
current geometry before dispatch.

A blocked capture returns no tree or pixels. Recognized failures use safe typed
codes such as `screenshot_rate_limited`, `screenshot_secure_window`,
`screenshot_invalid_window`, `screenshot_invalid_display`,
`screenshot_access_denied`, `screenshot_geometry_changed`, `screenshot_too_large`,
`screenshot_timeout`, `screenshot_internal_error` or `screenshot_unavailable`.
Unrecognized reasons remain `observation_blocked`; arbitrary native diagnostic
messages are never forwarded. Capture errors may include `error.details` with
`captureStage` (`queued`, `awaiting_callback` or `encoding`) and
`captureElapsedMs` (an integer from 0 through 60000). These fixed diagnostics
contain no screen data; malformed fields and all other native details are dropped.

Nodes contain `{id,text?,description?,bounds:{left,top,right,bottom},
editable,clickable}`. Optional semantic fields are `resourceId`, `className`,
`stateDescription`, `hintText` (each at most 256 characters), `enabled`,
`scrollable`, `checkable`, `selected` (booleans), `checkedState`
(`unchecked`, `checked`, `mixed`), and distinct `actions` drawn from `click`,
`longClick`, `scrollForward`, `scrollBackward`, `setText`. Unknown metadata is
discarded; malformed declared fields reject the observation. These values are
untrusted app content, not proof of an app Activity or permission to perform an
effect. `node.scroll` requires explicit enabled/scrollable state and the matching
direction in `actions`; older observations without those fields cannot authorize
it. Native biometric consent and freshness checks still apply.

Timestamps are ISO strings. `describe` returns a sanitized
`{protocolVersion:1,platform:"android",methods,session:{expiresAt?},capabilities:
{screenshots,gestures,biometricConsent,taskLeaseRequired}}` object. Biometric capability reports
availability, not approval of a pending action. `apps.list` returns
`{apps:[{packageName,label}]}` restricted to effective scope.

The portal's existing management authentication protects its own browser proxy;
its server alone receives `ORCHESTRATOR_PHONE_BROKER_TOKEN` with the broker owner
token and `ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY` with the trusted raw public PEM.
Source runtimes use their own scoped tokens and do not need a portal
credential. The configured owner/native secrets are never returned to the browser.
An explicitly requested scoped credential may be shown once at creation.

## Failure and privacy semantics

- Each device has one active executor task lease and one in-flight operation.
  The lease's action budget is enforced by the broker. Owner emergency stop and a currently
  authorized scoped `stop` can interrupt
  that operation; it is the deliberate exception to normal serialization. Native
  checks also reject concurrency and stale windows.
- Every mutation writes an encrypted intent before sending. Its stable ID and
  canonical request hash survive broker restart. Reusing the ID with different
  content fails; an identical mutation in a still-authorized session returns its
  prior receipt without sending another native command. Restart revokes that
  session, so both replay and fresh dispatch then fail. Receipt evidence remains
  in the encrypted ledger. Active-session mutation receipts are never evicted to
  make room. Capacity exhaustion fails closed for ordinary mutations. Emergency
  Stop uses its metadata audit and revokes all device sessions even when the
  receipt ledger is full.
- A timeout, lost response, invalid native mutation receipt, post-dispatch
  revocation/expiry or failed receipt persistence is an **unknown** outcome.
  There are no automatic mutation retries. Unknown devices reject further
  mutations until an owner stop is acknowledged. Stopping revokes device sessions.
  A stop that reports a possibly finishing gesture remains unknown. An already
  dispatched gesture or external side effect cannot be undone by disconnecting.
- Native deadlines are bounded by the remaining broker timeout, task lease, session and
  credential expiry. The companion checks a monotonic deadline again after
  consent and before dispatch. Aborting an HTTP request alone is not cancellation.
- Stop and revocation abort in-flight transport and attempt native stop even
  when persistence fails. A storage failure puts the broker into a fail-closed
  state while preserving owner status and emergency-stop access. Restore storage,
  stop access on the phone and reconcile before restarting.
- Mutations require a fresh observation owned by the same credential and session;
  snapshots expire within thirty seconds. The native service additionally checks
  the current package/window and content fingerprint. Each mutation invalidates
  existing broker views. Launches bind the explicitly granted target package.
- Authentication and scope are checked before replay and again before returning
  captured data. Revocation clears cached private views. Read receipts live at
  most thirty seconds and expire without durable screen data. Unlike mutations,
  reads may execute again after this short replay-retention window.
- Screens and typed text are not persisted. Memory holds only the latest
  observation per actor/device, with a further 32-entry and 16 MiB private-cache
  bound. The encrypted ledger contains mutation receipts and request hashes,
  never typed text or image bytes. Audits retain the latest 500 metadata-only
  events; they contain no tokens, images, node text, input text or arbitrary
  native error messages.
- Owner and source tokens use SHA-256 hashes for comparison and storage. Native
  bearer credentials and the complete state file use AES-256-GCM with a separate
  private key file. Atomic flushed file replacement provides process-crash
  recovery; durability also depends on the underlying filesystem and storage.
- HTTP/native request bodies are limited to 16 KiB, native responses to 8 MiB,
  MCP input messages to 16 KiB and eight concurrent requests, and broker sockets
  to 64. Source requests have a 30-request burst with one request/second refill;
  owner requests have a 120-request burst and two/second refill. Authenticated
  owner stop/revocation and authorized scoped Stop remain available when request
  budgets are exhausted. These bounds are not protection from an adversary
  controlling the OS.

## Source code client

The optional `@orchestrator/phone-control/pilot` export supplies `PhonePilot` and
`selectNode` for a source runtime's own code. It uses the same scoped broker
transport as CLI/MCP; it does not plan tasks or verify downstream effects.
The standalone archive includes this module and TypeScript declarations without
npm runtime dependencies. The `@orchestrator/phone-control/task` export supplies
the source-owned checkpoint helper described in the
[source SDK guide](../../docs/phone-control-source-sdk.md).

```javascript
import { PhonePilot, selectNode } from '@orchestrator/phone-control/pilot';

const phone = new PhonePilot({
  secret: process.env.PHONE_CONTROL_TOKEN,
  brokerPublicKey: process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY,
  deviceId: 'phone',
  sessionId: process.env.PHONE_CONTROL_SESSION,
});

try {
  await phone.acquireTask({ ttlSeconds: 60, maxActions: 5 });
  const view = await phone.observe();
  const list = selectNode(view, {
    resourceId: 'com.example.app:id/list',
    enabled: true,
    scrollable: true,
    action: 'scrollForward',
  });
  const receipt = await phone.act('node.scroll', {
    nodeId: list.id,
    direction: 'forward',
  });
  // Inspect the receipt; native dispatch is not verification of a user outcome.
  if (receipt.status === 'completed') await phone.observe();
} finally {
  await phone.stop();
}
```

Selectors are exact conjunctions and must identify one node. Empty, unsupported,
missing or ambiguous selectors fail; no first-match guessing or executable
predicate is supported. Observations are projected to bounded known fields and
frozen. Screenshots require all pixel grants and
`observe({includeScreenshot:true})`. Each mutation
consumes the current observation, and an unknown mutation quarantines this client
even if a later read succeeds. Transport failures retain `error.requestId` for
owner reconciliation without returning private input or upstream error prose.

`waitFor(selector, {timeoutMs, maxObservations, intervalMs, stableObservations, maxTransientFailures})`
performs bounded tree-only observations until a unique match is unchanged across
the requested consecutive observations. Defaults are 10 seconds, 10 reads,
400 ms between reads, two stable observations and at most two selected transient
read failures. Every attempted read counts. Transient recovery resets matching
stability and is returned in `recoveries`; set `maxTransientFailures: 0` to disable
it. Protected windows, permission/session failures and invalid responses end the
wait. Recovery never widens disclosure or retries a mutation, and a response
after the monotonic budget cannot report success.
Stop interrupts the helper's ordinary operation lock, permanently closes this
instance and is sent at most once. A late mutation reply after Stop remains
unknown. Create a new client only after owner reconciliation and fresh authority.

`SourcePhoneTask` saves a private, metadata-only intent checkpoint before each
action, reserves source model budgets before provider invocation and emits
`source_reported` progress/handoff events. Existing checkpoints can be inspected,
not resumed or replayed. `finish()` reports `awaiting_verification` and
`independentlyVerified: false`; there is no independent task verifier. Model
budget enforcement by a provider adapter remains cooperative. See the
[source SDK guide](../../docs/phone-control-source-sdk.md) for exact contracts.

## Host isolation and production gates

A token is a capability for callers who cannot bypass this broker. A process
running as the same OS user can generally read that user's files and environment,
alter configuration, call the native endpoint if it obtains the token, run ADB,
or tamper with the broker. Encryption with a key in the same user's private
directory does **not** defend against that process. The
[isolated deployment](../../docs/phone-control-isolation.md) supplies an actually
tested local Linux container profile: no external networking, host mounts,
devices, ADB or management sockets; nonroot execution, a read-only root and bounded
temporary workspace. Its host relay retains the scoped bearer token and exposes
only fixed broker routes to the guest. The image includes the SDK and the
`@orchestrator/phone-control/isolation` host adapter is in the standalone package.

The available profile runs offline source code. It has no model-provider egress
or independent outcome verifier. Confining a phone tool does not contain an
unrestricted planner still running under the owner account. A second OS account
alone is not proof that ADB and forwarded native ports are unreachable. Host
administrators, rooted/compromised phones and malicious accessibility services are
outside this protection boundary. Do not claim agent authorization is enforced
while granting the same agent the bypass capabilities.

Keep the broker on loopback. Do not publish it through a generic tunnel, enable
unattended generic mutation, or use it for purchases, account/security changes,
messages, healthcare or other consequential actions without a separate reviewed
authority and domain security gate. A biometric confirms a bounded physical
action; it does not constitute a domain-specific purchase or communication
mandate or verify the intended downstream effect.

This is an alpha implementation, not a production readiness certification. Before
a production claim, retain evidence for real phone biometric acceptance/denial,
lock and secure-window rejection, scope mismatch, source isolation, content-change
races, native timeout/stop races, reboot/recovery, upgrade/data retention,
representative accessibility layouts, and at least two actual source runtimes.
Mock transport tests prove the broker/CLI/MCP contract and failure handling; they
do not prove those hardware or runtime integrations. The release remains alpha
until the owner approves a stage change.

## Validation and independent distribution

```powershell
npm --prefix components/phone-control run check
npm --prefix components/phone-control test
npm --prefix components/phone-control run test:package
node --test components/phone-control/test/isolation-container.mjs
npm pack ./components/phone-control --dry-run
```

Tests cover expected operations and errors, forged identity, self-grants,
cross-device/app/operation scope, private-data redaction, screenshot opt-in,
staleness, replay/restart, revocation races, one-flight concurrency, timeouts,
uncertain outcomes, emergency-stop persistence failure, HTTP origin/Host/body
checks, rate limits, real Windows ACL setup, encrypted token rotation, MCP
lifecycle and spawned CLI/MCP subprocesses. Their synthetic native transport never
executes ADB or accesses a real phone.

The package allowlist includes `src`, `bin`, `deployment`, this README and all license/origin
notices. It excludes tests, runtime configuration and private token/state files.
It is deliberately private in npm metadata; a reviewed artifact can still be
packed locally. `--version`, `--license`, and authenticated `/v1/legal` preserve
the origin and appropriate legal notice in the independent console/service.

`test:package` writes the actual `.tgz`, a SHA-256 dependency inventory and a
verification report to `test-results/phone-control/package-qa`. It extracts the
archive to a separate temporary directory, compares every packaged file with its
source, and runs the extracted CLI's version/license commands and MCP lifecycle
without portal code or installed dependencies. The inventory accurately records
zero third-party npm packages; the separately installed Node runtime and Android
companion are outside the archive. It is not a full host or Android SBOM.

To use the extracted package independently, install Node 24+, extract the archive,
open its `package` directory and run `node bin/phone-control.mjs --help`, `init`
and `serve`. JavaScript source is shipped directly; no compilation, npm install,
portal checkout or package registry access is needed. The setup and control
commands above then use `node bin/phone-control.mjs` in place of the repository
path. Do not publish the package or a release as part of package validation.
