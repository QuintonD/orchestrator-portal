# Phone Control broker security review

Review date: 13 September 2026. Scope: the independent broker, HTTP/CLI/MCP
boundaries and their source tests on the uncommitted alpha feature branch.
This review does not certify the companion, deployed host isolation, hardware
biometrics or cross-app task safety. Existing user implementation and all legal
notices were preserved.

## Verified findings and corrections

| Severity | Reproduced condition | Correction and regression evidence |
| --- | --- | --- |
| High | Restart loaded unexpired sessions and allowed new input using previous authority | Startup durably revokes previous sessions and quarantines previously active devices; new input requires acknowledged Stop and rearming. Failed revocation storage prevents startup. The ledger survives but cannot authorize replay. |
| High | Scoped Stop shared ordinary serialization, rate and storage gates, and could report completion while a gesture might finish | Scoped Stop now uses the same interruptible path as owner Stop after device/session/operation checks. It bypasses ordinary rate/ledger/storage limits, revokes device sessions and preserves `unknown` for transport failure, failed persistence or a possibly finishing gesture. |
| High | A native response containing both a dispatched result and a known rejection was treated as a safe no-effect rejection | Result/error exclusivity is checked before interpreting an error. Unknown native error codes also preserve mutation ambiguity and quarantine the device. |
| Medium | A delayed observation could be replayed for 30 seconds after delivery despite capture being almost 30 seconds old | Private replay expires at the earlier of capture plus 30 seconds and delivery plus 30 seconds. Expired replay performs no native call. |
| Medium | A delegate credential applied to every subsequent matching session until credential expiry | New optional `sessionIds` further restrict discovery and execution, including Stop. Creation rejects missing, expired and wrong-device bindings. Legacy grants remain explicitly broader. |
| Low | MCP accepted malformed client identity objects, concurrent duplicate request IDs and returned uncorrelatable capacity errors | Malformed initialization leaves the adapter uninitialized; duplicate active IDs never invoke the client twice; capacity refusals include the original ID. Synchronous messages do not consume pending-call slots. |
| Medium | Initial source SDK returned arbitrary receipt metadata/error prose, retained deep untrusted view fields and could report late success after Stop or a wait deadline | SDK receipts/views now project bounded known fields and fixed error codes. Stop is sent once, closes observation dispatch, and forces late mutation results to unknown. Wait success is gated by its monotonic budget. Unknown transport failures retain only the generated request ID for reconciliation. |

The new `robustness.test.mjs` and additions to broker, HTTP and client tests
exercise these conditions with controlled failures and secret canaries. Tests
also cover the additive semantic observation fields and `node.scroll`: malformed
metadata rejects the whole observation, arbitrary fields are discarded, and a
scroll requires the same actor/session's fresh node, enabled/scrollable state and
the exact advertised direction. Semantic strings never enter durable receipts.

Stop prevents new dispatch. It cannot undo an already delivered gesture, and a
later unresolved in-flight receipt can conservatively retain device quarantine.
The phone owner must inspect and reconcile unknown outcomes. A Stop call revokes
the authorizing session; a repeated call with that old session fails authorization
instead of resending a native command.

## Host isolation remains an open deployment gate

The supported direct local setup is appropriate only when the owner trusts every
process with the host user's privileges. File ACLs, encrypted state with a local
key, filtered child environment and a loopback listener do not isolate an
unrestricted source agent running as that user. Such an agent can read the owner
token/key, rewrite the broker or use owner-authorized ADB independently. A second
OS account alone also does not establish that the local ADB TCP server or forwarded
native port is unreachable. These are explicit deployment exclusions, not fixed
by credential session binding.

A practical deployment to validate is an agent VM with its own network namespace,
no host filesystem mounts, no USB/device passthrough, no host management sockets,
no shared privileged clipboard/terminal, and only an individual scoped broker
token. Keep the broker, owner keys, native credential and serial-pinned ADB on the
trusted owner host. Give each mutually untrusted delegate a separate VM or an
equivalently enforced boundary; placing their tokens under the same guest user
does not separate those delegates.

One candidate transport is an authenticated forwarding-only OpenSSH account
whose sole permitted destination is the host broker's loopback port. The agent's
VM binds its local forward to `127.0.0.1:4421`, preserving the existing CLI/MCP
transport and exact Host check. This is a restricted deployment design, not a
generic broker tunnel or a newly provisioned service. An illustrative server
account policy is:

```text
Match User phone-agent-relay
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    MaxSessions 0
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:4421
    PermitListen none
    AllowStreamLocalForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitTunnel no
    PermitUserRC no
```

