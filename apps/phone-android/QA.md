# Native Android verification — 2026-09-12

The companion remains alpha. This dated record retains the original API 34/36
results. The 13 September follow-up passed capture, native smoke and the full
biometric workflow on Android 16 QPR2 (SDK 36.1); it does not replace the older
API 36 failure. See the [current readiness record](../../docs/android-phone-control-readiness.md),
[capture investigation](../../docs/phone-control-capture-investigation.md), and
[real document QA](../../docs/phone-control-document-qa.md) for later builds,
exact platforms and unresolved reliability findings.

The first table and findings record the dedicated
API 36 Google APIs emulator `orchestrator-phone-control-20260912` on
`emulator-5570`; API 34 ATD and regular Google APIs follow-ups appear below.
No physical phone was used and the existing portal emulator was left unchanged.

| Check | Result |
| --- | --- |
| App and fixture debug APK builds | Passed |
| Separate dependency-free instrumentation APK | Built and installed |
| JVM policy, bounded HTTP parser and capture/output coordination tests | 29 passed, including system-gesture boundaries and encoding faults |
| Host biometric harness adversarial checks | 9 passed; no emulator/ADB used |
| App and fixture Android lint with warnings as errors | Passed |
| Packaged legal notices and available release identity | Passed |
| API 36 real loopback native smoke | 43 assertions passed, including secure-window and gesture-boundary guards, before the fixture pixel assertion was added |
| API 36 strong biometric input workflow | Historical 40 assertions passed using simulated fingerprint 1; expanded 45-assertion gate remains failed on capture refusal |
| Long consent text, portrait/landscape, font scale 1.3 | 21 assertions passed; scale restored to 1.0 |
| Add a fingerprint, deny invalidated-key action, recreate only on new review | 8 assertions passed; second fingerprint enrolled |
| Separate Stop during actual gesture mode | 13 assertions passed: actual DOWN precedes Stop, acknowledgement within 1,000 ms, bounded completion, revoked token and unknown action receipt |

Native smoke exercised real window screenshots with explicit sharing opt-in,
editable-value redaction, local/caller app scope, self-exclusion, secure and
password windows, deadlines, coordinate bounds, current-observation binding,
signed fixture execution, persistent idempotency, changed-payload conflicts and
authenticated stop. The replay postcondition checks an exact single increment
modulo 1,000, not merely that the counter changed.

The biometric workflow checked actual counter effects for tap/node click;
touch duration for long press; motion for swipe; two simultaneous pointers for
pinch; the field value after text replacement; foreground changes after home,
back and launch; a scheduled content change while consent was pending; local
denial; deadline expiry; and concurrent stop. Initial read-only readiness waits
are bounded and limited to enumerated transition refusals; screenshot timeouts
are not retried. The strict integration samples retain every independent read
failure. Actions are never automatically retried. The test runner authenticates the actual auth-per-use CryptoObject
with the emulator sensor; it does not set consent results or bypass production
authentication code.

Findings addressed during these checks:

- System bars overlap edge-to-edge application windows. Observation, screenshot
  and input coordinates now consistently exclude OS-reported bars and cutouts;
  other overlapping windows still block access.
- Android restores window geometry and visible node geometry over transition
  frames after consent. Execution waits for the original rectangle and full
  tree fingerprint to return, within the existing deadline. It never translates
  a request onto changed coordinates. Capture and pre-consent epochs remain
  strict; only the known consent handoff tolerates an epoch change when all
  available fingerprinted properties match. The API does not establish that
  the event was lifecycle-only or that custom-drawn pixels remained unchanged.
- The fixture button's default uppercase transformation did not match the
  explicit semantic fixture contract. Its visible label now matches exactly.
- Standard UIAutomator dumps suppress accessibility services. The separate test
  runner preserves them, rebinds after instrumentation restarts the app, and
  exports no pairing credential except its explicit, temporary debug-only host
  probe file. Production has no secret-export endpoint.
- Consent uses a separate task, scrollable human-readable action details and
  fixed controls inside system insets. Complete machine parameters remain bound
  to the cryptographic operation. The pairing and consent surfaces remain
  secure and excluded from the service.
- Biometric enrollment invalidates the old key. The current action is denied;
  only a newly reviewed request creates a fresh authenticated key.
