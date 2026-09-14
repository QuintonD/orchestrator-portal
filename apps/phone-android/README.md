# Orchestrator Phone Control for Android

An independent, native Java Android companion for a local computer-use broker.
Requires Android 14 / API 34 or newer; targets API 36. This component is alpha
(`0.1.0-alpha.3`) and has its own application identity and AGPL license with the
origin notice in [ATTRIBUTION.md](ATTRIBUTION.md). The existing portal Android app
remains a separate application. No application runtime dependencies are added.

API 34 is the installation minimum, not a reliability guarantee for every device
or firmware build. Release qualification requires strict native and integration
checks on Google APIs images for API 34, API 35 and Android 16 QPR2 / SDK 36.1.
The older Android 16 Google image `BE2A.250530.026.F3/13894323` is not release
qualified: native smoke passed, but five of 30 independent captures failed while
waiting for a framework callback. Its framework has the confirmed weak-consumer
lifetime defect described in the
[capture investigation](../../docs/phone-control-capture-investigation.md).
OEM backports are unknown; the application does not blacklist an entire SDK level.

The manual [legacy compatibility workflow](../../.github/workflows/phone-control-legacy-compatibility.yml)
keeps that image family under the same strict assertions. A failure stays failed
and cannot satisfy the required release workflow. A capture failure clears the
current observation, withholds tree and pixels, and grants no action authority.
Authenticated Stop remains available. Android 14/15 retain support with one
bounded read-only recovery after an exact internal-error callback. The original
failure remains visible; this is not a framework fix or an action retry. See
[Android 14/15 recovery and caveats](../../docs/phone-control-android-14-15.md).

## Owner-selected draft folders (default)

Use **Select a folder for new drafts** before considering the advanced exact-file
workflow. The Android folder picker and a separate provider trust dialog create
an opaque local folder ID for `android.folder-drafts.v1`. Enable `draft.create`
locally, then select this adapter and ID in the broker owner grant. Existing
exact-file grants never widen automatically.

`draft.create({resourceId, text, deadlineAt})` creates one native-generated UUID
`.draft.txt` file after a complete folder/provider/filename/text review and strong
biometric CryptoObject confirmation for every call. The broker supplies the
deadline. The only success receipt is `{status: "completed"}` after matching
readback. There is no folder read API, caller filename/URI/path, replacement,
delete, publish, or generic action fallback. Text limits match the exact-document
adapter below. At most 255 existing immediate children are supported, with a
bounded metadata-only listing; their content is never read by this adapter.

Android grants broader persistent folder/descendant read-write permission than
this typed adapter exposes. The provider package, signing identity, installed
version/update, tree URI, and folder name are pinned. Before opening a created
file, the adapter checks a new ID, canonical same-tree URI, exact generated name
and MIME type, immediate listing membership, and unchanged existing metadata.
It opens `rw` without truncation and rejects nonempty, nonregular, or multiply
linked descriptors. It never deletes a failed draft. Any uncertainty after
`createDocument` begins reports `unknown_action_state`; do not replay it.

These checks require a trusted provider: a dishonest provider can alias backing
storage or lie about metadata, and concurrent writers can race validation.
Provider sync or other applications can act on a draft independently. A draft
extension is not a guarantee against publication by the surrounding system.
Choose a dedicated trusted folder without publishing automation. See the
[folder acceptance record](FOLDER_SCOPE_QA.md) for tested boundaries and limits.

## Advanced: exact owner-selected plaintext documents

`android.document.v1` is a separate resource adapter. In the companion, select
one document using the Android picker and explicitly trust the displayed provider.
Choose read-only or read-and-replace authority, enable the corresponding local
operations, and copy the opaque resource ID into the broker's owner grant. The
generic `describe` response never lists document handles, names, or provider URIs.

- `document.read({resourceId})` returns `{resourceId, revision, text}`.
- `document.replace({resourceId, expectedRevision, text, deadlineAt})` returns
  `{status: "completed"}` only after a real strong-biometric CryptoObject consent,
  an unchanged revision check, exact replacement, and matching readback.

