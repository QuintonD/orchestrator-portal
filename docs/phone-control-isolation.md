# Isolated Phone Control source deployment

This alpha deployment runs a source's Node program in a Linux Docker container
with no external networking. The owner host retains the broker, signing private
key, owner and native credentials, ADB, and Docker management. The container gets
only a bounded broker channel over Docker's standard input/output and the
broker's public verification key. It receives no host filesystem mount, USB
device, ADB connection or real bearer token.

The tested host is Windows with Docker Desktop's WSL2 Linux engine. A local Linux
Docker engine with seccomp is also an intended deployment target; run the same
acceptance command there before using that host. Windows containers, missing
seccomp, remote/TCP Docker contexts, mutable image tags, image-declared volumes and a broadened container
configuration fail preflight. The launcher does not install Docker, change daemon
settings, create OS accounts or alter any unrelated service.

## Boundary and scope

The source's submitted program executes only inside the container. The trusted
host launcher never evaluates submitted JavaScript or constructs a shell command
from it. A source can run subprocesses and alter its own temporary files inside
the container; it can also stop or corrupt its own execution. These abilities do
not give it the owner's process or filesystem namespace.

The container uses UID/GID 1000, zero Linux capabilities, no new privileges,
Docker's seccomp filter, a read-only root, private PID/IPC namespaces, and
`--network none`. Its only writable storage is bounded, non-executable tmpfs at
`/workspace` and `/tmp`. Limits are 96 processes, 512 MiB memory without extra
swap, one CPU and 256 open files per process. Docker logging is disabled. The
launcher checks the actual created container configuration before starting it.
Only local Unix sockets or the local Windows named pipe are accepted as Docker
control endpoints. Docker's automatic proxy variables/build arguments are
explicitly emptied, including lowercase variants, so proxy credentials cannot
enter the container. This handles Docker's
[automatic proxy configuration](https://docs.docker.com/engine/cli/proxy/)
independently of the source program's own environment filter.
Docker documents its [namespace boundaries](https://docs.docker.com/engine/security/),
[runtime controls](https://docs.docker.com/engine/containers/run/) and
[seccomp filter](https://docs.docker.com/engine/security/seccomp/).

The guest has a loopback HTTP endpoint compatible with the existing client and
SDK. The host relay accepts only `GET /v1/state`, `GET /v1/legal`, `POST /v1/call`,
`POST /v1/tasks`, `GET`/`DELETE /v1/tasks/:id`, and
`GET /v1/receipts/:requestId`. It fixes the host destination to the configured
loopback broker port, replaces authorization with the owner's selected **scoped**
credential, and binds POST bodies to one device and one session. Arbitrary URLs,
queries, owner routes, CONNECT, caller-supplied destinations and headers are
rejected. Request/response sizes, concurrent requests, output and lifetime are
bounded. Redirects are not followed. Signed broker response bodies, HTTP status,
nonce and signature pass through unchanged; the SDK verifies the complete response
before interpreting it. Host credential preflight and shutdown independently
verify that same pinned identity. Relay failures have no broker proof
and do not establish that a mutation was safely rejected.

The launcher rejects the owner token and credentials that cover more than the
selected device/session, lack explicit session binding, or lack Stop. The broker
still enforces task leases, action budgets, screenshot disclosure and effective
phone/session/delegate authority. Killing this container cannot disable the
owner's independent Stop path. Normal shutdown, protocol failure and the lifetime
deadline attempt scoped Stop and remove only this launcher-created container.
`nativeStopConfirmed` is true only for an acknowledged completed native Stop;
failed, expired or ambiguous Stop is reported, and the CLI exits unsuccessfully.
Container removal alone is not evidence that an earlier device action stopped.

This profile supplies an isolated execution environment for a source runtime. It
does not supply model planning, model-provider networking, remote model keys, a
portal agent runtime, or a domain-specific task grant. A source program must be
self-contained Node code, or use modules already present in its owner-reviewed
image. The supplied image includes the Phone Control SDK and Node 24. An
unrestricted planner that continues running under the owner account outside this
container retains that account's authority; confining only its phone tool does
not isolate that planner. Keep all untrusted execution inside the boundary.

There is **no provider egress** in this profile. Input code and output use the
owner-controlled local launcher channel. Only disclose captured content through
that channel to an owner-authorized source; the launcher is not a content-based
data-loss filter. Adding model-provider access requires a separately reviewed
recipient-specific relay and disclosure policy. Do not attach a Docker socket,
host directory, host networking or a generic proxy to make a source work.
Kernel, hypervisor, Docker administrator compromise, and owner-supplied images
that already contain secrets remain outside the claim. Use a separate container
for each mutually untrusted delegate.

## Build and run

Node 24 and a running local Linux Docker engine with seccomp are prerequisites.
The image build copies a positive allowlist of public source and legal files to
a new temporary build context. It never uploads the repository or private
configuration directories. Its Node 24.20.0 base is pinned by digest; the first
build may need Docker to fetch that public base. No package installation runs
inside the image build. Rebuild after every SDK/deployment source change.

```powershell
node components/phone-control/deployment/host.mjs build
```

Retain the returned `sha256:...` image ID. Create a fresh broker session and a
short-lived delegate credential bound to exactly its one device and `sessionIds`
entry. Include `stop` in both grants. Grant pixels only if independently intended.
Keep the delegate token in a private file and provision `broker-public.pem` from
the trusted broker initialization. Never substitute the signing private key.

An example `source.mjs` program is:

```javascript
import { PhonePilot } from '/opt/phone/src/pilot.mjs';
const phone = new PhonePilot({
  secret: process.env.PHONE_CONTROL_TOKEN,
  brokerPublicKey: process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY,
  deviceId: process.env.PHONE_CONTROL_DEVICE,
  sessionId: process.env.PHONE_CONTROL_SESSION,
});
const view = await phone.observe();
console.log(JSON.stringify({ observed: true, nodeCount: view.nodes.length }));
// The launcher performs scoped Stop when the program finishes.
```

```powershell
node components/phone-control/deployment/host.mjs run `
  --image sha256:IMAGE_ID_FROM_BUILD `
  --token-file C:/private/phone-delegate.token `
  --public-key-file C:/private/broker-public.pem `
  --source-file C:/approved/source.mjs `
  --device-id phone --session-id SESSION_ID
```

The real delegate token stays in the host relay. The guest's
`PHONE_CONTROL_TOKEN` is a non-secret compatibility value accepted only by its
own loopback endpoint. No host environment variables are copied into the source
program. Output is returned as bounded JSON strings and never interpreted as
host commands. Treat it as untrusted and potentially private.

An external source adapter can use the host API:

```javascript
import { IsolatedSource } from './components/phone-control/deployment/host.mjs';
const source = await IsolatedSource.start({
  image, secret: scopedToken, publicKey: brokerPublicPem,
  deviceId, sessionId, port: 4421, lifetimeMs: 300_000,
});
try {
  const result = await source.run(submittedJavaScript);
  // Check result.code and result.outputTruncated; do not execute its output.
} finally {
  const cleanup = await source.close();
  // Require cleanup.nativeStopConfirmed, otherwise hand off for reconciliation.
}
```

`run()` starts one guest Node program at a time. That process can retain live
state throughout a task; `/workspace` also survives sequential invocations until
the container closes. It contains the public pin at `/workspace/broker-public.pem`.
The filesystem is ephemeral: container removal discards it. Durable source task
checkpoints need an explicitly authorized source-owned store; mounting the owner
home directory is not a supported checkpoint mechanism. A new container does not
resume a phone task or replay old mutations automatically. Fresh authority and
reconciliation remain required after an interruption.

## Acceptance evidence

```powershell
node --test components/phone-control/test/isolation.test.mjs
node --test components/phone-control/test/isolation-container.mjs
node --test components/phone-control/test/adversarial-source.test.mjs
```

The first command tests route/size/header enforcement, hostile framing,
configuration drift, redirect refusal, signature preservation and credential
preflight. The second builds and launches the actual hardened container against
a real broker HTTP server with a synthetic native transport. It probes owner
canary file paths, host processes/tools, Docker/SSH sockets, device/USB paths,
kernel capability/seccomp status, direct ADB/native/broker connections and
external/metadata egress from inside the running source. It also checks scoped
observation, pinned signed refusal, screenshot denial, owner-route denial,
workspace continuity, scoped Stop and container removal. It never contacts a
phone. A failure does not become a skip when Docker is unavailable.

The sanitized report is
`test-results/phone-control/isolation/verification.json`, including the image ID,
base digest, engine version, individual outcomes and deployment source hashes.
The first run on 13 September 2026 found two assertion-fixture mismatches
(`observed` versus `completed`, and screenshots enabled by the shared helper);
the test was corrected to the broker contract and an explicit denied pixel
grant. The subsequent run passed all container probes and five unit tests on
Docker Desktop 29.6.1 / WSL2 with Node 24.20.0. These results establish the tested
boundary and broker relay behavior; they do not establish real Android behavior,
autonomous agent competence or a security certification. Emulator/native
acceptance remains in the [readiness record](android-phone-control-readiness.md).

Independent review added two tests against real broker HTTP responses. A hostile
relay obtains a genuine signed denial for a different request body while reusing
the original nonce; the SDK still preserves uncertainty for the mutation that
already dispatched. Cancellation during a pending native dispatch records the
action as unknown even when a late completion arrives, and rejects task replay
or checkpoint-based restart. Both pass. Review also tightened shutdown so an
unconfirmed Stop is an unsuccessful CLI result, required signed credential
preflight/Stop responses, and removed automatic Docker proxy credential injection.
The combined command passed eight tests with no skips after these corrections.