- Absolute request/response deadlines prevent a local slow sender/reader from
  holding a network worker indefinitely. Stop remains concurrent with consent;
  already dispatched gestures can still finish within their bounded duration.
- Native screenshot pacing handles Android's 333 ms capture interval, so an
  immediate observe-to-action MCP call does not require a client-side sleep.
- Touch injection excludes separately bound system and mandatory gesture
  insets while observation pixels remain available. Boundary regressions cover
  right-edge taps, every swipe point, pinch endpoints and float rounding.
- Capture refusal has fixed diagnostic codes for rate limits, secure/invalid
  windows, geometry changes, access, size, timeout and internal failures.
  Repeated observation failures can be investigated without forwarding window
  content or arbitrary exception messages, and without retrying mutations.
- PNG encoding runs off the main thread. Only one OS capture/encoding job may
  remain outstanding, including after timeout; a late callback closes its
  buffer without authorizing an action. Safe stage/timing diagnostics support
  investigation of intermittent emulator capture timeouts.
- PNG output is bounded during writes, before a final copy; raw screenshots
  are limited to 6,000,000 pixels before request and bitmap work. Host-side JVM
  tests inject output overflow and a synthetic fatal encoder error to verify
  rejection, resource cleanup, failed completion and capture-slot recovery.
  Tree-only observations and pre-dispatch secure-window probes avoid PNG work.
- The action-only parameter copy is reused for final dispatch validation while
  the untouched deadline envelope remains bound to consent. The latest full
  biometric suite adds review-envelope and checkbox-only state-change checks;
  its expected count is 45. The final suite did not complete because capture
  was refused after 19 assertions; those later checks are not claimed as passed.

The final build passed all 116 selected Gradle tasks, including debug app/test/
fixture builds, 29 JVM tests, app/fixture lint and packaged legal verification.
The API 36 native smoke evidence is `test-results/phone-control/native-1789234297658`.
Biometric results are in `test-results/phone-control/native-acceptance-1789233161849`:
layout passed 21 and actual in-flight Stop passed 13; the latest full run failed
at capture stage `encoding` after 14 ms. The loaded host helper did not preserve
that refusal's exact code, so it is not inferred. The helper now accepts all nine
fixed capture codes and still discards arbitrary instrumentation content.

A single cold restart preserved the synthetic PIN and fingerprints. Before the
callback margin change, the unlocked fresh emulator again refused a capture at
`awaiting_callback` after 5,002 ms. A bounded in-memory log sample contained one
exact `ScreenCaptureListenerWrapper consumer not alive` message; no raw logs were
saved. This supports the reviewed Android 16 weak-consumer callback defect as a
candidate, without proving which request produced the message. The six-second
native wait now permits Android's own five-second failure callback delivery;
action deadlines, secure-window probing and freshness checks remain unchanged.
This is diagnostic slack, not a retry or a claim that capture reliability is fixed.

The final integration evidence, `test-results/phone-control/integration-1789234370232`,
retains five failed reads out of 30: three of 20 tree-only reads and two of ten
explicit PNG reads. Every failure is Android `screenshot_internal_error` at
`awaiting_callback`, after 5,002–5,008 ms. The fixed-message log count increased
from one to six during this run, matching the five additional failures; individual
requests still lack a platform correlation identifier. Successful tree-only
reads had p50/p95 273/774 ms and successful PNG reads 391/591 ms; these figures
exclude failures, which remain in the evidence. Native PSS rose from 21,852 to
41,178 KiB. The zero-failure reliability gate remains failed. The CLI action/replay,
read-only MCP denial, and independent CLI/MCP exactly-once task checks passed.
This runner stopped at the failed sampling gate, so its later portal/Stop checks
were not run. All owned host processes and forwards were cleaned up, the native
session stopped, and private probe files were absent before device handoff.

The parent integration workflow separately tested the real broker, CLI, MCP
and portal against this companion. See repository-level phone-control QA
records for those results. Android 14 ATD, physical hardware/OEM behavior and
release upgrade verification are distinct checks and are not implied by this
API 36 report. API limitations and trust boundaries are documented in README.

The separate debug instrumentation now accepts `liveAgents=true` only with
`hostProbe=true` and without biometric mode. It selects a fixed 360-second
monotonic private-token lease; the default remains 180 seconds. The ready marker
reports the selected bound. This allows time for external model-client
orchestration without extending production sessions or action deadlines. The
flag's emulator execution is not included in the results above.
`:app:assembleDebugAndroidTest :app:lintDebug` passed for this test-only change
(52 tasks, 7 executed); the production Java compilation remained up to date.

