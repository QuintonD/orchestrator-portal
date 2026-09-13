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

Candidate `9abcbfbd` passed the complete Android 14 and 15 native/integration
workflows with five cleanup steps each. Observed service removal took 7,016 ms
on API 34 and 287 ms on API 35, demonstrating why a fixed short sleep cannot
replace that acknowledgement. QPR2 reached readiness, installed all three APKs,
and retained one stable system-server PID with no recorded crashes. Its native
test then failed before the first assertion in accessibility setup; cleanup
observed service removal in 408 ms. No capture or integration result is claimed
for that QPR2 run.

The setup investigation found another timing assumption: instrumentation writes
the enabled-service setting off, sleeps 500 ms, then writes it on. Android's
settings observer compares the current database value with its cached enabled
set; if the writes coalesce, it can miss the disabling transition needed for a
rebind. The public enabled-service list only enumerates bound services and
cannot by itself prove that the cached set changed. This is a source-supported
setup gap; the failed CI artifact does not expose the earlier cached state.

Intel Mac packaging in that candidate failed to connect to `nodejs.org` while
downloading the pinned Node archive. Only that failed job was rerun, and all six
desktop packages then passed complete checksum inventories and 13 smoke checks
each. The original timeout remains recorded separately from the passing retry.

The replacement setup observes Android's cached enabled, binding and crashed
service sets and the local connection before enabling the service once. Its
fixed shell commands share a 20-second deadline; bounded stdout/stderr, complete
dump framing and command status are required. The helpers are included only in
the instrumentation APK and debug JVM tests. An independent DEX inspection
confirmed their absence from the companion app APK. The first build passed 56
JVM tests, lint and 60 Node harness tests, but actual QPR2 execution failed before
its first assertion with `ExceptionInInitializerError`; all five cleanup steps
passed. A separate ICU reproduction rejected the helper's unescaped closing
regex brace, which the JVM accepted. Escaping that literal brace compiled under
ICU. This failure and the original APK hashes remain recorded.

The corrected build passed 56 JVM tests, 61 Node harness tests, lint and legal
packaging. Actual QPR2 execution then passed 46 native assertions and all five
cleanup steps in `test-results/phone-control/native-1789310764747/`. The subsequent
CLI/MCP/portal integration passed all eight checks, 20 tree observations and ten
window screenshots without failed observations. Its original native terminal
evidence confirmed authenticated paired-host Stop; all cleanup passed. The
fixture screenshot was inspected in
`test-results/phone-control/integration-1789310825775/`. The corrected helper's
device pass does not establish that settings coalescing caused the earlier CI
failure. Fresh hosted checks remain a separate gate.

Candidate `f5d1915a` passed general CI, CodeQL and all six desktop targets on
their first attempts. Android 14 and QPR2 passed complete native and integration
QA. Android 15 failed during the cached-disable setup with no completed native
assertions; its system-server PID remained stable and no crash was recorded.
The retained result does not distinguish its last cached state from a shell
failure or local connection delay.

The native host no longer enables accessibility immediately before
instrumentation restarts the app process. Instrumentation owns the existing
disable acknowledgement and single enable. Fixed, bounded failure facts now
distinguish setup point, elapsed time, shell phase and the last observed state
without exporting shell replies. JVM QA passed 60 tests and the host suite
passed 64 tests. Local Android 15 then passed 47 native assertions, but its
cleanup query failed after successful force-stop; this remains a failed run in
`test-results/phone-control/native-1789312017721/`. A later read confirmed the
setting absent. Independent integration passed eight checks, all 30 observations
and authenticated paired-host Stop, with complete cleanup and an inspected
fixture screenshot in
`test-results/phone-control/integration-1789312179419/`. The original cleanup
query's transport details were not recorded, so its subcause remains unproven.
Host-only diagnostics now preserve bounded process/query facts on failure;
timeouts, retries and pass criteria are unchanged. All 69 host tests passed.
The explicitly linked full native check in
`test-results/phone-control/native-1789312397409/` passed 47 assertions and all
five cleanup steps. It did not reproduce the earlier query failure and does not
retroactively make that first run successful.

