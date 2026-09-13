# Phone Control implementation and readiness

The [alpha 7 deployment record](alpha-7-validation.md) covers the subsequent
response authentication, screenshot grants, task reservations, confined source
execution and signed-upgrade work. Historical results below retain their original
scope and failures. The owner authorized continued emulator validation and an
alpha deployment; physical-device acceptance and Astra parity remain unestablished.

The later Android 15 gate at `c2bf845f` failed two of 30 observations. Android
14/15 remain in scope by owner decision; a
[version-specific read recovery](phone-control-android-14-15.md) is being added
with explicit failure accounting and unchanged privacy/action checks. The earlier
passing records below do not erase this failed gate or qualify the new behavior.

Updated: 13 September 2026. Work is on `feat/android-phone-control`.
Implementation is available for alpha QA. Regular Android 14 integration,
visual capture and biometric workflows passed. Two scoped live model clients
separately passed fixture tasks using tree observations on the ATD. New Android
16 QPR2 capture and biometric checks passed; earlier Android 16 failures remain
recorded. Physical-device acceptance and the remaining release gates below are open.
The task includes implementation, delegated engineering, testing and quality
control. This record must distinguish intended acceptance criteria from actual
test evidence. Neither a green unit suite nor a functioning prototype establishes
production readiness or Astra parity.

## Frontier engineering phase: 13 September

The owner requested a deeper delegated implementation. Three independent agents
covered native capture, broker/SDK security and frontier evaluation, with the lead
integrating semantic controls, portal changes and cross-component QA. Follow-up
reviews challenged the new native fingerprint, SDK and scoring rules. Verified
findings were reproduced and fixed, rather than accepted as review assertions.

