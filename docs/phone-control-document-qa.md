# Markor document QA

On 13 September 2026, the single **v2 Home contract acceptance failed at 2/3**
joint document workflows. Seeds 17 and 43 completed exactly type then Home;
seed 29's type was safely refused after a geometry/tree change and was not retried.
The two attempted Home actions both completed, but that conditional 2/2 is not the
primary workflow denominator or a reliability claim.

Historical v1 runs remain intact: initial **3/3**, repeat **1/3**, and stronger
diagnostic **2/3**. No production authorization rule was changed for those v1
experiments. V2 uses the separately reviewed Home contract and a distinct
two-action, no-recovery manifest. These are scripted native companion conformance
experiments, not live-agent or external benchmark scores.

## V2 acceptance and result

The new manifest is `markor-document-home-v2`, runtime identifier
`document-instrumentation-home-v2`, with fresh output directories named
`document-home-v2-<time>-<run>`. The evidence kind remains `scripted-emulator`.
Its lock and results declare protocol version 2; versioned native READY/EVENT
markers prevent an older recovery-enabled test APK from satisfying this runner.

The three seeds, complete six-file corpus, app pin, independent exact-byte oracle,
wall-time limit and trusted process-stop/reopen proof stay fixed. Acceptance now
requires the exact sequence: successful observation, reviewed/authenticated type,
fresh successful observation, reviewed/authenticated Home, independent foreground
match to Android's resolved `CATEGORY_HOME` launcher, owner force-stop with
exit 0, absent process with `pidof` exit 1 and no output, reopen and successful
observation of the exact editor/title, then complete file/inventory verification.
Every stale refusal fails the candidate case. The action budget is **two**;
recovery events, extra actions, reused observations and premature completion are
rejected by the transcript validator. There is no retry branch in the probe.

This candidate tests the separately reviewed native Home-only
post-consent tree-change equivalence. All pre-consent freshness checks and
post-consent app/signer/version/window/geometry/protection checks must remain;
typing must continue to require exact state. The test does not authorize that
production change or supply independent security proof of its implementation.
The root native checks own that contract's positive and negative verification.

Preparation passed **31 Node checks**: eleven document protocol/runner checks and
20 evaluator/verifier/review checks, including explicit stale/recovery/extra-action
failure cases and missing/false/premature launcher proof. Merely observing any
package other than Markor does not prove Home success. The candidate's native
build and lint passed; its JVM XML reports contain **44 tests, zero failures and
zero errors**. Exactly one bounded three-seed v2 acceptance was run, with no
threshold, retry or code changes during or after it. All v1 locks, reports and
metrics remain unchanged.

The retained v2 experiment is
`test-results/phone-control/document-home-v2-1789272272870-bc787daf045a4de3932f10f892124cf8/`:
[case evidence](../test-results/phone-control/document-home-v2-1789272272870-bc787daf045a4de3932f10f892124cf8/results.json)
and [failed gate report](../test-results/phone-control/document-home-v2-1789272272870-bc787daf045a4de3932f10f892124cf8/report.json).
It used the same dedicated API 36.1 emulator recorded below, companion APK
SHA-256 `61904eef09de40d2f14aad85a1f085563b63e0fa0faa4db69e5dbcb090ab6b48`
and test APK SHA-256
`76c94868a463ac3833639bf3be1bd2b18977929c575cc6fd76dcdd490729550a`.
The manifest digest is
`effa3d8179226602076c0009daf47cf567be639fc4752ff187d398a1723ed2b4`.
Source/artifact/parameter hashes remain in its immutable experiment lock.

| Seed | V2 joint result | Independent evidence |
| --- | --- | --- |
| 17 | Completed | Two reviewed/authenticated actions, resolved launcher visible, process absent before exact title/editor reopen, target bytes exact, inventory and all other five files unchanged; 36 native assertions. |
| 29 | Failed | Type refused at `predispatch_changed`, with `editor_bounds`, `other_bounds`, `tree_shape` changed. Target and all other five files remained byte-identical to their pre-case state. No Home, recovery or retry attempted. |
| 43 | Completed | Two reviewed/authenticated actions, resolved launcher visible, process absent before exact title/editor reopen, target bytes exact including original CRLF/no-final-newline content, inventory and all other five files unchanged; 36 native assertions. |