Candidate `2cf3e4e6` passed all 60 JVM tests and 47 native assertions on each
hosted image. Android 15 and QPR2 completed integration and cleanup. Android 14
failed only its cleanup observation: 42 complete successful reads still showed
the target enabled, and the final read timed out at 10,002 ms. Force-stop had
succeeded, Android remained stable, and the other four cleanup steps passed.
This establishes that the old ten-second observation window was insufficient
for that run; it does not establish when removal would have occurred.

The test harness now allows 30 seconds to observe that cleanup transition, with
a 35-second outer limit for that one step. The two-second per-read limit,
200 ms polling, strict output validation and immediate query-failure rejection
remain in force. Product Stop, action and session deadlines are unchanged. All
72 host tests passed, including absence after 12 seconds, rejection at or beyond
30 seconds, immediate failure on an invalid late query and complete bounded
sample counts. The actual local Android 14 check passed 44 native assertions
and all five cleanup steps in
`test-results/phone-control/native-1789313294727/`. The assertion count includes
checks over observed nodes; this local display differs from the hosted image.
Fresh hosted acceptance is still required for this allowance.

## Android 14/15 capture follow-up

Candidate `c2bf845f` passed general CI, CodeQL, all six desktop targets, and all
native/installation/cleanup checks across the three Android images. Android 14
and QPR2 completed all eight integration checks and 30 observations. API 35
completed seven checks and 28 of 30 observations: reads 16 and 19 reported
`screenshot_internal_error`, `awaiting_callback`, after 5,004 and 5,003 ms.
Its system process remained stable and authenticated Stop passed. Run
`34765827817` and all original attempts remain failed evidence.

Pinned source review found the known weak JNI consumer in Android 14/15 and no
public API with which the companion can retain it. These two request failures
remain causally unproven. The owner explicitly retained support for Android
14/15 instead of limiting automation to a QPR2 emulator fingerprint.

The [bounded recovery contract](phone-control-android-14-15.md) permits one fresh
read only after the exact internal-error callback on API 34/35, within the same
nine-second overall observation budget. It repeats every privacy check, retains
the first failure through protocol projections, and cannot retry a mutation.
Logical-request completion and first-attempt failures are measured separately.
The new build passed all 73 JVM tests, lint and legal packaging. Actual API 35
native QA passed 47 assertions with complete cleanup in
`test-results/phone-control/native-1789318587474/`. Integration then passed all
eight checks and 30 logical requests in `integration-1789318728790/`: 29 first
attempts succeeded, one failed after 5,010 ms and its fresh read completed at
5,257 ms total. There were no terminal failures. The fixed missing-consumer log
count rose from zero to one for the same sampled companion PID; raw logs were
discarded. This does not establish per-request causation or a general recovery
rate. The fixture PNG was inspected, system-server PID 619 stayed stable,
authenticated Stop took 372 ms, and all cleanup passed. The owned emulator was
stopped with its data preserved. Fresh hosted acceptance remains required.

Local CI also passed all 135 component tests, 246 workspace tests, 79 harness
tests, 20 evaluation tests and 96 release-evidence tests, plus production builds
and type checking. The 44 focused desktop/mobile browser cases passed without
retries or skips; four recovery screenshots were inspected. Independent review
found and corrected dropped diagnostics in CLI failures, confined-program
postcondition failures, SDK cancellation/budget checks and failed stable waits.
The final SDK follow-up passed 36 focused tests and exact package checks.
These checks do not convert earlier failed captures into first-pass successes.

Hosted candidate `1e711467` passed the complete Phone Control workflow
`34770521738` on its first attempt: each image passed 73 JVM tests, 47 native
assertions, three installations, all cleanup and eight integration checks.
API 34 and QPR2 had no first-attempt failures in their 30-read samples. API 35
retained one failure after 5,017 ms and a successful recovery at 5,272 ms total;
no logical request failed. All six desktop targets and CodeQL also passed.
General CI's completed tests included 167 browser passes and three intended
cross-project exclusions. These are results for this candidate, not the later
release commit.