Documents must be valid UTF-8, at most 2,000 UTF-16 code units and 8,192 bytes,
with no NUL characters. Revisions are lowercase SHA-256 of the exact UTF-8 text;
line endings and Unicode are preserved. Empty text is supported. Only exact
`text/plain`, nonvirtual, nonpartial SAF documents with ordinary seekable file
descriptors and a `MANAGE_DOCUMENTS` protected provider are supported. The exact
URI, provider package, signer, installed version/update identity, and display
name are pinned locally. Caller paths, URIs, directories, and account scopes are
rejected. The separate app/screen path is never a fallback for document requests.

Provider trust is explicit: SAF cannot attest an account or guarantee atomic
compare-and-swap. Concurrent edits can still race the final revision check;
providers can have effects outside the URI contract. Each replacement review
shows the complete previous and replacement text, exact URI, handle, and pinned
provider identity. Once write access is attempted, failures report
`unknown_action_state`; there are no automatic mutation retries. A matching local
readback does not prove remote synchronization or absence of provider side effects.

Provider I/O runs in one bounded off-main worker. A timed-out provider retains
that slot until it actually returns, blocking new work and session rearming.
Stop revokes session authority immediately; a dispatched provider write may
still finish. Revoke removes the local grant first and releases Android's
persisted URI permission after outstanding provider work settles. A hung
provider can delay that cleanup, but the removed handle cannot authorize reads
or writes. The final result is rechecked against local authority on the main
thread before publication. See [document scope QA](DOCUMENT_SCOPE_QA.md).

## Build and install

Install Android SDK platform 36 and JDK 17 or 21, set `ANDROID_HOME` and
`JAVA_HOME`, then from this directory:

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :fixture:assembleDebug :fixture:lintDebug --no-daemon
adb -s YOUR_DEVICE install -r app/build/outputs/apk/debug/app-debug.apk
```

On Linux/macOS use `./gradlew`. The wrapper and complete project can be copied
out of the portal repository and built independently. Preserve the license,
attribution, and third-party notices. Debug installs use
`io.github.quintond.orchestrator.phonecontrol.debug`; production uses
`io.github.quintond.orchestrator.phonecontrol`. The test fixture has a different
package, `io.github.quintond.orchestrator.phonefixture.debug`.

Release builds require `PHONE_ANDROID_KEYSTORE`, `PHONE_ANDROID_KEY_PASSWORD`,
and optionally `PHONE_ANDROID_KEY_ALIAS` (default `phone-control`). Missing
signing configuration fails the build. Retain the signing key and application
ID, increment `versionCode`, and test an in-place upgrade before distributing a
new release. Do not install a debug build over the separate production package
and call that an upgrade. This implementation does not publish an app-store
release or promote the existing project beyond alpha.

## Local authorization and pairing

1. Open **Phone Control Alpha** and read the data-sharing disclosure.
2. Open Android accessibility settings and explicitly enable the service.
3. Select user-installed apps and operations in the companion. Apps are pinned
   to their current signing identity. Nothing is allowed by default. System
   apps, launchers, permission controllers, package installers, keyguard, and
   the companion are excluded. The separate **Allow screenshots of allowed apps
   to leave this phone** grant also defaults off; enable it only when pixels may
   be shared. Policy edits, including screenshot changes, stop the current session.
4. Allow its notification and press **Start a 10 minute session**. The visible
   token is a secret; enter it manually into the local broker. Starting a new
   session rotates the token. Session state never resumes after process death.
5. On the trusted host run `adb -s YOUR_DEVICE forward tcp:8837 tcp:8837`.
   Configure the broker's native endpoint as `http://127.0.0.1:8837`.
6. Open an allowed app on the phone. General actions pause for an exact action
   review in the companion followed by Android's strong biometric prompt.

The service listens only on IPv4 loopback, only during the session. ADB is a
trusted administrative tunnel; raw loopback HTTP is not TLS. Use authenticated
USB debugging or Android's paired wireless-debugging tunnel. Do not expose the
forwarded port through a LAN listener or reverse proxy. The host and ADB have
authority beyond this companion and are outside its enforcement boundary.