- **Capture:** located AOSP commit
  [`7549d7629fb0939b1cdac7a3695dcaf5e832d8aa`](https://android.googlesource.com/platform/frameworks/base/+/7549d7629fb0939b1cdac7a3695dcaf5e832d8aa),
  which fixes the screenshot listener's weak-reference lifetime. New SDK 36.1
  Google APIs revision 4 passed all eight integration stages and 30/30 independent
  reads (20 tree, 10 PNG). Tree p50/p95: 295/780 ms; PNG: 459/865 ms; Stop: 313 ms.
  Native smoke passed 44 assertions and the full emulated biometric workflow
  passed 45. Evidence: `integration-1789268565771`, `native-1789268513639` and
  `native-api361-acceptance-1789268820000` under `test-results/phone-control`.
  The [investigation](phone-control-capture-investigation.md) records the exact
  platform, upstream sources, memory measurements and inspection. No unsupported
  capture fallback, hidden API, retry or weaker privacy gate was added.
- **Native robustness:** screenshot callbacks now have one-way ownership;
  duplicate/late callbacks cannot release the active encoder slot. Rich semantic
  observations and authenticated `node.scroll` support forward/backward controls.
  Length-prefixed, bounded app identifiers prevent ambiguous screen fingerprints.
- **Authority and SDK:** broker restart revokes persisted session authority;
  scoped Stop bypasses normal rate, persistence and busy paths; replay expiry
  respects capture time. Portal-issued credentials bind to the selected session.
  The standalone SDK adds exact, unique selectors and bounded observation waits,
  consumes action bindings, preserves request IDs on uncertain transport, strips
  unsupported result metadata and prevents a late result undoing Stop.
  [Security review](phone-control-security-review.md): 79 broker/SDK tests and
  independent 12-file archive validation passed. Host isolation remains a
  deployment gate; a restricted VM design is documented but has not been tested.
- **Evaluation:** [current primary research and implemented scorer](phone-control-frontier-evaluation.md)
  define 27 planned engineering slots, independent byte-level document checks,
  complete denominators, uncertainty and safety gates. These are engineering
  targets; no canonical external benchmark or new live-agent score is claimed.
  Twenty evaluator/verifier tests passed, including independent false-success
  and sparse-measurement regression findings.
- **Portal QA:** all workspace builds and `npm run check` passed (234 tests:
  204 server, 16 web, 14 contracts). Eighteen focused desktop/mobile browser
  journeys passed, including session binding and exact semantic-scroll requests.
  Twenty-five root harness tests passed, including fractional platform provenance
  and strict document transcripts (in addition to the 20 evaluator tests).
  CI now includes SDK 36.1 as well as 34 and the previously failing 36 image;
  the older gate was retained. The remote workflow has not been run.

An initial semantic-scroll trial failed after nine assertions without a native
error diagnostic. A separate diagnostic trial passed all 14 assertions, including
both biometric-approved directions and independently checked scroll effects.
Only the assertion diagnostic changed between these runs. The first failure is
retained and unexplained; a later pass does not establish its correction. This
remains a reliability investigation before production acceptance.

The real Markor document experiments then exposed a consent lifecycle problem:
the initial run completed 3/3 joint workflows, its repeat 1/3, and the strengthened
diagnostic 2/3. Exact saved bytes could pass while required navigation still
failed; those cases correctly failed the workflow. The
[document QA record](phone-control-document-qa.md) retains all attempts and the
stronger process-stop/reopen proof. These are scripted native experiments, not
live-agent benchmark scores.

An independently reviewed Home-specific consent contract now permits changed
tree content only after permission to leave the same pinned app/window. It keeps
the initial exact observation, all app/window/geometry/protection checks and
current authority. Other actions retain their original content binding; the
review discloses possible save/lifecycle effects. Nine comparator regression
tests passed. The combined build passed 44 JVM tests, app/fixture lint and legal
asset verification; the final host biometric driver passed fourteen tests.

The [final-build lifecycle trial](phone-control-home-lifecycle-qa.md) passed 37 assertions and all seven emulated
CryptoObject markers on its first attempt. It independently verified Home reached
the resolved launcher after a pause-time change and rejected stale pre-consent
state, changed-content tap/Back, secure/password transitions, revoked grants,
deadline and Stop. The separate semantic trial passed 14 assertions. The full
generic regression failed after 40 assertions on a read-only
`screenshot_geometry_changed` refusal after local denial (`encoding`, 7 ms).
All nine mutation paths and the changed-content/checkbox refusals had already
passed, but the remaining assertions are not claimed. No capture guard was
weakened and no rerun replaced this failure. Evidence:
`test-results/phone-control/native-home-lifecycle-1789271940923`.

The [consent lifecycle investigation](phone-control-consent-lifecycle.md) also
records why a service-overlay biometric replacement is not an established
portable public-API solution. It remains an experiment proposal, not an adopted
authentication shortcut.

The single v2 document acceptance then completed **2/3** joint workflows with
exactly two authenticated actions per successful case and no recovery. Both
attempted Home actions reached the resolved launcher. The remaining case was
refused before typing at `predispatch_changed` (`editor_bounds`, `other_bounds`,
`tree_shape`); all six files stayed unchanged. This still fails the registered
workflow gate. Evidence: `document-home-v2-1789272272870-bc787daf045a4de3932f10f892124cf8`.

Final production-APK smoke passed 44 assertions in `native-1789272472708`.
Combined broker/CLI/MCP/portal integration passed all eight stages and 30/30
independent reads in `integration-1789272500997`. Tree p50/p95: 235/304 ms;
PNG: 303/736 ms; actual native Stop: 170 ms; native PSS: 21,876 to 35,451 KiB.
The projected fixture PNG was inspected and all private cleanup checks passed.
Both records include full SDK 36.1 and exact platform fingerprint. This bounded
passing run does not erase the document, transition or older-image failures.

A separate full functional trial then passed all 45 assertions after a test-only
readiness change. The existing eight-read bound now admits the known
`screenshot_geometry_changed` no-input refusal and records every refused attempt
and terminal recovery count. The run observed 19 readiness sequences and 20
attempts: one geometry refusal (`encoding`, 12 ms) recovered on a fresh read;
the other 18 sequences succeeded immediately. No mutation was retried. Evidence:
`native-full-readiness-1789272864784`. Production APK bytes stayed unchanged
(`61904eef09de40d2f14aad85a1f085563b63e0fa0faa4db69e5dbcb090ab6b48`),
and the strict 30-read gate was unchanged. This is explicit functional-readiness
coverage, not a correction or deletion of the original 40-assertion failure.

Historical results below describe their original builds and platforms. They are
not overwritten by the QPR2 results or by newer test counts.

## Ownership and delivery sequence

| Work package | Owner role | Deliverable and dependency |
| --- | --- | --- |
| PC-01 | Lead | Architecture, licensing boundaries, threat model, acceptance gates |
| PC-02 | Native Android engineer | Separate companion; consent, local scope, observation and gestures |
| PC-03 | Broker engineer | Independent service, scoped identities, sessions, CLI/MCP, safe receipts |
| PC-04 | Portal engineer | Authenticated integration, scopes, supervision, stop and evidence |
| PC-05 | Lead + adversarial reviewers | Cross-component conformance, exploit review, native and browser QA |
| PC-06 | Release owner | Physical acceptance, signing/upgrade proof, complete immutable assets |

PC-02 and PC-03 agree a versioned wire contract before integration. PC-04 consumes
the broker through HTTP rather than importing its implementation. PC-05 must test
the real combined flow, not just mocks that reproduce each implementation.
PC-06 depends on all security and functional gates. Findings reopen the owning
work package; a deadline never converts a failed gate into success.

## Required acceptance

| Area | Gate | Current evidence |
| --- | --- | --- |
| Standalone use | Install, pair, grant, observe, pilot, revoke without portal | Real CLI/native fixture flow passed on API 36; generic input acceptance below |
| Portal integration | Same operations through authenticated UI; no secret leakage or demo dispatch | 13 focused server checks, 18 desktop/mobile journeys and real native projection passed; prior gateway WebView acceptance retained |
| Two agent runtimes | Same tasks through two independently authenticated tool clients | CLI/MCP task equivalence and two live delegates with separate credentials passed on the ATD fixture; comparison across runtime products remains open |
| Input | Tap, long press, swipe, pinch, editable text and navigation on real allowed apps | Full 45-assertion final-APK functional workflow passed with one explicitly recorded read-only geometry recovery; first trial failed after 40 and remains retained; Home lifecycle 37 and semantic scrolling 14 passed; real-editor v2 remains 2/3 |
| Scoped autonomy | Enforce useful task/Activity limits; reject unsupported semantic promises | Generic actions require per-action consent; unattended semantic workflows pending |
| Consent integrity | Real biometric/cryptographic binding; spoofed, stale and cancelled consent fails | Emulated CryptoObject authentication, denial, content changes and enrollment/key rotation tested; hardware acceptance pending |
| Containment | Deny cross-app, wrong identity, overlays, lockscreen, permission changes and stale windows | Scope, self-exclusion, protected windows, expired and stale requests passed; broader device matrix pending |
| Host isolation | Source agent cannot access raw ADB, broker owner token or phone credential | Deployment-specific isolation proof pending |
| Privacy | Exclude protected screen content before export; no screenshot/text/token audit leakage | Real secure/password refusal and opt-in pixels passed; child-process secret canaries passed |
| Reliability | Serialized actions, replay safety, restart/expiry/revoke/stop, ambiguous outcome remains unknown | Broker failure tests, native replay/stop and QPR2 30-read gate passed; earlier SDK 36 capture, unexplained semantic trial and final full-suite capture geometry refusal remain open |
| Performance | Record p50/p95 observation/action overhead, memory, CPU, battery/thermal effect, stop latency | Regular API 34 and QPR2 passed 30 reads; QPR2 Stop 313 ms; older API 36 failures and CPU/battery/thermal evidence remain open |
| Accessibility | TalkBack, large text, keyboard/rotation, reachable stop and clear consent | Native consent portrait/landscape/font 1.3, browser inspection and 13 large-text WebView routes passed; TalkBack acceptance pending |
| Parity | Pre-registered paired task success/intervention/latency comparison with Astra PC baseline | Engineering manifest/scorer implemented; actual parity comparison not established |
| Licensing | Licence, attribution, source, dependency notices packaged and visible | Canonical checks, APK legal-byte comparison and npm archive inventory passed; final source/packaging gate below |
| Release | New signed gateway APK + companion APK + matching desktop assets; exact commit; upgrade preservation | Not released |

Before measuring performance/parity, freeze the task set and thresholds. Initial
engineering targets: no unauthorized side effect or secret-canary leak, no false
verified outcome, no duplicate injected action after uncertain acknowledgement,
bounded local stop of subsequent dispatch within one second, and a maximum of
one active injected operation per device. Measure consent time separately. Set
task success and latency thresholds after a recorded baseline, before candidate
comparison; do not select them after seeing candidate results.

## Local validation record

Only Android emulators were used. The Android Studio JDK, SDK, Gradle tooling,
regular API 34/36 images and the API 34 ATD were available. Physical-device acceptance
requires a designated phone and non-sensitive test apps. No real-device result
has been established by the emulator's presence.

The user explicitly directed continued emulator testing on 12 September 2026;
their physical phone may become available later. All current acceptance work
therefore uses dedicated `orchestrator-phone-control-*` AVDs and synthetic apps.
This is sufficient to continue implementation and emulator QA;
stock-device and hardware-authentication claims remain unverified.

Runtime validation includes:

- Standalone broker functional, schema, authorization, replay and failure tests.
- Existing portal typecheck, unit tests, production build and browser suite.
- Native companion build, lint, unit tests, on-emulator integration and UI inspection.
- Existing gateway Android regression checks and release identity validation.
- Independent adversarial review verified against source or reproducing tests.

Lead and independent adversarial review found the following issues in the first
implementation. Corrections are present and exercised by the owning test suites:

| Finding | Required correction |
| --- | --- |
| Expiry/revocation after native dispatch could return a no-effect rejection | Preserve an unknown or explicitly observed dispatch result; never infer no effect |
| Read replay cache could retain gigabytes of screenshots | Bound aggregate private memory and shorten read receipt retention |
| Native tree IDs and field limits differed from broker/UI validators | Share the actual wire limits and exercise native-shaped responses end to end |
| Node bounds can extend beyond the captured window | Clip reported visible geometry consistently without weakening freshness checks |
| Consent could complete after a broker timeout | Carry a bounded dispatch deadline through to the native check before injection |
| Initial legal endpoint contained an incorrect repository URL | Use the real project origin and verify packaged attribution |
| Existing CLI adapters inherited the gateway's new broker owner token | Filter gateway authority from child environments; exercise a real child with secret canaries |
| Native build initially relied on the portal client's wrapper path | Include the independently usable wrapper with its original third-party licence |
| Persistence failure could prevent an emergency native stop | Abort and contact the phone independently of persistence; report unknown and fail closed afterward |
| An acknowledged stop could still have an in-flight gesture | Preserve unknown when the phone says an already injected gesture may finish |
| System bars overlapped the edge-to-edge application window | Crop OS-reported bars/cutouts from capture and input geometry; reject other overlays |
| Test forwarding could replace another local ADB forward | Use `--no-rebind`, track ownership and remove only a test-owned forward |
| Touches at system gesture edges could become Android navigation | Bind the separate OS-reported safe touch rectangle; validate every path point and pinch endpoint |
| Final action validation received the transport deadline field as an unknown action argument | Revalidate the stripped action parameters while retaining the original deadline in consent and dispatch checks |
| Checkbox state could change during consent without changing the old partial tree digest | Fingerprint exposed checked, selected, state, hint, range and collection metadata; exercise an actual delayed checkbox change |
| PNG compression blocked the thread that handles local stop | Move encoding to one bounded worker; retain at most one outstanding capture after timeout |
| PNG size was checked only after an unbounded output allocation | Cap writes during compression, cap raw-window pixel count and release the capture slot even after a fatal encoder error |
| Instrumentation's decoded stream omitted the framework result marker | Request raw `am instrument -r` output and require the exact success summary and framework terminal code |
| MCP acceptance treated any error as authorization enforcement | Require the exact scope-denial and revoked-credential codes; transport and malformed-input failures cannot pass those checks |
| A valid PNG from an ATD image could contain only black pixels | Inspect the actual frame and require visible color variation in the known fixture; use a regular system image for screenshot acceptance |

Completed early checks: `npm run release:check` passed for the unchanged
`0.1.0-alpha.6` release identity. `npm run phone:license:check` passed after the
component package licence metadata was added. The focused
`npx vitest run src/runtime-environment.test.ts` run in `apps/server` passed two
checks, including an actual child process that did not inherit synthetic broker,
device or vault credentials. These checks do not establish runtime readiness.

### Completed combined validation

- Standalone broker: 49 Node tests passed with no skips, including actual Windows
  ACL setup/validation, scoped HTTP/CLI/MCP, mutation ambiguity, crash recovery,
  disk-failure stop, bounded screenshots and MCP backpressure. Six runtime modules
  passed syntax checks. Two host-runner fault tests passed, including a stalled
  close that did not prevent cleanup or expose a synthetic secret.
- `npm run test:package` in `components/phone-control`: an actual archive was
  extracted to an isolated directory outside the repository. All 11 files matched
  their source bytes; the extracted CLI legal/version commands and MCP lifecycle
  ran without portal files or npm dependencies. Archive SHA-256:
  `a2793634a87c88f19420fe171f5025107e18d74b96d5aae4df9ee512228ac20c`.
  Safe evidence and an accurate dependency inventory are in
  `test-results/phone-control/package-qa/`. This inventory is not labelled a
  complete deployment SBOM; separately installed Node, Android and build tooling
  remain outside this archive.
- `npm run check`: type checks passed; 202 server tests, 16 web unit tests and
  14 contract tests passed (232 total).
- `npm run build`: all four workspace builds passed. Vite retains a large-chunk
  advisory; this is not a measured phone-runtime performance result.
- `npm run test:e2e`: 135 passed and three explicitly platform-specific journeys
  skipped, 1.9 minutes. This includes all 12 phone-control browser journeys.
- Native companion: 29 JVM tests, app and fixture strict lint, companion/fixture/
  instrumentation APK builds, packaged legal-byte verification and 43 real
  instrumentation assertions passed on the API 36 emulator. Latest native smoke
  evidence: `test-results/phone-control/native-1789234297658/`. The test runner
  waits for an initial post-install window transition to settle; steady-state
  observation measurements and production freshness checks are not relaxed.
- Root `npm run phone:android:build` passed, including byte-for-byte packaged
  licences and the generated commit/dirty identity. `npm run android:build`
  passed for the existing gateway client (build, JVM tests and lint). These are
  debug QA artifacts from an uncommitted feature branch, not signed releases.
- `npm run phone:test:integration`: six stages passed against the actual API 36
  companion, through the separately launched broker. The CLI observed and
  incremented the signed fixture, replay changed state exactly once, a separately
  authenticated MCP observer could read but not mutate, the authenticated portal
  projected real native pixels and rejected raw shell, credential revocation
  worked, and the actual phone acknowledged stop. The runner removed its private
  session credential and temporary broker files.
- Combined evidence: `test-results/phone-control/integration-1789227941229/`.
  The actual projected `fixture.png` was inspected: controls, counter and legal
  credit were readable. A clipped fixture heading was returned to the native
  owner for an inset-layout correction. The two CLI-inclusive observation times
  were 953 ms and 904 ms; two samples are not a p95, sustained-load or battery
  benchmark.
- Desktop/mobile phone-control screenshots were inspected. Unknown outcomes
  keep stop available and block further input; credential reveal is masked and
  held only in memory. Browser fixtures are synthetic and do not substitute for
  the real device test above.
- Following the touch-boundary changes, the focused browser suite passed all 16
  phone-control journeys, and the 11 server projection checks passed. The earlier
  full 135-journey result predates those four added browser cases.
- The gateway's actual Android WebView suite passed 16 journeys, including the
  disabled synthetic phone-control preview, plus 13 route checks at enlarged
  text. Evidence: `test-results/android/emulator-5570-1789232318505/results.json`.
  The phone-control preview, narrow settings and linked-work screenshots were
  inspected. Display overrides and font scale were restored, and temporary
  gateway processes and forwarding were removed.
- Latest native consent-layout acceptance passed 21 assertions at font scale
  1.3. The dedicated in-flight stop workflow passed 13 assertions: an actual
  authenticated long press had delivered DOWN before Stop, Stop acknowledged
  within its one-second target, the receipt remained unknown, credentials were
  revoked, the original gesture finished within its bound, and no new touch
  began. Evidence: `test-results/phone-control/native-acceptance-1789233161849/`.
  These are emulated-sensor results, not hardware biometric evidence.
- Six strict native-result parser tests and two independent cleanup fault tests
  passed. The parser requires both the exact assertion summary and Android's
  successful framework terminal code; arbitrary output and secret canaries are
  not forwarded into public failure records.
- Two MCP acceptance regression tests passed: both structured and text-encoded
  authorization errors are checked by exact code. A native transport failure,
  malformed response or unrelated validation error cannot stand in for a scope
  or revocation proof.
- The host biometric harness passed nine adversarial tests. Final root harness
  syntax checks, ten root parser/denial/cleanup tests, licence/release identity,
  local documentation links and diff checks passed. The release identity remains
  `0.1.0-alpha.6`; no publication or stage promotion occurred.

### Final acceptance work and failures retained

The expanded integration harness runs equivalent fixture tasks through CLI and
MCP operators, then 20 independent tree-only reads and 10 explicit PNG reads.
It records every read attempt, fixed failure codes, safe capture stage/timing,
successful latency percentiles and native process PSS. It does not retry a
mutation or silently replace a failed measurement. Any failed read fails that
run's reliability gate. These small samples are emulator engineering baselines,
not a population latency, battery, thermal or Astra parity result.

`integration-1789231106525` retained one five-second capture timeout followed by
19 successful independent tree-only observations. Native process PSS increased
from 36,855 to 44,115 KiB during that sample. This failed run motivated bounded
capture cleanup, off-main-thread encoding and avoiding PNG allocation when only
the OS secure-window probe is required. Explicit screenshots still use the
same consent/scope checks and the bounded encoder.

The dedicated API 36 emulator later exited during the gateway WebView suite
after three completed journeys. It was restarted with the supported SwiftShader
renderer instead of ANGLE/SwiftShader, preserving its synthetic app data and
fingerprint enrollment. The interruption is not counted as a pass, and changing
renderer alone does not establish its cause. A subsequent run also exposed
test-harness attachment/keyboard handling issues; their corrections and final
device results are recorded above. The harness now bounds WebView attachment,
hides the keyboard after verified address entry, uses DOM-hit-tested native
navigation coordinates after density changes, and restores the original display
overrides rather than the emulator's physical defaults.

`integration-1789233497933` subsequently passed both CLI and MCP fixture action
proofs, but failed 10 of 30 independent observation attempts. Every failure
reported `screenshot_timeout` at `awaiting_callback`, about 5,000 ms, including
tree-only observations that do not encode PNG. Successful tree-only observations
ranged from 201 to 395 ms and successful PNG observations from 299 to 615 ms;
these success-only timings must not conceal the failures. Native PSS changed
from 23,644 to 45,010 KiB. Cleanup passed. The cold-boot investigation below
retained the failures; neither host load nor the renderer was established as
their cause.

A fresh, unlocked API 36 boot also failed the expanded biometric workflow on a
capture timeout. A bounded local diagnostic sample contained one exact framework
message, `ScreenCaptureListenerWrapper consumer not alive`; raw device logs were
not exported. AOSP's native listener uses a weak consumer reference and drops
completion when it has been collected. This supports a framework callback-lifetime
failure as a candidate on this image, but the sample has no per-request identifier
and does not prove that every failed request has that cause.
[AOSP native listener](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-16.0.0_r1/core/jni/android_window_ScreenCapture.cpp)

The independent review also found that the original five-second application wait
raced Android's own five-second screenshot failure callback. A six-second total
wait now allows the OS failure callback to be reported accurately. This
changes neither the authorization deadline nor the zero-failed-read acceptance
gate, and adds no screenshot or mutation retry.
[AOSP accessibility client](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-16.0.0_r1/core/java/android/view/accessibility/AccessibilityInteractionClient.java)

With that margin, `integration-1789234370232` retained five failed reads: three
of 20 tree-only and two of 10 PNG requests. All five reported the OS
`screenshot_internal_error` after 5,002–5,008 ms. The fixed framework warning
count rose from one to six during that run, supporting the callback-lifetime
diagnosis. Successful tree-only p50/p95 were 273/774 ms and successful PNG
p50/p95 were 391/591 ms; native PSS was 21,852 then 41,178 KiB. This is a failed
reliability run, not a passing latency benchmark. Both CLI and MCP fixture task
proofs passed before sampling. The runner loaded before the later continuation
change, so that run did not reach portal projection/revocation/Stop assertions;
all independent cleanup steps passed. The runner now retains a failed read gate
and exit status while continuing those separate functional cases.

The first live delegate run is retained in
`test-results/phone-control/agent-session-1789234488557-41ffbc67-b809-4ece-83db-f19314ddb072/`.
Agent A reported a rejected initial observation with `screenshot_internal_error`
and attempted no mutation. Agent B made no call before the coordination lease
expired. The owner harness recorded failure and successfully stopped access,
removed credentials/forwarding and terminated its children. This does not prove
paired agent piloting. The explicit debug-only live-agent probe now uses a fixed
360-second monotonic lease and a 240-second delegate window; ordinary integration
retains its 180-second lease. Production session and action limits are unchanged.

### Android 14 ATD and live model-client evidence

The dedicated API 34 AOSP ATD passed 44 native assertions at
`test-results/phone-control/native-1789234883361/`. Its combined integration
passed eight automated stages and all 30 read receipts at
`test-results/phone-control/integration-1789234925132/`, including the exact MCP
denial/revocation codes, native Stop (179 ms) and private cleanup. However, visual
inspection found that the projected 720 × 1464 fixture PNG was entirely black.
The separate `visual-qa.json` records failure. The installed image explicitly
sets `debug.hwui.drawing_enabled=0`; Android documents that ATDs disable hardware
rendering and cannot support the corresponding screenshot tests. These results
establish semantic/transport behavior only. They do not accept visual capture.
[Android ATD limitations](https://developer.android.com/studio/test/managed-devices#use_atds)

Two live Codex delegates then completed independent scoped CLI tasks on this ATD:
agent A observed counter 3, incremented once and observed 4; agent B observed 4,
incremented once and observed 5. The owner independently verified the final +2
and each credential's audit (two successful observations and one completed
mutation). Stop, private-file deletion, forwarding and child cleanup all passed.
Evidence:
`test-results/phone-control/agent-session-1789234999518-dc34fa4a-d299-453a-82a4-18d2ad0276c1/`.
The agents used tree observations and only their assigned credentials. This is
actual model-client piloting of a synthetic fixture, not a visual, cross-product
runtime, hardware-biometric or host-isolation proof.

The regular API 34 Google APIs image, revision 14, passed all eight integration
stages and all 30 independent reads in
`test-results/phone-control/integration-1789235524736/`. Both the native engineer
and lead inspected the actual projected fixture PNG: title, counter, checkbox,
controls, gesture pad and complete project/licence credit were readable. Its
separate `visual-qa.json` passed. Tree-only p50/p95 were 376/926 ms; PNG p50/p95
were 1,405/2,779 ms; native PSS increased from 18,969 to 50,358 KiB. Native Stop
acknowledged in 282 ms and cleanup passed. This small software-rendered sample
is an engineering baseline, not physical-device performance or Astra parity.

The first regular-image native smoke retained a stale-observation rejection
after 21 assertions (`native-1789235476637`). The new fixture pixel guard had
passed before that action refusal. A PNG signature alone is no longer sufficient
for native fixture screenshot acceptance.

After enrolling a synthetic PIN and fingerprint 1 on the regular API 34 emulator,
the complete expanded biometric workflow passed all 45 assertions, including
real touch/multitouch/text/navigation postconditions, the exact review envelope,
content and checkbox-state changes during consent, denial, deadlines and Stop.
The separate actual in-flight Stop test also passed 13 assertions. Evidence:
`test-results/phone-control/native-api34-acceptance-1789235772165/`.
The first large-text layout run failed after 12 assertions. Investigation found
that the test helper unnecessarily required an offscreen gesture-pad node for a
text-entry test; visible-node export correctly omitted it in landscape. Target
lookups are now specific to each method. The corrected layout workflow passed
21 assertions at font scale 1.3 in portrait and landscape, then restored 1.0.
The failed runs are retained. No production UI or authorization change was needed.

The final native smoke passed 44 assertions with an enrolled biometric at
`test-results/phone-control/native-1789236182512/`. It obtains a fresh observation
after the test's PNG decoding/inspection before the positive fixture action;
no action is retried. Both initial failures remain evidence, and the production
freshness rules are unchanged. All three owned AVDs were stopped after QA,
preserving their synthetic data and enrollment. The pre-existing portal emulator
was not stopped or modified by these companion tests.

The root runners are `npm run phone:test:native` and
`npm run phone:test:integration`, after `npm run phone:android:build` and
`npm run build`. They require `PHONE_QA_SERIAL` (default `emulator-5570`), a running
emulator whose AVD name begins `orchestrator-phone-control-`, and Android SDK
`adb` on PATH. Physical devices and unrelated AVDs are refused. The native runner
installs only the three test APKs and replaces synthetic grants; it never clears
the gateway application's data. Run the two runners sequentially. CI defines
the same flow for APIs 34, 36 and full SDK 36.1; a workflow definition is not a
completed CI run.

`npm run phone:test:agents` is an optional live model-client acceptance harness,
not an unattended CI test. It prints two narrow credential-file paths, a session
ID and a completion-marker path for a short synthetic session. Assign one client
at a time to observe the fixture, increment exactly once with a stable request
ID and inspect the postcondition. Each client must use only its assigned scoped
credential, never ADB or the owner/device token. Signal completion only after
both finish. The harness checks the counter and each credential's broker audit,
then stops access and removes private files. This verifies that model clients
can operate the exposed interface; it does not establish host isolation or a
comparison against Astra on a PC.

## Release and upgrade requirements

The current debug companion APK and standalone broker archive have recorded
SHA-256 checksums in `test-results/phone-control/delivery-manifest.json`.
The companion's packaged legal files were compared byte for byte again. The
manifest explicitly records an uncommitted alpha worktree and open gates;
these are QA artifacts, not an immutable signed production release.

The application remains `0.1.0-alpha.N` until explicit stage approval. The existing
gateway APK must retain `io.github.quintond.orchestrator`, its signing identity,
data and settings. The companion has a distinct application ID and independent
version code; installing it must not replace or weaken the gateway client.

For a release to main, follow [the release contract](releases.md): build a fresh
gateway APK from the released commit even when its native code is unchanged,
plus a separately signed companion APK and matching broker/desktop artifacts.
Verify an in-place gateway upgrade from the previous published release. Establish
the companion's first signed baseline, then prove an in-place next-version upgrade
preserves local allowlists and settings while invalidating active authority and
requiring fresh consent. Never substitute uninstall, data clearing or a clean
installation for this check.

Critical/high security findings, required licence checks and asset/upgrade
mismatches block distribution. Physical-device evidence remains required for
production acceptance. The owner-authorized emulator alpha does not claim that
acceptance or a release-stage promotion.
Google Play submission is outside the current authorized private distribution path.