Additional enrolled-QPR2 QA passed 46 native assertions and cleanup, then failed
during the full biometric swipe sequence. The Python driver rejected the native
`phone_qa_failure_stage` field before draining the failure summary, so the
underlying action failure was not retained. The original log remains failed in
`test-results/phone-control/observation-recovery-20260913/qpr2/biometric-full.log`.
Read-only device checks found a stable system process and no crash entry.

The driver now accepts only fixed failure-stage metadata, latches failure and
drains the bounded failure summary. A later PASS cannot clear that failure;
unknown, duplicated or contradictory fields still reject, and no sensor input
is injected after the failure marker. All 27 driver unit tests passed and
independent review found no blocker. Other unknown failure metadata can still
abbreviate diagnostics while leaving the run failed.

One explicitly linked diagnostic run then completed all 45 biometric assertions,
and the separate in-flight Stop run passed all 13. Neither changed the APK or
replayed an action within the failed run. The original swipe-period subcause
remains unknown: the parser fix restores diagnostic evidence, not a demonstrated
product correction. These are linked follow-up results, not a first-pass claim.
The confined SDK follow-up and fresh hosted checks remain separate gates.

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

## Post-merge release QA follow-up (13 September 2026)

PR #26 merged as `2d9d56b50cf86f4bcde7d6a77647a3b7b581ea9a` after all current PR workflows and independent artifact reviews passed. Publication remained gated on fresh signed builds and complete upgrades. Both clean-main signed APK builds passed; the companion upgrade passed all 24 assertions, preserving its installation, settings, permissions and signer and rejecting old active authority.