Keep the native token and ADB on that trusted host. Source programs use the
broker's scoped interface and an owner-provisioned public response-verification
key; they must not connect directly to this native endpoint. The broker separately
requires a bounded executor lease for each mutation except Stop. Acquire it
before observing the target, since acquisition invalidates earlier observations.
See the [source SDK](../../docs/phone-control-source-sdk.md) and
[isolated source deployment](../../docs/phone-control-isolation.md).

Stop from the ongoing notification, the companion, or authenticated `stop`.
Screen-off, accessibility interruption, policy edits, timeout and process death
also revoke the session. A dispatched gesture can finish for up to two seconds
after stop; Android does not provide an atomic cancel-and-rollback API.

## Wire protocol

`POST /v1/call`, `Content-Type: application/json`,
`Authorization: Bearer <phone token>`. Requests are bounded to 16 KiB; headers
to 8 KiB; responses to 6 MB. `Origin`, browser fetch metadata, chunking,
duplicate headers, streaming, other paths, and non-loopback Host values are
rejected. Three workers permit stop while another request awaits consent.

```json
{"id":"unique_request_id","method":"observe","params":{"allowedPackages":["io.example.notes"],"includeScreenshot":false}}
```

Response: `{"id":"...","result":{...}}` or
`{"id":"...","error":{"code":"...","message":"..."}}`. Request IDs use
1–96 ASCII letters, digits, `_` or `-`. Error messages contain no app content,
token, typed text, or stack traces. Do not interpret dispatched actions as
verified outcomes: take a fresh observation and verify the expected result.

| Method | Parameters |
| --- | --- |
| `describe` | `{}`; capabilities, local enabled methods, session expiry and limits |
| `apps.list` | `allowedPackages`: nonempty list, at most 32 package names |
| `observe` | `allowedPackages`; optional `includeScreenshot`, default false |
| `app.launch` | `packageName`, `expectedPackage` equal to that target |
| `tap` | binding fields below; `x`, `y` |
| `longPress` | binding fields; `x`, `y`, `durationMs` 100–2000 |
| `swipe` | binding fields; 2–20 `points` with `x`,`y`; `durationMs` 100–2000 |
| `pinch` | binding fields; `centerX`, `centerY`, `scale` 0.5–2 excluding 1; `durationMs` 100–2000 |
| `node.click` | binding fields; `nodeId` of an enabled clickable node |
| `type` | binding fields; editable `nodeId`, `text` 1–2000 characters; replaces its value |
| `key` | binding fields; `key` is `back` or `home`; no arbitrary key codes |
| `fixture.increment` | binding fields; exact signed test-fixture counter only |
| `stop` | `{}`; always available to the authenticated current session |

All mutations require integer `deadlineAt` (Unix milliseconds), no more than
45 seconds in the future. It is converted to a monotonic deadline on receipt,
checked after consent and immediately before dispatch. All mutations except
`app.launch` also require `observationId` and `expectedPackage`. The native app
checks these against the current phone policy, the cached observation, the
foreground app, its signer/version/install update identity, window ID/bounds,
the bounded tree fingerprint. Content-change epochs also protect the capture
interval. Across the known consent handoff, an epoch change is tolerated only
when every available fingerprinted property and the original window geometry
match; Android does not classify the event as lifecycle-only. Checked, selected,
state-description and other reported semantic changes invalidate that snapshot.
An observation lasts at
most 60 seconds; the broker may impose a shorter limit. A mutation consumes it.

Observation replies contain `observationId`, `packageName`, `windowId`,
`width`, `height`, `capturedAt` (Unix milliseconds), and `nodes`. Node IDs are
bounded path IDs such as `n_0_1`, valid only for that observation; bounds and
gesture coordinates are relative to the captured window. A requested
screenshot is `{mimeType:"image/png",base64:"..."}` at the native pixel scale,
cropped to exclude OS-reported system bars and display cutouts. The tree and
gesture coordinates use that same cropped rectangle. Input coordinates are translated to screen coordinates only on
the phone after validation. No shell, root, raw ADB, arbitrary keycode,
notification-panel or permission-grant capability is exposed.

