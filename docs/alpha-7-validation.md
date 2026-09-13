# Alpha 7 deployment validation

Prepared 13 September 2026. This release introduces the optional Phone Control
component and its Android companion, then addresses the highest-priority
deployment and recovery findings from the
[Astra comparison](phone-control-astra-critical-review.md).

The portal remains `0.1.0-alpha.7`, the standalone broker is
`0.1.0-alpha.1`, and the separate companion is `0.1.0-alpha.2` / version code 2.
The gateway Android viewer retains `io.github.quintond.orchestrator` and advances
to version code 9. Component versions are independent; the release manifest
identifies their matching source and artifacts.

## Implemented deployment

- Every broker response is authenticated with an owner-provisioned Ed25519 key,
  bound to the request nonce, method, path, exact request bytes, HTTP status and
  response bytes. A signed predispatch refusal is distinct from an unknown result.
- Screenshot disclosure defaults to deny on the phone and intersects explicit
  session and source credential grants. Tree permission alone does not grant
  pixels. General input still requires the phone's strong biometric review.
- Bounded task reservations prevent competing workflows from interleaving UI
  mutations. Acquiring control invalidates earlier observations. Stop bypasses
  the reservation; ending one never verifies the task outcome.
- The typed source SDK has cancellation, aggregate budgets, bounded read-only
  recovery and metadata-only checkpoints. Read-only receipt reconciliation cannot
  replay interrupted work or clear uncertainty automatically.
- The portal displays task ownership/budgets and preserves pending mutation
  metadata across refreshes and reloads. Untrusted or contradictory receipts do
  not clear that local safety state.
- The supported confined profile runs source programs in a non-root Linux Docker
  container without network, host mounts, USB or owner credentials. A trusted
  relay exposes only the assigned broker session. The model/planner remains in
  its source runtime. This does not isolate an otherwise unrestricted planner
  running under the owner's host account.

## Local evidence

These records describe actual checks, not feature-completeness or model benchmark
scores. Historical failures remain in the ignored QA directories.

- Component suite: 120 tests passed, including response forgery, cancellation,
  task exclusion, durable uncertainty, disclosure and replay cases. Typed SDK
  declarations also passed TypeScript validation.
- Release tooling passed 60 tests for archive validation, signed upgrade evidence,
  source-bound SBOMs and record preservation. The real SBOM inventory check found
  86 npm components and 21 broker files. It corrected npm's omission of packages
  shared between development and production dependencies; a test inventory is
  not a published SBOM for the final artifacts.
- Root harness and evaluation parsers: 48 tests passed. Evaluation fixtures are
  synthetic scoring checks, not completed agent tasks.
- Native companion build, 44 JVM tests, strict lint and packaged legal checks
  passed. The official API 36.1 native runner passed 46 assertions in
  `test-results/phone-control/native-1789284941102/`.
- The real confined integration passed nine stages and all 30 independent
  observations in `test-results/phone-control/integration-1789284799053/`.
  A confined source program used the typed SDK and task checkpoint through the
  actual broker and emulator. The owner harness separately checked the final
  fixture counter. This was a scripted source program, with no model reasoning.
  Authenticated native Stop and private cleanup passed.
- Actual Docker boundary tests and independent adversarial source reviews passed.
  `test-results/phone-control/isolation/verification.json` records the immutable
  image, source hashes and 18 boundary probes. Provider network access is excluded
  from this profile; local program output may still be disclosed by the trusted
  outer source runtime.
- Focused browser QA passed 32 desktop/mobile journeys; server projection and
  response-authentication QA passed 18 tests. Screenshots were independently
  inspected. Evidence and original failures are retained in
  `test-results/phone-control/browser-review-20260913/`.
- Whole-workspace type checking and all 239 tests passed. The complete browser
  suite passed 155 tests; three existing desktop-only visual cases are excluded
  from the mobile project. All 32 Phone Control cases ran without skips.
- The enrolled API 36.1 emulator passed all 45 full biometric assertions and
  all 13 in-flight Stop assertions. The host driver passed 20 unit tests. Its
  sensor input now waits for the companion's observed fingerprint operation;
  each review still receives only one synthetic fingerprint touch.
- Windows desktop packaging and native-launch smoke passed, including persistence,
  locked port handling, identity forgery and graceful shutdown.