The later API 34 AOSP ATD revision 1 run passed 44 native assertions and eight
integration transport/semantic stages with 30/30 reads, but **failed visual QA**.
Its saved `integration-1789234925132/fixture.png` is 720 by 1,464 pixels with one
RGBA value, `(0,0,0,0)`. The installed image's `build.prop` explicitly sets
`debug.hwui.drawing_enabled=0`. Official [ATD documentation](https://developer.android.com/studio/test/managed-devices#use_atds)
warns that hardware rendering is disabled; the [HardwareRenderer API](https://developer.android.com/reference/android/graphics/HardwareRenderer#setDrawingEnabled(boolean))
explains that View lifecycle still runs while final GPU output is skipped.
This known image configuration supports the black-output diagnosis; no native
encoder defect was demonstrated by this off-device inspection. The regular API 34
Google APIs follow-up below separately validates rendered pixels.

Native smoke now performs a fixture-specific decoded-pixel assertion after
explicit screenshot capture: bounded dimensions, decode dimensions reduced by four,
at most 4,096 sampled pixels, visible opacity and color variation, and bitmap
recycling. This catches transparent, black or other solid fixture output without
changing production behavior for legitimate solid app screens. It adds one
native assertion (44 expected with enrolled biometrics, 45 without); biometric
probe counts and production code are unchanged. Manual visual inspection of
the fixture's title, controls, counter and attribution is still required.
The updated instrumentation APK and app lint passed in 20 seconds (52 tasks,
7 executed), with production Java compilation unchanged and no device operations.

## Regular API 34 Google APIs follow-up

Image revision 14 ran on the dedicated
`orchestrator-phone-control-api34-google-20260912` AVD, `emulator-5574`, at
720 by 1,600 pixels and density 280. Runtime identity, QEMU status and API level
were checked before setup. Only this synthetic emulator received PIN `1234` and
simulated fingerprint 1. The actual strong-biometric CryptoObject path was used.

| Check | Result |
| --- | --- |
| Native smoke, including decoded fixture pixels | 44 assertions passed with fingerprint enrolled |
| Full biometric workflow | 45 assertions passed, including checkbox-only changes during consent |
| Review in portrait/landscape at font scale 1.3 | 21 assertions passed; font scale restored to 1.0 |
| Stop after an actual gesture DOWN | 13 assertions passed |
| Broker/CLI/MCP/portal integration | Eight stages passed, including actual native Stop in 282 ms |
| Independent repeated observations | 20/20 tree-only and 10/10 explicit PNG reads passed, no capture retries |
| Actual projected fixture image | Title, counter, controls, gesture pad and complete attribution visibly readable |

Native smoke evidence is `test-results/phone-control/native-1789236182512`;
biometric outputs are in `test-results/phone-control/native-api34-acceptance-1789235772165`.
Integration evidence and the inspected `fixture.png` are in
`test-results/phone-control/integration-1789235524736`. Tree-only p50/p95 was
376/926 ms; PNG p50/p95 was 1,405/2,779 ms. Native PSS rose from 18,969 to
50,358 KiB across the measured reads. These are emulator transport/native
measurements, with no model reasoning time included.

Failures remain in the evidence. The first native run,
`native-1789235476637`, refused a stale observation after 21 assertions. Smoke
now takes one fresh observation after its separate bitmap decode/sampling work,
then binds the single positive fixture action and exact counter postcondition
to that view. This does not retry a mutation or relax production freshness.
The first layout run and its diagnostic run stopped after the portrait checks:
the test helper unnecessarily looked up the offscreen gesture pad while building
a text-review action. Method-specific node lookup fixes that harness dependency;
the existing production consent layout passed unchanged. Diagnostic output keeps
only fixed reasons and bounded numeric layout geometry.

After these test-only fixes, instrumentation build and lint passed (52 tasks,
7 executed), as did all nine host harness tests and the native subtree diff
check. Handoff left `emulator-5574` running and unlocked, font scale 1.0, with the
companion stopped, no owned forwards and no private probe files. The original
failed API 36 capture-reliability gate and ATD visual failure remain separate;
this API 34 success does not establish hardware biometric assurance, OEM-wide
compatibility or a production upgrade result.