`touchBounds` is a separate rectangle in those same screenshot coordinates.
It excludes Android's reported `systemGestures` and `mandatorySystemGestures`
insets, including left/right Back gesture edges. Every injected point and
pinch endpoint must remain inside it; right and bottom edges are exclusive.
An all-zero rectangle permits observation but no injected touches. The rectangle
is bound to the observation and checked again before dispatch. Node actions and
explicitly granted Back/Home actions remain separate capabilities. These guards
depend on the platform reporting its reserved gesture regions correctly;
unreported OEM gestures cannot be detected through this API. See Android's
[WindowInsets reference](https://developer.android.com/reference/android/view/WindowInsets).

The companion spaces screenshot probes by at least 400 ms to respect Android's
capture-rate limit. Clients may send an action immediately after observation;
they do not need to insert sleeps. The wait occurs before dispatch and still
honors the action deadline and exact state checks.

Mutating request IDs and response receipts are persisted before dispatch.
Duplicate IDs return their existing receipt; changed parameters conflict. A
process crash leaves an `unknown_action_state` reservation, never permission to
retry. The ledger holds 256 mutations per session without eviction; the user
must start a new session when full. New sessions rotate credentials and reset
the ledger. Do not blindly retry an unknown or cancelled gesture under a new ID.

## Observation and consent limits

Observation visits at most 300 nodes and depth 24. Visible text/descriptions
are limited to 256 characters; editable values are omitted. Any detectable
password or accessibility-sensitive node blocks the entire tree and screenshot.
Oversized/incomplete trees are rejected. Higher overlapping windows, keyboards,
other displays, picture-in-picture and locked devices are rejected.

Every observation probes Android's **window-specific** screenshot API, even
when pixels are not requested, because a secure window must not leak its
accessibility tree. Capture denial or failure returns `blockedReason` with an
empty tree and no screenshot. Capture failures never mean a verified blank
screen. The same secure-window probe runs before observed-window mutations.
Screenshots are held in memory and returned only when the phone's separate
screenshot grant is enabled and the request explicitly asks for pixels. Through
the broker, both session and credential `disclosure.screenshots` grants must also
be true; omitted grants deny pixels. The companion does not save or log screenshots.

Tree-only observations and pre-dispatch secure-window checks validate OS capture
success and exact hardware-buffer geometry, then close the buffer without
creating bitmaps or PNG output. They do not compare pixels. Only explicit
authorized `includeScreenshot:true` requests wrap/crop and encode pixels. The
local screenshot grant is checked before capture and again before returning
pixels. All capture paths
reject raw windows above 6,000,000 pixels before requesting a screenshot, and
check that budget again on the returned buffer before wrapping or cropping it.
This accepts common phone sizes such as 1440 by 3200 pixels.

PNG writes use a fixed 4,000,000-byte output buffer. Any write beyond that cap
fails as `screenshot_too_large`; partial output is never returned. The final
copy is at most another 4,000,000 bytes, so these two application-managed PNG
buffers use at most 8,000,000 bytes together. Bitmap/GPU storage, native encoder
work and later Base64/JSON serialization are additional memory; this is not a
total process-memory guarantee. Encoder cleanup always releases its slot and
completes the waiter as a failure when encoding fails. Fatal errors still
propagate after cleanup; they cannot be reported as a successful capture.

Capture failures report a fixed safe reason: `screenshot_rate_limited`,
`screenshot_secure_window`, `screenshot_invalid_window`,
`screenshot_invalid_display`, `screenshot_access_denied`,
`screenshot_geometry_changed`, `screenshot_too_large`, `screenshot_timeout`, or
`screenshot_internal_error`. Observation uses `blockedReason`; a mutation's
pre-dispatch probe uses the same error code. Exception messages and app content
are never included. These codes diagnose refusal; they do not authorize replay.
Safe diagnostics may include `captureStage` (`queued`, `awaiting_callback` or
`encoding`) and `captureElapsedMs` (capped at 60,000). The capture wait is bounded
at six seconds, allowing Android's own five-second failure callback a delivery
margin; action deadlines are still checked independently before dispatch. On
Android 14/15, `observe` may make one fresh read after the exact internal-error
callback, within a nine-second overall budget. Recovery diagnostics retain the
first failure; they do not establish why its callback was late. Mutation probes
do not retry. Encoding runs on one worker, so it does not block main-thread
stop/consent handling. A local no-callback timeout retains its capture slot until
Android delivers a callback and any buffer is closed. Android's own error callback
does not prove downstream native work has finished. Android exposes no
cancellation API for an already requested window screenshot. If its callback
never arrives, capture stays blocked until the accessibility service restarts.

Apps can fail to mark private content as sensitive, draw it outside the
accessibility tree, or change pixels without an accessibility event. Android
also hides some accessibility-sensitive nodes entirely from services such as
this one that correctly declare `isAccessibilityTool=false`; an absent node
cannot reveal its sensitivity flag. Thus tree inspection does not guarantee
secret-free screenshots, even when an app has marked a view sensitive. See
Android's [sensitive-node behavior](https://developer.android.com/reference/androidx/core/view/accessibility/AccessibilityNodeInfoCompat#setAccessibilityDataSensitive(boolean)).
Android
does not offer an atomic transaction covering screenshot, tree inspection and
gesture dispatch. The checks reduce stale-target risk and fail closed when a
change is observed; they do not prove that an arbitrary app's action is safe or
that every visual change is detectable. Package grants authorize potential
sharing of that app's content. Use the companion only with apps and data whose
sharing you understand and are authorized to approve.

General actions require an auth-per-use Android Keystore operation unlocked by
`BIOMETRIC_STRONG`. The review surface hides overlays, rejects obscured touches,
is `FLAG_SECURE`, and is excluded from this service. Ordinary accessibility
clicks cannot satisfy the biometric check. Authentication confirms an enrolled
user, not their understanding of downstream effects. Hardware, OS, other
privileged services, the debugging host, and signing keys are trusted. Devices
without an enrolled strong biometric remain observation-only for general apps.
The alpha UI has reviewed English-only disclosures.

The exception is the separately granted `fixture.increment`: it accepts only
the exact fixture package, companion signing certificate, fixture version 1,
and one named counter control with exact resource ID and text. The fixture has
no network or Android permissions and only updates a local integer. This proves
standing, narrowly scoped automation without granting any general app a
biometric bypass. Keep its signing key private; a compromised signer is outside
this boundary.

## Emulator verification

Use a dedicated disposable emulator. The smoke runner intentionally replaces
its local grants with the harmless fixture grants; never point it at a user's
phone. It uses `UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`.
Ordinary `uiautomator dump` suppresses other accessibility services and therefore
stops the phone session.

```powershell
.\gradlew.bat :app:assembleDebugAndroidTest :fixture:assembleDebug --no-daemon
adb -s emulator-5570 install -r fixture/build/outputs/apk/debug/fixture-debug.apk
adb -s emulator-5570 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5570 shell settings put secure enabled_accessibility_services io.github.quintond.orchestrator.phonecontrol.debug/io.github.quintond.orchestrator.phonecontrol.PhoneService
adb -s emulator-5570 shell settings put secure accessibility_enabled 1
adb -s emulator-5570 shell pm grant io.github.quintond.orchestrator.phonecontrol.debug android.permission.POST_NOTIFICATIONS
adb -s emulator-5570 shell am instrument -w -r io.github.quintond.orchestrator.phonecontrol.debug.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest
```

The runner sends real loopback HTTP and verifies observation, screenshot opt-in,
editable-value redaction, fixture dispatch and outcome, persisted replay,
request binding, invalid coordinates, deadlines, biometric absence, secure and
password window denial, scope, self-exclusion and stop. The test APK is separate
and must not be distributed as part of the production companion.

Native smoke also decodes the explicit fixture PNG at reduced resolution and
samples at most 4,096 pixels to require opaque, visibly varied fixture content.
Solid or transparent output fails this fixture-specific check. This does not
reject legitimate black screens in production, and it does not replace visual
inspection of the title, controls, counter and attribution.

Use a regular rendering-enabled image for visual acceptance. The installed
Android 14 AOSP ATD image sets `debug.hwui.drawing_enabled=0`; its fixture PNG
was uniformly transparent black despite successful semantic and transport tests.
Android documents that [ATDs disable hardware rendering](https://developer.android.com/studio/test/managed-devices#use_atds),
and that [disabled drawing preserves View lifecycle while skipping rendered output](https://developer.android.com/reference/android/graphics/HardwareRenderer#setDrawingEnabled(boolean)).
The ATD run therefore does not establish screenshot fidelity or visual QA.
Regular API 34 Google APIs revision 14 subsequently passed the native pixel
guard, 30/30 integration reads and visual inspection of the complete fixture.
Its full biometric, large-font layout and actual in-flight Stop checks also
passed. See [native QA evidence](QA.md) for the retained failures and test-helper
fixes, and the [capture investigation](../../docs/phone-control-capture-investigation.md)
for the known older API 36 image failure and current qualification scope.

For a host integration probe, add `-e hostProbe true` before the instrumentation
component. The **test runner only** writes a token to app-private
`files/phone-qa-token` for at most 180 seconds by default and reports a nonsecret
ready marker with that bound. Debug instrumentation may also pass
`-e hostProbe true -e liveAgents true` to select a fixed 360-second monotonic
lease for live model-client orchestration. `liveAgents=true` is rejected without
`hostProbe=true`, with biometric mode, or against a non-debug target. This test-only
lease changes no production session limit, action deadline or authorization.
A host harness may read the token via `adb run-as` directly into process memory;
never print it. Create `files/phone-qa-stop` through that same debug-only
mechanism to end early. The runner deletes both files and stops the session.
There is no production secret-export endpoint or release-build `run-as` access.

Emulator sensor simulation cannot establish real physical biometric consent.
Hardware biometric approval, OEM behavior and production upgrade QA must be
recorded separately when actually performed. Tested Android 14 emulator coverage
is recorded in [QA.md](QA.md).

### Strong biometric simulator tests

Use a dedicated Google APIs API 34 or API 36 emulator named with the
`orchestrator-phone-control` prefix. The Android 14 ATD image may not include
the enrollment UI or biometric hardware simulation. The official
[emulator fingerprint instructions](https://developer.android.com/studio/run/emulator-console#fingerprint-simulation-and-validation)
describe the simulated sensor; this is functional evidence, not hardware
authentication evidence.

For a new disposable emulator, set its synthetic test PIN and open enrollment:

```powershell
adb -s emulator-5570 shell locksettings set-pin 1234
adb -s emulator-5570 shell am start -a android.settings.BIOMETRIC_ENROLL
```

On the emulator, enter that test PIN, advance through **More** and **I agree**,
then reach **Touch the sensor**. Send `adb -s emulator-5570 emu finger touch 1`
until Android reports **Fingerprint added**, then choose **Done**. The API 36
image used for this implementation needed several scans; waiting 300 ms between
scans was sufficient. Never apply this synthetic PIN to a real phone. Enrollment
screen labels and navigation can vary by system image.

After building/installing the companion, fixture and test APK:

```powershell
python scripts/biometric-probe.py --serial emulator-5570
adb -s emulator-5570 shell settings put system font_scale 1.3
python scripts/biometric-probe.py --serial emulator-5570 --mode layout
adb -s emulator-5570 shell settings put system font_scale 1.0
```

The guarded helper rejects physical devices and unrelated AVDs. After the test
runner requests authentication, it waits up to eight seconds for two successive
read-only `dumpsys fingerprint` snapshots showing the companion's current
authentication operation in the started state. It then sends fingerprint 1 once;
unknown formats, another app's prompt and reused request IDs cannot trigger a
touch. `PHONE_BIOMETRIC_SENSOR_READY` records the poll count and elapsed
milliseconds without logging the dump. The
[AOSP scheduler](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/biometrics/sensors/BiometricSchedulerOperation.java)
distinguishes started state 2 from waiting-for-cookie state 4; a test readiness
marker alone does not establish sensor readiness. The helper requires an exact
emulator serial, `ro.kernel.qemu=1` and the
dedicated AVD name prefix. Each ADB operation has a five-second deadline;
full/layout/key-rotation/inflight-stop runs have respective 150/75/60/60-second wall-clock
budgets plus at most fifteen seconds for independent native force-stop and owned
ADB-client cleanup. Output is capped and only fixed readiness/result/status
lines are printed. Success requires raw instrumentation's framework code `-1`,
ADB exit `0`, all mode-specific readiness markers and its exact assertion count.
The helper changes no device settings or app data during cleanup.

Host-only robustness tests require no emulator:

```powershell
python -m unittest discover -s scripts -p test_biometric_probe.py -v
```

The full mode verifies taps, node clicks, long press, swipe, two-pointer
pinch, text replacement, back/home and app launch against actual fixture and
foreground postconditions. It also verifies changed content and checkbox state during consent,
denial, deadline cancellation and stop during consent. Layout mode checks a
2,000-character review in portrait and landscape; restore font scale afterward.

To test key invalidation, first run the full mode so an authenticated key exists,
then add a second fingerprint in Android's fingerprint settings using simulated
fingerprint 2. Do not delete the existing app or clear its data. Then run:

```powershell
python scripts/biometric-probe.py --serial emulator-5570 --mode key-rotation
```

This mode expects the first reviewed action to be denied because enrollment
invalidated the existing key. It checks that the invalidated alias was removed
and that a **new** reviewed action recreates an auth-per-use key and succeeds
with the still-enrolled fingerprint 1. No unauthenticated fallback exists.

Test Stop after a gesture has actually begun with:

```powershell
python scripts/biometric-probe.py --serial emulator-5570 --mode inflight-stop
```

This separate mode approves one two-second press with the real CryptoObject
prompt, then polls the fixture for an actual touch DOWN before sending Stop.
It requires an acknowledgement within 1,000 ms, revoked credentials, an
`unknown_action_state` action receipt and no new touch after a rejected request.
The fixture must observe the original press finish within two seconds plus
500 ms for observation delivery. That evidence does not claim Stop cancelled
the already-dispatched gesture. The mode's exact expected count is 13; it does
not change the full suite's count of 45.

Build artifact checks are available as `:app:verifyDebugArtifact` and
`:app:verifyReleaseArtifact`. They compare packaged license, notice and
attribution bytes with their canonical sources, and check generated release
identity when present. Add `-PrequireReleaseIdentity=true` when building through
the portal's versioned build script.

Semantic scrolling has a separate harmless fixture screen and biometric mode:

```powershell
python scripts/biometric-probe.py --serial emulator-5576 --mode semantic
```

It checks bounded resource/class identity, checkbox state, advertised scroll
directions, pre-consent rejection of an incompatible target, and actual forward/
backward movement after authentication. The expected count is 14. The designated
`5576` AVD is Android 16 QPR2/SDK 36.1; a separate diagnostic trial passed while an
initial trial remains unexplained. See the
[capture investigation](../../docs/phone-control-capture-investigation.md) and
[readiness record](../../docs/android-phone-control-readiness.md) for the complete
platform and failure history. Minimum SDK 34 is not a universal capture guarantee.

The separate Home lifecycle mode uses a synthetic Activity that changes its
content when biometric review pauses it:

```powershell
python scripts/biometric-probe.py --serial emulator-5576 --mode home-lifecycle
```

It expects 37 assertions and seven authenticated-action markers within 150
seconds. It requires Home to reach the resolved launcher after an innocuous
content change, while stale pre-review state, changed-content tap/Back, secure
or password transitions, revoked grants, deadline expiry and Stop prevent input.
This tests the explicit Home contract; it does not weaken other actions' screen
bindings. See the current readiness record for the actual result.

The pinned real-editor workflow is run separately from the repository root:

```powershell
$env:PHONE_QA_SERIAL='emulator-5576'
npm run phone:test:document
```

It needs the pinned Markor APK and enrolled emulator fingerprint described in
the [document QA record](../../docs/phone-control-document-qa.md). It requires
exactly two reviewed actions and independent persisted-file checks; this is
scripted conformance evidence, not a live-agent benchmark.

The biometric fixture modes use a bounded read-only readiness loop. Its safe
`PHONE_READINESS_REFUSED` and `PHONE_READINESS_RESULT` diagnostics retain each
refusal and the eventual recovery count. A geometry mismatch still discards the
image; only a fresh observation can proceed, and no mutation is retried. Keep
these functional readiness results separate from the integration runner's 30
logical requests, which report first-attempt failures and bounded native recovery
separately. The integration harness does not retry those requests.