All initial seed-byte checks and four cleanup steps passed. The two completed-case
screenshots were independently inspected after process-stop/reopen: exact target
titles and original/additional text were visible. No completed screenshot is
claimed for seed 29. The refusal's diagnostic captures bracket a geometry/tree
transition; they do not establish its exact cause or a Unicode encoding defect.

The primary result is **2/3**, coverage **3/3**. Observation calls succeeded **7/7**,
but seed 29 stopped before completing its required observation sequence, so the
report fails both `task_success_threshold` and `observation_coverage`. Five
reviewed/authenticated mutation attempts were recorded: three type attempts and
two Home attempts. There were zero recovery attempts, mutation retries and model
success claims; recovery and claim-conditioned false-success rates are null.
All three cases retained complete inventory and unrelated-file checks.

V2 latency includes the failed type: observations n=7, p50 **55 ms**, p95/max
**110 ms**; actions n=5, p50 **3,571 ms**, p95/max **3,890 ms**. Per-case wall time
n=3 was p50 **17,205 ms**, p95/max **18,042 ms**; summed per-case consent intervals
were p50 **4,848 ms**, p95/max **4,874 ms**. These are small engineering samples,
not a paired speedup or population estimate. The failed candidate was not rerun.

## Frozen task and app

[document.mjs](../tests/phone-control/document.mjs) registers one joint workflow,
`document-edit`, with seeds **17, 29, 43** in that order. Each case must replace the
known synthetic target with its original contents plus the exact registered
addition, navigate Home through the companion, reopen through owner setup, and
pass independent persisted-byte checks. Preservation and reopening are requirements
of that same case, not extra tasks added to the success denominator.

The variants cover ASCII, Unicode (`café` and `日本語`), and a CRLF document whose
original final line has no newline. The oracle never trims or normalizes bytes.
The corpus has exactly six files: one target and one unrelated file per seed.
Before every case, owner ADB reads the complete inventory and bytes; afterward,
the [file verifier](../tests/phone-control/evaluation/verify-files.mjs) requires the
exact target, the same inventory, and all five other files byte-identical. It
accepts opaque byte records and cannot open arbitrary paths. Cases are sequential,
so already completed target files are also protected in subsequent cases.