The first main Phone workflow [34772214665](https://github.com/QuintonD/orchestrator-portal/actions/runs/34772214665) failed on Android 15: its first CLI fixture action returned `deadline_expired`, before any of the 30 sampled reads. Native 47 and all cleanup passed. The first observation took 380 ms. No paired clock facts survived, so clock skew is a hypothesis, not an established cause. One explicitly linked fresh-emulator check, [34772769701](https://github.com/QuintonD/orchestrator-portal/actions/runs/34772769701), used unchanged deadlines and assertions; its result is recorded in the PR/release evidence. That fresh run passed Android 15 and QPR2 completely, but Android 14 stopped after 23 native assertions with `screenshot_internal_error`; integration did not start. Source/assertion evidence points to the positive fixture action capture guard, where no read recovery applies, rather than a failed observation recovery. Exact capture-stage timing was unavailable. All native installation and cleanup checks passed. Neither run is relabelled as successful and no further unchanged rerun was requested. The follow-up harness adds bounded, read-only clock measurements for subsequent diagnosis; it does not adjust clocks or action authority.

Gateway upgrade evidence `test-results/upgrades/alpha-FpnoNi/` stopped during baseline setup before installing the candidate. The retained screenshot shows a System UI ANR. After the visible Wait action and baseline setup recovery, a full supported retry (`alpha-UtZUKW/`) exposed a test-driver bug: the password field correctly contained 25 masked U+2022 characters, while the helper required plaintext. The explicit password-entry helper verifies a password field and mask length; successful authentication and the Portal transition still verify the actual credential. Neither failed attempt is upgrade acceptance. Data was preserved when retiring that owned emulator.

A new complete release build and both full upgrade proofs from the reviewed follow-up main commit remain required. No previously built APK, continuation-only check or old artifact identity may qualify publication.

The password helper then passed a full real-emulator regression in `test-results/upgrades/alpha-NMPG41/`: all 11 checks passed, including actual login, signed in-place APK upgrade, eight preserved record groups, the shipped Compass migration, unchanged master key, and phone origin/session preservation. The after-upgrade screenshot was inspected. All 106 local release tests also passed, including ten password-driver regressions. This used the preceding main APK with uncommitted follow-up QA source, so it validates the helper fix but does not qualify the final release bytes.

## Protected password representation compatibility

On the fresh release emulator, `test-results/upgrades/alpha-xLRCNQ/` stopped before candidate installation because Android marked the native field `password=true` while exposing its exact value to the owner-side QA driver. The earlier retained emulator exposed only U+2022 masking. The helper now accepts either an exact comparison performed locally or the expected mask length, always after confirming a protected native EditText. It exports neither representation. Wrong same-length values, partial entry and loss of password protection still fail; successful login remains the credential acceptance check. This is a test-driver compatibility change, not a change to companion disclosure or action authority. Both failed baseline attempts and their device evidence remain retained.

The corrected compatibility helper passed all 107 release tests, 11 focused driver tests and five independent adversarial checks. Its full emulator upgrade regression (`test-results/upgrades/alpha-h0ah5z/`) passed all 11 checks with actual login and preserved records, key, installation identity, phone origin and session. The upgraded screenshot was inspected. The original incomplete local patch test remains failed evidence; the corrected regression uses the preceding source APK and is not final release acceptance.

## Final-main qualification and failure evidence

Clean main `1bba3647` passed General CI [34774289681](https://github.com/QuintonD/orchestrator-portal/actions/runs/34774289681), CodeQL and all six desktop builds. General CI recorded 107 release tests, 246 workspace tests, 16 Android journeys and 13 large-text routes. The browser result was 166 first-attempt passes, one lost-acknowledgement banner case passing on its built-in retry, and three intended skips. The first browser failure remains unexplained; its trace was not uploaded. Independent review verified all 25 Android PNGs and inspected the current critical screens.

Fresh signed companion and gateway builds embedded that clean commit. Complete in-place upgrades passed 24 companion assertions and 11 gateway/desktop checks, with signatures, installation identity, settings, database records and key preservation independently verified. These proofs qualify those exact bytes only.

Phone workflow [34774290865](https://github.com/QuintonD/orchestrator-portal/actions/runs/34774290865) failed after 27 successful API 35 integration reads: the host instrumentation ADB process exited 255, terminal native metadata was absent, and owned-forward removal failed. The companion and system process remained stable in subsequent samples; the transport interruption's cause is unproven because stderr was discarded. The QPR2 job passed functionally but retained an unattributed fatal marker; two diagnostic patterns can count the same marker, so this is not proof of two crashes or a system-server crash.

One explicitly linked fresh qualification, [34774805620](https://github.com/QuintonD/orchestrator-portal/actions/runs/34774805620), passed Android 14 and 15 completely: each had 73 JVM tests, 47 native assertions, eight integration checks, 30 successful reads, paired-host Stop and all cleanup. QPR2 failed with an AssertionError after 25 native assertions and did not start integration. Its installation, native cleanup and emulator retirement passed; the system process was stable and crash counters were zero. Variable per-node assertions prevent identifying the failing check from the count alone. Both workflows remain failed evidence, and publication stayed held.

Independent review found a separate replay-conflict test bug: the original deadline was `t0 + 30,000`, while the allegedly changed payload used a later `now + 29,000`. At exactly one second between samples those values coincide, and a correct cached receipt fails the test's conflict expectation. The fixture now derives a guaranteed different deadline from the original value. This corrects the test without changing the production replay ledger; the earlier QPR2 failure cannot be attributed to it from assertion count alone. Fixed failure checkpoints and bounded transport markers support subsequent diagnosis without retaining private output or authorizing retries.

Local follow-up validation passed 107 release tests, 107 phone harness tests, 80 JVM tests, Android lint/build and licence checks. The rebuilt native test on the enrolled QPR2 emulator passed 46 assertions and five cleanup checks; its integration run passed all eight checks, 30 observations without capture failures or recovery, paired-host Stop (226 ms), and all 24 cleanup checks. The fixture screenshot was inspected and the system process stayed stable. The device was retired with its data preserved. This validates the test correction and initial diagnostic collector; the subsequent host-only stderr-closure completeness flag received separate regression coverage. Hosted qualification and fresh final release artifacts remain required.