- Gateway Android QA passed all 16 journeys on the API 36.1 emulator, including
  the Phone Control preview, native Back, document pickers, private login,
  rotation, large text across every route and offline recovery. The Phone Control
  and large-text screenshots were inspected in
  `test-results/android/emulator-5576-1789286201331/`.
- The full signed companion upgrade passed all 24 assertions in
  `test-results/phone-control/signed-upgrade-20260913-alpha2-complete-d/`.
  It retained the installation, UID, allowlists, pins and private settings,
  rejected the old live authority and defaulted screenshot disclosure to deny.
  The alpha 1 baseline is a retained signed development snapshot, not a previously
  published companion release.
- The published gateway/desktop alpha 6 to candidate alpha 7 upgrade passed in
  `test-results/upgrades/alpha-mfbpTt/`. Existing records, encryption key, settings,
  sessions and Android installation were retained; the precise Compass migration
  and report refresh were verified. Neither upgrade cleared application data or
  uninstalled an existing application. Both proofs used pre-merge candidates;
  publication requires fresh proofs for the exact signed main-commit artifacts.
- Signed gateway smoke completed as an explicit linked recovery in
  `test-results/android/release-emulator-5588-1789288223478/`. Login, navigation,
  Back, process restart, session retention and offline reconnection passed.
  The installed APK bytes, UID, version and first-install timestamp were retained;
  the recovery did not install, clear or uninstall the app.

The first native run timed out before the enrolled emulator's credential storage
was unlocked. A later run failed during a foreground transition after 43
assertions. The runner now fails early when its test app cannot access credential
storage, and the owner test helper waits for the expected foreground package.
Production observation and authorization checks were not relaxed. The first
confined integration attempted to release an already-closed MCP process; the
harness now ends the reservation before closing that client. These failures are
retained in `native-1789283532917`, `native-1789283966298`, and
`integration-1789284609998` respectively.

Biometric diagnostics exposed two further test timing assumptions: sensor
activation could exceed the fixed one-second injection delay, and a launched
activity could appear after the probe's 400 ms sample. The driver now polls for
the exact app/user's new authentication request, and the probe waits within a
fixed deadline for the expected foreground package. Earlier consent and launch
failures remain recorded. These fixes change test observation, not production
authorization or mutation retries.

The first gateway upgrade reached the new signed application with its existing
session, then its database verifier rejected three automatic Compass records.
Read-only inspection confirmed the shipped template migration and a linked local
report refresh; all custom fixture records were unchanged. The verifier now
checks that exact migration and refresh chain against the two packaged templates
while retaining strict checks for user data, settings and prior report contents.
Eleven adversarial helper tests and the retained database comparison passed.
The original `test-results/upgrades/alpha-hqH8yR/results.json` remains failed;
a new complete installation run is required.

Independent release review also reproduced incomplete instrumentation parsing,
continuation records accepted after removing their summary marker, and unbound
probe hashes. The corrected release gate requires unambiguous terminal results,
the exact full-run assertion sequence and actual probe, fixture and source
hashes. These are owner-side evidence checks, not device attestation.

Two initial signed-smoke attempts encountered Android System UI startup ANRs
before address entry. After the observed system dialog was manually dismissed,
the test exposed a masked-password readback assumption and stale UI text
selectors. The corrected test enters the synthetic password once and verifies
actual login, checks the current exact screen states, and requires an explicit
failed-record link plus matching installed APK bytes for a recovery run. Earlier
failures remain recorded, including `release-emulator-5588-1789285789040`,
`1789287092841`, `1789287582789`, `1789287824333` and `1789288031799` under
`test-results/android/`. The completed run is recovery evidence, not a first-pass
fresh-install success.

## Hosted CI follow-up

Hosted Windows diagnostics exposed incompatible PowerShell module autoloading:
Node inherited PowerShell 7's module search path before launching Windows
PowerShell 5.1 for ACL inspection. A synthetic higher-version module reproduced
the same failure locally. ACL inspection now selects that child process's own
built-in modules; the regression failed before the correction and passed after
it. Setup also explicitly assigns private paths to the current account, covering
elevated tokens that default ownership to Administrators. Foreign ownership and
broad explicit grants remain forbidden. The earlier ownership-only diagnosis was
incomplete; both failed hosted runs remain recorded.
The corrected full component suite passed all 123 tests locally, and package QA
confirmed all 21 distributed source files. The new module regression's first
full-run fixture timeout is retained; its setup allowance changed without
altering a production timeout or retry.

