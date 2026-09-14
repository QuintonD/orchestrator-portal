# Phone resource permissions

The default setup grants creation of new plain-text draft files in an
owner-selected folder. Each creation requires a full review and strong biometric
confirmation on the phone. Existing-file reads, edits, replacement, deletion,
agent-chosen paths and sending are outside that grant. The user can instead
choose exact-document permissions as an advanced option. Neither mode is
automatically granted: the owner selects resources on the phone and explicitly
scopes the broker session and source credential.

These adapters work through the standalone broker, CLI/MCP, SDK and portal.
Generic screen control remains a separate, explicitly selected mode with its
existing per-action consent. Existing grants are never widened by the new default.

This implementation does not enforce email accounts, individual Android
Activities, or natural-language promises such as "draft but never send" inside
arbitrary apps. Unknown adapters, account fields and effect names are rejected.
A task label describes intent; it never grants authority. Future account adapters
must verify a provider-native account identity and expose only the granted
effects. A screen label, accessibility resource ID or model assertion is not such
an identity.

## Default: create drafts in a folder

1. On the phone, choose **Select folder for new drafts**, select a folder in the
   Android picker, and review its location and storage provider before granting
   access. The phone displays an opaque folder handle; raw provider URIs stay
   local.
2. Keep the portal's folder-draft mode selected. Enter the handle and create a
   session and source credential with the scope below. The restrictions are
   enforced by this adapter, not optional agent instructions.
3. Acquire a bounded task. Each `draft.create` supplies only `resourceId` and
   `text`. The phone generates a fresh UUID-based `.draft.txt` filename and
   requires review of that filename, folder, provider and complete content,
   followed by strong biometrics. Denial performs no creation.

```json
{
  "deviceId": "phone",
  "apps": [],
  "operations": ["describe", "draft.create", "stop"],
  "ttlSeconds": 600,
  "resourceScope": {
    "adapter": "android.folder-drafts.v1",
    "resourceIds": ["PHONE_GENERATED_FOLDER_HANDLE"],
    "effects": ["draft.create"]
  }
}
```

For a source credential, replace `deviceId` with `devices: ["phone"]`, add its
`label` and `sessionIds`, and retain or narrow the explicit folder scope. Tasks
inherit the session/credential intersection and may narrow it. Adapter identity
is part of the authority: a document handle cannot be used as a folder handle.
No new folder, effect or adapter can be introduced by a task.

```javascript
await pilot.acquireTask({ maxActions: 1 });
const receipt = await pilot.createDraft(ownerSelectedFolderHandle, draftText);
// Do not retry an unknown outcome. Ask the owner to inspect the selected folder.
```

`SourcePhoneTask.act('draft.create', { resourceId, text })` uses the same action
budget, cancellation and metadata-only checkpoint path. The CLI equivalent is
`draft-create --resource FOLDER_HANDLE --text-file PRIVATE_TEXT --task TASK_ID`
with the usual broker, device and session options. MCP exposes the same method.
A successful result contains only `{ "status": "completed" }`; it confirms
immediate native readback, not crash durability or independent task verification.
Draft text and provider metadata are excluded from durable receipts and audit.