The external app is [Markor v2.16.1](https://github.com/gsantner/markor/releases/tag/v2.16.1):

| Pin | Value |
| --- | --- |
| Package / versionCode | `net.gsantner.markor` / `163` |
| APK SHA-256 | `e88cdcced7aa3dca25e6b9c7a9bdcfad3e3988ee545be951f42bf9441b5e46bf` |
| Signing-certificate SHA-256 | `57d106d0cfa8763442b3645ef2741c38bb820bd56fd4612bf40a23b6d998be5e` |
| Exported editor activity | `.activity.DocumentActivity` |
| Native editor resource | `net.gsantner.markor:id/document__fragment__edit__highlighting_editor` |

The pinned [manifest](https://github.com/gsantner/markor/blob/v2.16.1/app/src/main/AndroidManifest.xml)
supports the owner `EDIT` launch of a `file://` URI with `text/plain`. The pinned
[editor source](https://github.com/gsantner/markor/blob/v2.16.1/app/src/main/java/net/gsantner/markor/activity/DocumentEditAndViewFragment.java)
saves on pause and changes its Save control according to edit state. That makes
the companion's separate consent activity a relevant lifecycle transition.
This is a source-grounded explanation to investigate, not proof of every observed
stale-state cause. Markor is installed unchanged; no third-party code was copied.

The downloaded APK passed `apksigner verify --print-certs`. Each run checks the
downloaded and installed APK hashes; the native probe independently checks the
installed version and signer. Its immutable experiment lock records the app pin,
companion/test APK and runner/probe source hashes, task digest, fixed parameters,
device identity and evidence kind before attempting the corpus. It is an owner
record, not remote attestation.

## Execution and authority

[DocumentProbe.java](../apps/phone-android/app/src/androidTest/java/io/github/quintond/orchestrator/phonecontrol/DocumentProbe.java)
is instrumentation-only and requires a debug companion, the three allowed seeds
and a 32-character hexadecimal run ID. The existing SmokeTest selects only
Markor and `observe`, `type`, `key` in its local test setup. No generic unattended
grant, planner, broker bypass API or production feature was added.

The actual task actions use the native companion HTTP surface: a fresh semantic
observation, the exact editable node, reviewed `type`, then reviewed `key home`.
Every attempted mutation opens the existing local review and real Android strong
biometric CryptoObject flow; owner QA supplies enrolled emulator fingerprint 1.
The editable value remains withheld in wire observations. The deterministic
executor already knows the registered synthetic replacement; it does not infer
or read an arbitrary user's document.

The historical v1 probe allowed an explicit `stale_observation` refusal of the
first Home action to permit one fresh observation and one Home recovery. There is
no type retry, unknown-outcome retry, timeout retry or fresh task budget in either
version. V1 allowed at most three attempted mutations; the current v2 requires
exactly two successful reviewed mutations and no recovery. Both use zero model
tokens and 180 seconds total; the instrumentation process
has a stricter 120-second host deadline. All attempts, refusals and timing samples
are retained. A failed action or missing native completion cannot pass merely
because Markor happened to autosave the expected bytes.

Owner QA installs the pinned APKs, seeds only a new UUID-named synthetic directory,
temporarily sets Markor's storage app-op and restores it, supplies simulated
fingerprints, performs process stop/reopen, and independently reads file bytes.
These operations are not source-runtime tools or agent actions. The probe uses
fixed setup commands, checks their exact exit markers, checks `pidof` returns 1
with no output after force-stop, and requires the editor and exact target title
after reopening. AOSP's [UiAutomation implementation](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-16.0.0_r1/core/java/android/app/UiAutomationConnection.java)
uses `Runtime.exec`; the helper explicitly feeds its fixed command to `sh` stdin
instead of assuming shell punctuation is interpreted by that API.

Cleanup stops companion/editor, restores the previous storage app-op and removes
only that exact owned remote directory. Existing app data is neither cleared nor
uninstalled. A case artifact failure, cleanup failure, setup failure, missing
variant, changed inventory or verifier failure forces a failed overall result.

## Retained experiments

All historical v1 experiments used the dedicated `emulator-5576`, AVD
`orchestrator-phone-control-api361-google-20260913`, SDK `36`, full platform
`36.1`, fingerprint
`google/sdk_gphone64_x86_64/emu64xa:16/BE4B.251210.005/14574095:userdebug/dev-keys`.
Artifact paths below are local, ignored QA output; keep them with any exported
report. Distinct experiment IDs preserve failed predecessors.

| Experiment directory under `test-results/phone-control/` | Joint workflow success | Evidence and limitation |
| --- | --- | --- |
| `document-1789269689434-148ce92a7fc64f0c94c8d8cfc043dfb2` | **0/3**, setup failed | Installed-path validation initially rejected Android's `~~` random directory. No document action occurred. The narrowly corrected pattern has a regression test. |
| `document-1789269732012-7af3b70944b340d78284425c1fe5b247` | **3/3**, initial scripted pass | All exact target/inventory/preservation checks passed; 12 observations, nine reviewed action attempts, three successful Home recoveries, 81 native assertions. The older owner helper requested process stop/reopen but did not prove shell exit or absent process. Initial remote seed-byte equality was also added after this run. |
| `document-1789269918214-d4a5d6c330e14edcb46271fe66ee8607` | **1/3**, repeat failed | Initial remote seed bytes verified. Seed 17 type was stale-refused and target remained original. Seed 29 completed. Seed 43 typed/saved correctly but both Home attempts were stale-refused; the case correctly failed despite exact target bytes. Eight observations, seven reviewed action attempts; recovery 1/2. Older reopen-proof limitation still applies. |
| `document-1789270582416-2185d0ee219e491a99629c2c793da702` | **2/3**, diagnostic failed | Seeds 17 and 29 completed with exact shell exit status, absent process and reopened editor/title proof, 38 native assertions each. Seed 43 typed/saved correctly but its sole Home recovery was stale-refused immediately before dispatch. All three exact target/inventory/preservation checks passed. Eleven observations, nine reviewed action attempts; recovery 2/3. |

All four completed experiments above passed their cleanup steps. The initial
3/3 does not replace the failed repeat and is not a reliability estimate. They
use distinct source revisions; their immutable source hashes retain that
distinction. No aggregate success percentage across these evolving diagnostics
is presented as a reliability result.

In the final run, every first Home refusal was `restore_timeout`, with only
`other_actions` and `other_enabled` changed. This is consistent with the pinned
editor's save lifecycle changing its Save control. Seed 43's recovery instead
failed at `predispatch_changed`, with `editor_bounds`, `other_bounds` and
`tree_shape` changed. That establishes a geometry/tree transition bracketed by
the diagnostic captures; its precise cause remains unresolved. Production
freshness checks stayed intact, and no further retries were added.

The final run's latency includes every failed action: observations n=11,
p50 **51 ms**, p95/max **123 ms**; actions n=9, p50 **3,872 ms**, p95/max
**5,113 ms**. Per-case wall time n=3 was p50 **22,848 ms**, p95/max **24,087 ms**;
summed per-case consent intervals were p50 **7,210 ms**, p95/max **7,249 ms**.
The report fails both task-success and recovery gates. No model success claim was
made (0 claims; the claim-conditioned false-success rate is null).

The first passing run's three screenshots were independently inspected: the
intended target title, original text and added line were visible, including the
Unicode case. The final run's seed 17 and 29 screenshots were also inspected after
the stronger process-stop/reopen check and showed the exact original/addition.
Owner screenshots aid QA; this manifest sets `requiresVisual: false` and records
**0 visual-oracle checks**, so it supplies no formal capture
validity score. File bytes, not visible text or a save claim, decide persistence.

Diagnostic events use fixed native failure stages (`preconsent_changed`,
`restore_timeout`, `predispatch_changed`, consent-context/expiry or other) and
fixed changed-field names such as `editor_selection` or `other_enabled`.
Before/after values exist only in test memory and are never exported as a raw
tree or text. These captures bracket the action; they do not instrument the exact
instant of the production check and therefore cannot by themselves prove a
race's cause.

## Reproduction and remaining limits

Use an exclusively leased, unlocked dedicated emulator with a strong fingerprint
enrolled, and obtain the exact pinned Markor APK at
`test-results/phone-control/third-party/markor-v2.16.1.apk`. Set `ANDROID_HOME` or
`ANDROID_SDK_ROOT` and `JAVA_HOME`; when neither SDK variable is set the runner
uses `adb` on PATH. Build from `apps/phone-android`:

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug --no-daemon
```

From the repository root:

```powershell
node --test tests/phone-control/document.test.mjs tests/phone-control/evaluation/*.test.mjs
$env:PHONE_QA_SERIAL = 'emulator-5576'
node tests/phone-control/document.mjs
```

The host creates a fresh output directory, writes `experiment-lock.json`,
`manifest.json`, `input.json`, `report.json`, `results.json`, the synthetic corpus
and screenshots for completed native cases. Exit 0 means all three joint cases,
the evaluator gate and cleanup passed; failures return nonzero. Do not overwrite
or discard failed runs or relabel a diagnostic rerun as a repaired first attempt.

The final v1 harness revision passed all **28 Node checks** (eight document protocol
and runner checks plus 20 evaluator/verifier/review checks), instrumentation
compilation, JVM test task and Android lint. The JVM report contains 35 passing
tests; the final task was up-to-date because production code had not changed.
Protocol tests reject forged success, wrong seeds, premature framework completion,
unknown fields, unsafe paths, oversized diagnostics, invalid recovery, and hidden
artifact/cleanup failures.

The measured consent interval runs from the ready review surface to the real
pending authorization result. It includes automated review/fingerprint delay and
Android authentication processing; it is not a human think-time measurement.
Action latency includes refusals and restoration/dispatch overhead. Small per-run
p50/p95 values are engineering diagnostics, not population performance claims.

The source runtime retains planning authority. This experiment does not involve
a model, broker, external agent runtime, broad app suite, semantic scrolling,
injection exposure, ambiguous-ack fault injection, local stop or physical device.
Its zero unsafe/duplicate/leak counters describe the bounded scripted path and
corpus checks, not a global device audit. Reliable editing across consent-induced
lifecycle changes remains an explicit follow-up: the v2 Home path completed where
reached, while exact-state typing still encountered a geometry/tree transition and
the joint acceptance remained failed. The [frontier specification](phone-control-frontier-evaluation.md)
and [readiness record](android-phone-control-readiness.md) define those broader
acceptance boundaries.