That run also failed Android 14 native startup, Android 16 screenshot reliability
(five missing callbacks in 30 reads), and Android 16 QPR2 emulator startup before
instrumentation. Native diagnostics now
report only fixed, allowlisted harness phases; eight parser tests cover injected,
unknown and excessive stage values, and the Android test APK build passed. The
additional diagnostics do not change assertions or retry device actions.

A fresh matching local Android 14 run passed 44 assertions, and the subsequent
hosted Android 14 native/integration job passed. The original failure is retained;
its coarse diagnostics do not establish a specific cause. Android 16 QPR2 failed
before testing in both hosted runs: the boot flag appeared while input/settings
services were absent or the input call returned a broken pipe. The owned
[CI launcher](android-emulator-ci.md) now checks live services and a stable system
server before configuring input, retains bounded diagnostics, and checks cleanup.
Its actual Linux execution remains a required CI gate.
All 14 launcher tests passed in a disposable Linux container, including real
parent/child termination after timeout and output overflow. The Windows run
passed 11 and explicitly skipped the three Linux subprocess checks. The real
Linux check caught an ineffective `execFile` process-group option; the corrected
helper uses `spawn`, and the original failed container probe remains documented.
All 30 native/upgrade harness parser tests and 60 release/evidence tests passed.

The next hosted attempt passed both broker platforms and isolation, then all
three companion jobs stopped before emulator startup. Google's response used
gzip: its advertised 329,592,949 transfer bytes did not equal the decoded
331,232,577-byte ZIP. The download preflight had incorrectly equated these sizes.
The corrected helper treats transfer headers as bounded diagnostics and still
requires the exact decoded size and pinned SHA-256 before extraction. All 23
Linux tests passed, including real compressed/chunked HTTP and refusal cases;
Windows passed 20 with three explicit Linux-only skips. Nine additional
independent HTTP adversarial cases passed. The actual Google download also
matched the decoded size and checksum using the corrected helper. Original
pre-start failures remain in `ci-launcher-34749110937-attempt2`.

The following hosted run verified the pinned download on all three images but
stopped in the combined extraction/version stage before creating an emulator.
An owned Ubuntu 24.04 reproduction showed plain `-version` failing on a GUI audio
library dependency, while `-no-window -version` succeeded with the same binary.
The probe now selects headless mode and records separate extraction/version
stages with typed command failure details. Its Linux suite passed 25 tests;
Windows passed 22 with three Linux-only skips. The original hosted diagnostics
do not prove the exact failed subcommand; the setup reproduction and the next
required native CI run provide distinct evidence.

The second hosted gateway Docker job also failed before building project code
because Docker Hub returned HTTP 502 for the BuildKit image manifest. The first
run passed. This infrastructure failure remains recorded; the final source must
still pass the normal Docker build check.

Release qualification uses strict native/integration gates on selected Android
14, Android 15 and patched Android 16 QPR2 emulator images. The older Google
Android 16 revision 7 image remains outside this qualification because of its
upstream capture callback defect. Its separate manual compatibility workflow
retains strict assertions and actual failed results; it cannot substitute for
the required release workflow. See the [capture investigation](phone-control-capture-investigation.md)
for the exact failing build and the evidence limits. No API-level blacklist,
automatic capture retry, hidden failure allowance or production guard relaxation
was introduced.

Browser QA reproduced an unhandled unavailable-`randomUUID` failure before any
Phone Control request was sent. Request IDs now use the browser's cryptographic
`getRandomValues` API with UUIDv4 version/variant bits. If entropy is unavailable,
no request or false receipt is created, existing pending uncertainty survives,
busy state is released, and Stop remains available. Whole-workspace type checking
and all 243 tests passed; the web build and all 40 desktop/mobile Phone Control
journeys passed. Screenshots were inspected. The original failure and corrected
test-fixture failures remain in the UUID review evidence. An HTTP-origin shell
confirmed the differing browser API availability; the full application still
enforces its existing CSP and the native gateway rejects non-loopback HTTP.
These checks do not establish native LAN HTTP support or WebView acceptance.
The subsequent hosted full browser run on `301fc530` passed 163 cases, with the
three existing desktop-only mobile exclusions retained.