OpenSSH documents that `MaxSessions 0` disables shell and subsystem sessions while
retaining forwarding, and that `PermitOpen` restricts forwarding destinations.
Validate the effective account configuration on the chosen OS before deploying;
these settings have not been installed or exercised in this worktree.
[OpenSSH server configuration](https://man.openbsd.org/sshd_config)

As additional key attenuation, a dedicated key can use
`restrict,port-forwarding,permitopen="127.0.0.1:4421"` in `authorized_keys`.
This must accompany the server account restrictions: `restrict` alone does not
prohibit shell execution, and re-enabling forwarding alone does not limit its
destination. Pin the SSH host identity and keep host administrative credentials
out of the guest. [OpenSSH authorized keys](https://man.openbsd.org/sshd)

Before claiming isolation, run adversarial probes from the actual source runtime
and retain sanitized outcomes: owner/native token and state reads denied, host
process execution and file transfer denied, direct and forwarded ADB/native
connections denied, SSH forwarding to any other destination denied, host mounts
and USB absent, scoped broker observation succeeds, unauthorized session/operation
fails, and owner/phone Stop still works. No such VM acceptance evidence is claimed
here. Hypervisor/administrator compromise remains outside this boundary.

## Task authorization and remaining limits

Session binding prevents authority carrying into a later session; it does not
prove a natural-language task restriction such as "draft but never send".
Resource IDs, class names, labels, checked state and supported node actions are
app-provided evidence. They cannot turn general clicks or scrolling into an
enforced domain mandate. Generic mutations, including `node.scroll`, retain
per-action strong biometric consent. Standing unattended actions still require
separately implemented, reviewed and tested app-specific effects; the signed
fixture counter remains the existing harmless example.

Screen text, semantic metadata and screenshots are untrusted and may contain
prompt injection. The receiving runtime/model destination must be owner-authorized;
the broker cannot enforce where a bearer-token holder sends content after receipt.
Observation screening and protected-window checks rely on the companion. Broker
PNG signature and size checks do not prove pixel correctness, redaction or an
independently verified user outcome. Those remain native/integration acceptance
responsibilities.

The standalone archive continues to require Node 24 and zero npm runtime
dependencies. Deployment SSH/hypervisor software is separate from that archive;
the optional isolation design does not silently add a broker dependency.

## Validation completed for this review

- `npm run phone:test`: 79 tests passed, no skips, including actual Windows
  private-file/ACL and encrypted-state checks. The source SDK accounts for 13
  of these tests.
- `npm --prefix components/phone-control run check`: seven runtime modules
  passed Node syntax checks.
- `npm --prefix components/phone-control run test:package`: all 12 archive files
  matched source bytes; extracted CLI version/licence, MCP lifecycle and pilot/
  client package exports ran outside the repository without npm dependencies.
  Archive SHA-256:
  `309ca994c874980003317cd65574811e74d8d8e3ad7f3192d9a39db8dc937a40`.
  Evidence: `test-results/phone-control/package-qa/verification.json` and
  `dependency-inventory.json`. This is an uncommitted alpha QA archive.
- Scoped diff checks passed. No legal texts, native code, release identity,
  deployment account, broker credentials or phone installation were modified by
  this review. Native/portal acceptance is recorded separately by their owners.

## Follow-up: explicit Home consent contract

The Markor experiments exposed content changes caused by the handoff to the
biometric Activity. A separately reviewed native change now permits tree changes
only for authenticated `key: home`, after the initial exact observation check.
Home selects the system navigation action; it does not select an app node or
coordinate. The review explicitly authorizes leaving despite changed content and
discloses possible saves or other lifecycle effects. The implementation does not
claim to identify which changes came from autosave.

Both the restoration loop and final dispatch use the same comparison. Package,
signer/version, window identity, all window/touch geometry, complete privacy
capture, secure-window probe, deadline, observation expiry and current grants
remain required. There is no relaxation parameter exposed to callers. Other
actions retain their original tree comparison; the existing post-consent
content-event tolerance requires an otherwise identical fingerprint.

The pure comparison has nine JVM regression tests. Independent review checked
both dispatch paths and the protected-capture and authority gates. The separate
emulator lifecycle mode tests actual changed content, protected screens,
revocation, deadline and Stop; its results and the no-retry document candidate
belong in the [readiness record](android-phone-control-readiness.md) and
[document QA](phone-control-document-qa.md). This follow-up changes native code;
the earlier broker-review scope statement above describes that earlier work.