**Meaning and limits of the default:** these are new text files marked as drafts,
not drafts inside an email or messaging account. No adapter operation sends or
publishes them. A selected cloud/sync provider may upload files independently.
Android's tree permission grants the companion broader folder access at the OS
level; the companion's typed adapter enforces the narrower create-only interface.
See [Android's folder access documentation](https://developer.android.com/training/data-storage/shared/documents-files).

The native adapter permits at most 255 existing immediate children before a
creation (256 entries after it). Larger or incomplete listings are refused. It
snapshots bounded immediate-child metadata, verifies exactly
one new child with the generated name and plain-text type, and refuses existing
IDs, unexpected metadata, nonempty descriptors and nonordinary files. It uses
nontruncating writes, never deletes for rollback, and never reads existing child
contents for the agent. Any failure after creation may have begun is **unknown**;
an empty or partial draft can remain. Stop cannot undo a provider call already
delivered. The worker remains occupied until a blocked provider actually returns.

These checks depend on an owner-trusted provider honoring its document and file
descriptor identities. They cannot prove that a malicious provider maps a new ID
to new backing storage, or prevent another app writing concurrently. Folder
contents can change between checks. Choose a trusted local folder with no
concurrent editing when those distinctions matter. Unsupported provider behavior
fails closed rather than falling back to generic app control.

## Advanced: exact-document setup and enforcement

1. On the phone, select one document through Android's document picker and review
   the provider and document before granting read access or replacement access.
   This advanced grant is for one document. The phone retains
   the URI and provider identity privately and displays an opaque resource handle.
2. In the portal, choose document permissions and enter the selected handle.
   Create a session and delegate credential for those resources and effects.
   Screenshots and generic app/input permissions cannot be combined with this
   mode. A broker grant cannot create a missing phone-side grant.
3. The source acquires a bounded task. Its effective resources and effects are
   the intersection of the session and its credential. The source can request a
   smaller scope, but cannot introduce another resource or effect.
4. Both document reads and replacements require that live task. Replacements
   consume its action budget and require review of the exact target and text,
   followed by strong biometric authentication on the phone.
5. Stop interrupts new work independently of the task. Removing a phone grant
   stops the session. Session/credential expiry and revocation gate returned
   content as well as initial dispatch. A stopped or expired task cannot retrieve
   a cached private read.

Each document read needs a fresh request ID and a new native permission check.
The broker refuses replay of a document-read response because phone-local grant
revocation does not synchronously notify the broker. This avoids redisclosing
cached document text after a local revoke.
Document text is not retained in the broker's replay cache or durable ledger.

The phone rechecks the provider signing/version identity, exact persisted URI
permission and local grant. It does not accept a path, URI or account identifier
from an agent. There is no fallback from a refused document operation to screen
controls, arbitrary intents, shell commands or broader document access.

## Wire contract

Both owner-created session and credential carry an explicit scope. Legacy app
grants alone confer no document authority. An owner credential is exempt only
from the delegate-credential layer; it still needs the document-scoped session
and task, and the phone still enforces its local grant and consent.

```json
{
  "deviceId": "phone",
  "apps": [],
  "operations": ["describe", "document.read", "document.replace", "stop"],
  "ttlSeconds": 600,
  "resourceScope": {
    "adapter": "android.document.v1",
    "resourceIds": ["PHONE_GENERATED_HANDLE"],
    "effects": ["document.read", "document.replace"]
  }
}
```

For a credential, replace `deviceId` with `devices: ["phone"]`, add its `label`
and explicit `sessionIds`. Keep the scope unchanged or narrower. A read-only
credential lists only `document.read` in effects, omitting `document.replace`
from operations. Replacement authority requires read authority too.

| Method | Parameters | Successful result |
| --- | --- | --- |
| `document.read` | `resourceId` | `resourceId`, `revision`, `text` in an `observed` receipt |
| `document.replace` | `resourceId`, `expectedRevision`, `text` | `status: "completed"` in a `completed` receipt |

The broker supplies the mutation deadline. `revision` is the lowercase SHA-256
of the exact UTF-8 document contents. The read response must identify the requested
resource and its digest must match its text; malformed responses fail closed.
Text is limited to 2,000 UTF-16 code units and 8,192 UTF-8 bytes, with strict UTF-8,
no unpaired surrogates and no NUL. Empty text is allowed and means clearing the
selected document when used in a replacement. The existing transport byte limit
also applies.

## Source use

```javascript
const task = await pilot.acquireTask({
  ttlSeconds: 120,
  maxActions: 1,
  resourceScope: {
    adapter: 'android.document.v1',
    resourceIds: [ownerSelectedHandle],
    effects: ['document.read', 'document.replace'],
  },
});
const before = await pilot.readDocument(ownerSelectedHandle);
const receipt = await pilot.replaceDocument(
  before.resourceId, before.revision, replacementText,
);
// A completed receipt does not independently establish the user's task outcome.
// An unknown receipt requires owner reconciliation; never retry the replacement.
```

`SourcePhoneTask.readDocument` applies the source task's time/cancellation budget;
`SourcePhoneTask.act('document.replace', params)` also records metadata-only
checkpoints. Those checkpoints never contain document contents.

The CLI exposes `document-read --resource HANDLE --task TASK_ID` and
`document-replace --resource HANDLE --revision SHA256 --text-file PRIVATE_TEXT
--task TASK_ID`, together with the existing device/session and broker identity
options. Use `--output PRIVATE_FILE` to keep read results out of the terminal.
MCP uses the same typed methods through `phone_call`; it exposes no owner-grant
creation tool. Captured document contents remain untrusted input to the agent.

## Provider and concurrency limits

- The adapter supports `text/plain` documents from compatible Android document
  providers offering a regular, seekable file descriptor and persistent exact-URI
  access. Virtual documents, partial documents, directories, unsupported types
  and incompatible providers are refused.
- Selecting a provider means trusting its implementation of that URI. The
  companion cannot prove what a malicious or faulty provider does internally.
  Provider synchronization may transmit the edit to its configured cloud account;
  this adapter neither identifies nor restricts that account. Use a local provider
  when that distinction matters. A provider update requires renewed owner trust.
- Revision checks occur before and after biometric review and on the opened
  descriptor before replacement. **Android SAF offers no atomic compare-and-swap.**
  Another app/provider can still change the file in the remaining race window.
  Avoid concurrent editing. These checks are not a guarantee against lost updates.
- Once write access may have reached the provider, errors are conservatively
  reported as unknown. Partial writes can occur; there is no automatic rollback,
  retry or promise of crash-atomic replacement. A successful readback supports
  the immediate stored bytes, not durability or an independently verified task.
- Provider I/O is bounded for the caller and serialized separately. A stuck
  provider retains the occupied worker until it actually returns; timeout cannot
  authorize a second concurrent operation. Stop cannot undo a write already
  delivered to a provider. An unconfirmed effect requires owner reconciliation.
- This path reads explicitly granted document bytes without capturing the screen.
  It does not weaken the screenshot protections used by generic phone piloting.
  Owner-approved recipients can retain disclosed text; revocation cannot recall
  content already delivered.

## Exact-document qualification before the folder extension

Implementation validation on 14 September 2026:

| Check | Observed result |
| --- | --- |
| Broker/SDK tests | 149 passed, including 14 resource-scope cases |
| Workspace typecheck and tests | Passed; 216 server, 20 web and 14 contract tests |
| Phone portal browser QA | 50 desktop/mobile journeys passed; document review screenshots inspected |
| Android JVM/build/lint | 91 JVM tests passed; companion, test and fixture APKs built; app/fixture lint passed |
| Release and packaging | 107 release tests, release identity check, legal boundaries and extracted standalone package checks passed |
| Real owner picker | Synthetic target selected through the Android picker; malformed and oversized fixtures refused without a new grant |
| Native document replacement | 21 assertions passed on the enrolled Android 16 QPR2 emulator, with one actual emulator sensor event and CryptoObject authentication |
| Native read-only grant | 11 assertions passed with zero sensor events; replacement refused despite the operation being otherwise enabled |
| Independent file evidence | Full replacement matched exact expected UTF-8 bytes; read-only case preserved the target; both preserved the sibling file |
| Existing native regression | 46 assertions and all five cleanup steps passed on QPR2 |
| Existing broker/portal integration | Eight checks, 30 first-attempt observations and all 24 cleanup steps passed; paired-host Stop acknowledged in 186 ms |
| Host biometric/document drivers | 38 tests passed, including strict success/failure protocol checks |

The full and read-only probes used the same companion and fixture APK bytes.
Only instrumentation was extended for the latter case. The full probe evidence is
`D:/Orchestrator-Phone-Upgrade-QA/resource-scope-20260914/native-probe-sourcefix.json`;
the read-only evidence is `native-readonly-first.json` in that directory. Their
records bind installed APKs to local hashes and retain source/probe identities.

Independent review found that replay of a cached read could redisclose text after
phone-local revocation. Document-read replay is now refused; the fresh request
must recheck native authority. The new regression was independently verified.
The first native-driver invocation failed before instrumentation because its
source inventory included the `.gradle` directory. That failed record is retained
as `native-probe-first.json`; a regular-file filter and regression corrected the
harness before the successful first actual replacement attempt.

This remains alpha functionality. Broker/SDK, portal and native acceptance must
cover scope escalation, omitted tasks, stale revisions, wrong handles, unknown
write outcomes, private-response revocation, expired cache reads, protected owner
controls and actual document-provider behavior. Physical-device, OEM/provider and
account-adapter acceptance remain separate gates. The deployment also retains the
[source-isolation boundary](phone-control-isolation.md).

The owned emulator was stopped after QA with its data preserved. Its retained AVD
was moved from C: to the owned QA directory on D: to satisfy emulator free-space
requirements; unrelated user emulators were left untouched.

Android 14/15 remain supported by the API-34 minimum and the existing capture
mitigation; this new document workflow has been exercised on QPR2 only so far.
That is not an Android 14/15 document-provider acceptance result. Real provider
hangs, provider upgrades and external OS URI revocation also need separate device
qualification beyond the current coordinator tests and local-revocation probe.
No new release or signed upgrade is claimed for this working-tree implementation.

## Folder-default qualification

Validation of the folder extension on 14 September 2026:

| Check | Observed result |
| --- | --- |
| Broker/SDK/CLI/MCP | 160 tests passed, including nine folder-scope cases and CLI malformed UTF-8, size and BOM/Unicode regressions |
| Workspace | Typechecks passed; 217 server, 20 web and 14 contract tests passed |
| Portal | Final full run: 54 desktop/mobile phone journeys passed; folder review screenshots inspected |
| Android | 96 JVM tests passed with no failures or skips; companion, instrumentation and fixture built; both lints passed |
| Host probe drivers | 41 tests passed |
| Real Android folder creation | 19 assertions passed; one strong biometric sensor event; exactly one new 58-byte draft verified independently |
| Existing-ID provider alias | 19 assertions passed; creation reported unknown and target/sibling bytes stayed unchanged |
| New-ID alias to a nonempty existing file | 19 assertions passed; descriptor rejected without writing; target/sibling bytes stayed unchanged |
| Packaging and attribution | Extracted package checks, release identity and license boundaries passed |

The native evidence is in
`D:/Orchestrator-Phone-Upgrade-QA/folder-scope-20260914/`: `full-02.json`,
`alias-01.json` and `alias-new-01.json`. Each binds local and installed APKs,
working sources and one bounded acceptance attempt. Actual Android picker grants
and provider trust were used; no folder grant was seeded into preferences. Each
case includes denial and Stop/local revocation while a review is pending. The
host checks existing target, sibling and prior draft bytes independently, not
just the adapter's receipt.

`full-01.json` remains a failed harness record: the protocol expected 17
assertions, omitting two real review-button assertions. The counter was corrected
to 19 and a parser regression added. A fresh owner-selected grant and separately
confirmed creation produced the successful full case; the driver has no retry
loop. Independent review also found lossy CLI UTF-8 decoding. Resource text files
now use bounded fatal decoding while preserving a BOM as content.

These adapters are prepared for **alpha 8**; [release-artifact qualification](alpha-8-validation.md) and publication are pending. The live folder
workflow was exercised on the enrolled Android 16 QPR2 emulator only. Android
14/15 remain supported but have not passed this folder-provider acceptance yet.
Physical phones, OEM/storage providers, external URI revocation, provider updates,
concurrent writers and crash recovery still require qualification. Stop during
blocked provider I/O has coordinator unit coverage, not a live folder-provider
acceptance result. The malicious-provider fixtures establish detection of the
tested aliases, not safety against every provider lie, including empty-file
aliases or hidden publication. See the reproducible
[folder QA procedure](../apps/phone-android/FOLDER_SCOPE_QA.md).