The next complete candidate (`3fefa6f3`) passed general CI, all six desktop
targets and CodeQL. Android 15 passed 47 native assertions, all eight integration
checks and all 30 independent observations, but the launcher failed its immediate
shutdown confirmation. Android 14 passed the same native assertions, then its
third integration observation returned `session_expired`; the remaining reads
failed closed. Its entire integration and cleanup lasted under 35 seconds, so
the 180-second probe and 600-second sessions do not explain that termination.
Android 16 QPR2 reached initial services readiness but repeatedly restarted
`system_server` and never unlocked: 54 observed PIDs across 266 samples, with no
application tests run. Its fractional SDK was correctly reported as `36.1`.
These failures remain retained under `ci-launcher-34750588755-attempt1`.

Shutdown now observes both process exit and removal of the ADB registration
within bounded waits; missing or failed ADB reads cannot confirm cleanup.
Diagnostics-write and ADB-query failures cannot prevent the owned-process stop
attempt, and still leave the job failed when evidence or retirement is missing.
Test-only host-probe diagnostics record fixed lifecycle reasons, elapsed time and
power/keyguard facts to investigate the Android 14 termination. All 37 harness
parser tests passed, including seven new cases, and the instrumentation APK
compiled. Boot failure diagnostics retain bounded framework code locations only
before application tests start. Independent review caught and corrected native
prose and message-embedded locations being misclassified as frames. No session
duration, capture retry, production guard or readiness deadline was relaxed.

Candidate `70ac9c1d` passed general CI, all six desktop targets and CodeQL.
Android 14 and 15 each passed 47 native assertions, eight integration checks,
30 independent observations and confirmed process/ADB retirement. QPR2 still
restarted before tests. The next candidate records its explicit graphics profile
and bounded storage facts; [the launcher notes](android-emulator-ci.md) explain
the controlled profile change and limits on causal conclusions.

The host-probe harness now requests raw instrumentation output and requires the
complete successful lifecycle record after authenticated Stop and stdout drain.
Absent metadata, invalid protocol order and late output overflow cannot pass.
All 39 harness tests passed; a real API 34 probe returned the expected raw
`paired_host_stop` record while preserving installation identities. Independent
review tested 26 invalid protocol reorderings. The launcher and diagnostic suite
passed 48 checks in a real Linux container, including four subprocess checks;
Windows passed 44 and explicitly skipped those four. Fresh complete hosted
integration is still required for this candidate.

Candidate `d248f9b4` passed Android 14 and 15 again, including the complete raw
Stop lifecycle record. QPR2 reached readiness but failed in APK installation,
before instrumentation. Its default `androidStable: false` after failure was
not an independent observation of a restart. The updated launcher records a
real post-test snapshot for unsuccessful tests too; missing proof cannot pass.

The CI log exposed tools 12.0 behind the launcher's hardcoded `latest` path,
despite setup selecting tools 16.0 separately. A checksum-verified tools 12.0
reproduction generated an 800 MiB Pixel 7/QPR2 data partition; tools 21.0 used by
local QA generated 6 GiB. Newly created CI AVDs now explicitly use 6 GiB and the
selected tools revision. Guest free-space observations and typed per-APK install
results will test this correction without inventing the earlier error code.
The final local diagnostic checks passed 51 Linux tests and 46 phone harness
tests. Independent review covered failed tests with ready Android, unavailable
state, exact tool-version selection, installation failure and output redaction.

Candidate `d06a23cb` passed general CI, all six desktop targets and CodeQL.
Android 15 passed the complete companion suite. Android 14 passed native QA,
then its service's `onDestroy` ended the integration session after 12 seconds
while the system-server PID remained unchanged. The diagnostic label
`accessibility_disabled` records that lifecycle callback; it does not establish
that a person changed the setting. QPR2 failed before tests during initial
configuration, with mapper/composition-sampling crash locations and exit 224.
All owned emulator shutdowns were confirmed. These failures remain retained.

