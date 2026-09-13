# Android per-window capture investigation

Status: emulator investigation, 13 September 2026. Android 16 QPR2 (SDK 36.1)
Google APIs revision 4 passed the strict 30-read capture gate and actual pixel inspection.
The original Android 16 revision 7 failures remain valid evidence. The application
still requires Android 14 or later and uses the public per-window screenshot API.
No physical phone has been tested in this investigation.

## Release qualification and legacy compatibility

The required `Phone Control` release workflow now selects Google APIs images for
API 34, API 35 and patched Android 16 QPR2 / SDK 36.1. Each must pass its strict
native and integration checks. This defines the release gate; it does not claim
that every current run has passed or that every device on those SDK levels is
reliable. The [readiness record](android-phone-control-readiness.md) records the
actual results. Installation still permits API 34 and later. There is no SDK-level
blacklist, and OEM backports of the framework correction have not been verified.

The earlier Android 16 Google APIs revision 7 image is not release qualified.
Its exact recorded identity is
`google/sdk_gphone64_x86_64/emu64xa:16/BE2A.250530.026.F3/13894323:userdebug/dev-keys`.
In [PR 26's original Phone Control run](https://github.com/QuintonD/orchestrator-portal/actions/runs/34748059571),
native smoke passed 44 assertions. The subsequent integration run retained five
failed requests out of 30: three of 20 tree-only reads and two of ten PNG reads.
All five reported `screenshot_internal_error`, `captureStage=awaiting_callback`
and capture elapsed times of 5,001–5,018 ms. Cleanup passed. The downloaded record
is retained under `test-results/phone-control/ci-34748059571-api36/`; this failure
has not been converted into a passing result.

The [second Phone Control run](https://github.com/QuintonD/orchestrator-portal/actions/runs/34748596330)
also failed on the older API 36 image. Native smoke again passed 44 assertions,
and the CLI/MCP fixture-task equivalence check passed, but 12 of 30 independent
observation requests failed. The retained safe log is
`test-results/phone-control/ci-34748596330-api36-job.log`; the uploaded evidence
directories are `native-1789289929612` and `integration-1789289972772`.
Both runs also reported an `AssertionError` in the portal authentication and
native projection stage. That error alone does not establish the same cause as
the capture failures. These are two failed runs, not retries combined into a
passing result.

The [manual legacy compatibility workflow](../.github/workflows/phone-control-legacy-compatibility.yml)
continues to run the native and integration suites against the `android-36`
Google APIs package. It has no expected-failure exception: either suite failing
fails the job, and a failed read is never retried into a passing benchmark sample.
The owner [CI emulator runner](android-emulator-ci.md) verifies the pinned emulator
binary, creates a fresh disposable AVD, checks service readiness and retains
bounded diagnostics alongside the test results. `sdkmanager` can update the image
package in the future, so the recorded image fingerprint identifies each actual
run; the package name alone does not reproduce the historical build.

The release manifest requires the successful, same-commit `Phone Control`
workflow. A result from `Phone Control legacy compatibility` cannot replace it.
Release descriptions must disclose that the older recorded image is not qualified.
The native implementation continues to fail closed on all platforms: a failed
capture clears the current observation, returns neither tree nor pixels, and
grants no authority to act from that observation. Authenticated Stop remains
available. No framework workaround, platform-wide blacklist, capture retry or
weakened assertion is introduced by this separation.

## Confirmed upstream defect and supported remedy

The upstream change is
[AOSP commit 7549d7629fb0939b1cdac7a3695dcaf5e832d8aa](https://android.googlesource.com/platform/frameworks/base/+/7549d7629fb0939b1cdac7a3695dcaf5e832d8aa),
dated 11 September 2025, titled “Refactor ScreenCaptureListenerWrapper to guarantee
callback delivery.” It references Android bug `441019220` and change ID
`I8e907384b915c30a7b9c1927b1cd517da26561e3`. The commit describes a race in which
garbage collection could remove the Java consumer before the native callback,
silently discarding the screenshot. It replaces the weak JNI reference with a
strong global reference that is released after the one-shot callback. This is a
platform lifetime correction; it is not an application timeout or PNG change.

The public Gitiles history/blame endpoints did not return usable history during
this investigation. Comparing pinned source and commit objects through the
first-parent histories located the introducing change, rather than inferring it
from an image version. Its native source blob is
`5458b18c9e295ad2d853cd9b25af5cd894d8d33c`, identical to the file in the inspected
[Android 16 QPR2 release snapshot](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/jni/android_window_ScreenCapture.cpp).
The fix was merged as `1cccb2225e37f24d0a75b9e54b76a826bd24182b` and entered the
QPR2 release history in snapshot `9caf145fc1ff24635cec2e26fb2b1765bba42c17`.

In the inspected
[original Android 16 accessibility client](https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/core/java/android/view/accessibility/AccessibilityInteractionClient.java),
`takeScreenshotOfWindow` creates an internal consumer and separately retains the
application executor/callback. It schedules an internal-error callback after
`TIMEOUT_INTERACTION_MILLIS`, which is 5,000 ms. Retaining our public callback or
changing its executor would not retain that separate internal consumer. The
original framework's native listener uses a weak JNI reference and emits the
fixed missing-consumer warning before dropping delivery.
[Original native implementation](https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/core/jni/android_window_ScreenCapture.cpp)

The recorded Android 16 failures at 5,002–5,008 ms and matching increase in the
exact warning count are consistent with this now-identified defect. The prior
logs contain no per-request correlation identifier, so they do not establish
that every failed request had this cause. The later image's success strengthens
that explanation without changing those evidentiary limits.

The [official system-image repository](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-3.xml)
queried on 13 September 2026 lists:

| SDK package | Revision | Archive size | Repository SHA-1 |
| --- | --- | --- | --- |
| `system-images;android-36;google_apis;x86_64` | 7 | 1,895,447,397 bytes | `c6bf44bdcd885bb902b4ba752d111a073ad7a817` |
| `system-images;android-36.1;google_apis;x86_64` | 4 | 1,960,532,087 bytes | `15261872d5f0ae4b5728faefd0380d51b61a5b23` |

Android's documentation identifies the QPR2 SDK as API 36.1 and describes creating
a QPR2 emulator. Updating the test platform is a supported path; merely checking
for updates to the `android-36` package would retain revision 7. Compilation
against API 36 continues to work on this image.
[QPR2 SDK](https://developer.android.com/about/versions/16/qpr2/setup-sdk),
[QPR2 emulator setup](https://developer.android.com/about/versions/16/qpr2/get)

## Application hardening

Adversarial review found a separate callback-ownership weakness in
`CaptureCoordinator`: a duplicate success could queue another encoder, and a
late failure could free its slot while the first encoder still owned a buffer.
The coordinator now permits one transition from awaiting callback to encoding.
A duplicate success closes its own returned buffer. Platform failure callbacks
cannot settle a ticket that an encoder already owns. The encoder or rejected
submission still owns final cleanup; finished tickets cannot be revived or
release a newer ticket's slot.

Three focused JVM regressions exercise duplicate success, failure after encoding
and Stop, and failure followed by success after a replacement request begins.
Existing timeout, output overflow, exception and fatal encoder cleanup tests
remain. This bounds resources against callback anomalies; it does not repair the
old Android framework consumer or explain the platform benchmark improvement.

The six-second application wait remains bounded delivery slack around Android's
five-second failure callback. There are no automatic screenshot or mutation
retries. A timed-out OS request retains its slot until callback cleanup. Failed
capture withholds the tree and pixels and authorizes no action. The secure-window
probe, freshness checks and action deadline remain in force. Full-display
capture, hidden APIs, reflective access to framework internals and garbage
collection manipulation were not introduced.

## Isolated emulator and benchmark

The investigation created `orchestrator-phone-control-api361-google-20260913`,
serial `emulator-5576`, without altering the existing API 34/API 36 AVDs or
original `emulator-5562`. Available disk was 26,442,756,096 bytes before installing
the additional SDK image. Configuration: Pixel 7 definition, 720 by 1,600 pixels,
density 280, two CPU cores, 2 GiB RAM, 3 GiB data partition, SwiftShader, Vulkan
disabled, cold boot with no snapshot load/save. Runtime QEMU status, dedicated
AVD name and build identity were checked before setup.

Runtime identity:
`google/sdk_gphone64_x86_64/emu64xa:16/BE4B.251210.005/14574095:userdebug/dev-keys`.
`ro.build.version.sdk` is `36`; `ro.build.version.sdk_full` is `36.1`. The runners
used for the historical results below recorded only the major SDK, so those
result JSON files alone do not distinguish these two image families. The current
shared `readEmulatorEvidence` collector includes full SDK and build identity in
future runs; this does not retroactively add fields to earlier evidence.
Only the disposable emulator received the synthetic
PIN and fingerprint enrollment; native authentication uses the real
auth-per-use CryptoObject path and simulated sensor input.

| Check | Result and evidence |
| --- | --- |
| Native smoke with enrolled biometric and decoded fixture pixels | 44 assertions passed; `test-results/phone-control/native-1789268513639` |
| Full biometric workflow | 45 assertions passed; `test-results/phone-control/native-api361-acceptance-1789268820000/full.txt` |
| Strict broker/CLI/MCP/portal integration | All eight stages passed; `test-results/phone-control/integration-1789268565771` |
| Independent observation reads | 20/20 tree-only and 10/10 explicit PNG reads; no capture retries |
| Tree-only latency | p50 295 ms; p95 780 ms |
| PNG latency | p50 459 ms; p95 865 ms |
| Native memory across measured reads | PSS 21,838 to 35,390 KiB |
| Actual native Stop | 313 ms |
| Projected fixture image | `fixture.png` inspected: title, counter, checkbox, input, gesture pad and full attribution readable |
| Bounded framework warning check | Zero exact missing-consumer warnings in the last 4,000 logcat lines after the run; raw logs were never saved |

Timings include HTTP/broker/native work and exclude model reasoning. Thirty
successful reads are a passing bounded gate, not a general failure-rate estimate
or OEM guarantee. The previous Android 16 result remains five failed reads of 30;
its successful-read latency excludes those failures. These runs used different
system images and host load and are not a controlled latency comparison.

The integration verified cleanup of its native session, temporary device token,
host private configuration, owned processes and ADB forward. No release APK,
physical biometric assurance, thermal/battery measurement or in-place production
upgrade result is implied.

## Validation and follow-up

The first native build ran `:app:testDebugUnitTest :app:assembleDebug
:app:assembleDebugAndroidTest :fixture:assembleDebug :app:lintDebug`: 104 tasks,
16 executed, successful in 37 seconds; all 32 JVM tests passed, including 14
capture/output tests. The subsequent semantic fixture/test
build and app/fixture lint passed 95 tasks, 29 executed, in seven seconds.
Both included the capture changes. The native subtree diff check passed.

The newer semantic scroll acceptance run initially stopped after nine assertions
at the first authenticated forward-scroll result. Its safe transcript is
`test-results/phone-control/native-api361-acceptance-1789268820000/semantic.txt`.
The assertion did not include a fixed native error code, so this record does not
infer its cause. After adding only a fixed error diagnostic to that assertion,
the separate diagnostic run passed all 14 assertions, including authenticated
forward/backward scrolling and independent top-row visibility checks:
`semantic-diagnostic.txt` in the same directory. The test APK rebuild passed
43 Gradle tasks in one second. The initial failure was not reproduced and remains
unexplained; the later pass does not establish its correction. No action was
automatically retried and production freshness checks were not relaxed.

`semantic-fixture.png` was inspected after the successful backward scroll: the
checked “Reviewed draft” control and paragraphs 0–9 were readable at the top.
The helper stopped the companion after both the full and semantic runs. The
unlocked emulator and exclusive lease were then handed to the parent QA task;
subsequent tests are recorded in the consolidated readiness record.