Actual API 34 inspection found that `df /data` reports `/data/user/0`, explaining
why guest facts were missing even in passing jobs. The fixed numeric `stat`
query measured 6,228,115,456 filesystem bytes and 5,057,662,976 available bytes
on the existing local AVD, without changing its configuration or installing
APKs. It does not retroactively establish capacity in the previous CI run.
The next Linux candidate uses one explicit `swangle`/Vulkan-disabled profile,
with the corrected tool and storage configuration, and exact mapper assertion
categories. All 53 local Linux launcher/diagnostic checks passed; fresh hosted
native and integration acceptance remains mandatory.

The native harness also drains Android's queued force-stop broadcasts before
the next probe can re-enable accessibility. Framework source shows that a late
`PACKAGE_RESTARTED` handler can remove that newly enabled service. Five tests
verify the actual cleanup sequence, preserve command failures and require later
cleanup attempts. The barrier command passed on API 34, but local lifecycle
probes failed before establishing a session, so the CI service-destruction cause
remains unproven. All 51 phone harness tests passed. Production lifecycle Stop,
session authority and action-retry rules are unchanged.

Candidate `b9d1a09a` again passed general CI, all six desktop targets and CodeQL.
Independent review checked every desktop archive and file checksum, 13 smoke
checks per target, and the gateway's 16 Android journey results and screenshot
inventory. Direct visual review covered the gateway Phone Control preview and
the API 34 integration fixture capture.
Android 14 passed 47 native assertions, four cleanup steps, eight integration
checks and all 30 observations, ending with authenticated Stop. Android 15 passed
all native assertions but timed out in the new global application-thread barrier;
integration correctly did not run. Framework source shows that this option waits
on all running apps and can eventually return zero even after giving up.
The replacement observes the exact companion enabled-service transition after
force-stop, preserving the ten-second bound and all cleanup failure gates.

QPR2 failed while waiting for the unlocked user before any tests. The new fixed
diagnostic identified an unavailable readback-DMA capability in the emulator's
graphics mapper. Actual guest storage was healthy: 6,228,115,456 total bytes and
5,260,558,336 available. There were 44 distinct system-server PIDs in retained
readiness samples; shutdown was confirmed. The precise capability failure is
separate from the Android 15 teardown timeout. Earlier crash traces without the
assertion cannot be retrospectively assigned the same cause.
QPR2 now explicitly enables the two host features required to advertise that
capability: `GLDirectMem` and `HasSharedSlotsHostMemoryAllocator`. This removes
dependence on mutable feature-server overrides for those requirements, while
retaining the renderer, image, emulator pin, storage and readiness bounds.
Fresh hosted qualification remains mandatory.
The revised candidate passed 54 Linux launcher/diagnostic tests and all 59 phone
harness tests. Thirteen focused cleanup/removal cases cover incomplete replies,
component aliases, pre-existing absence, failed force-stop, late observations
and cleanup after failure. License-boundary and diff checks also passed.

## Release gates

An independent pre-publication audit reproduced acceptance of an incomplete
gateway upgrade report marked successful. The actual harness performed its
checks, but the manifest gate did not require the complete report. The gate now
requires all eleven original checks, typed record-preservation results, an
emulator target, no cleanup error, all four baseline/candidate artifact hashes
and the three harness source hashes. The harness snapshots those bytes before
use and rejects changes before declaring success. All 96 release/evidence tests
passed, including 36 new acceptance and refusal cases. Earlier upgrade records
without this binding remain historical; publication requires a fresh full run.

The PR and release manifest must record the final whole-workspace/browser results,
signed companion and gateway upgrade proofs, native acceptance, clean source
commit, successful main CI and all six desktop archives. Source merging and
publishing the full distribution remain separate operations. Do not describe
publication as complete until the fresh signed APKs and matching assets exist.

Physical Android 14+ biometric acceptance, OEM coverage, TalkBack, battery/thermal
measurement, broad held-out live-agent tasks and an Astra-controlled comparison
remain open. Generic per-action input does not enforce document/account/effect
permissions; resource-specific editing adapters and production independent
verifiers remain future work. The current distribution is an explicit alpha
deployment for emulator and controlled owner testing, with Phone Control disabled
until separately configured. It is not a production-readiness or parity claim.
