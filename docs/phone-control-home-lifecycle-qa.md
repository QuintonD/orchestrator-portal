# Home consent lifecycle QA

Date: 2026-09-13. This record covers the dedicated native test of Home's
post-biometric state comparison and an independent review of the production
change. The service-overlay research remains separate in
[the consent lifecycle investigation](phone-control-consent-lifecycle.md).

The new `home-lifecycle` mode passed 37 assertions on its first trial. It verifies
that one authenticated Home request can leave the original app after its label
and checkbox change during consent, while content-dependent and protected cases
remain denied. The full regression did not complete: it stopped after 40
assertions on a read-only screenshot geometry mismatch. The separate semantic
scroll regression passed 14 assertions. None of these modes was repeated within
that original matrix. A later full functional trial with explicit read-readiness
accounting is recorded separately below.

## Test construction

`LifecycleFixtureActivity` is a separate, permissionless synthetic Activity. It
changes a status label and checked state once, synchronously in `onPause` when
the consent Activity launches. Separate fixture variants also enable
`FLAG_SECURE` or change an empty input into a password field. This uses an actual
application lifecycle transition without a production test hook, delayed timer,
hidden API, or relaxed authorization path. The existing fixture layout and
45-assertion full/14-assertion semantic modes are unchanged.

The test invokes the real local request, review and strong-biometric CryptoObject
paths. The host supplies seven emulator fingerprint events in an exact order.
UiAutomation independently checks the actual resolved launcher, the fixture's
window ID, its checkbox and its action-click count; an action receipt alone does
not establish the outcome. After the positive Home case, test orchestration
brings the same fixture task forward to inspect its retained state.

| Case | Required and observed result |
| --- | --- |
| Home with content changed before review | `stale_observation`, no consent and no navigation |
| Home with label/checkbox changed during review | Authenticated dispatch; resolved launcher becomes foreground; original fixture window retains its changed state and zero action clicks |
| Tap and Back with the same pause-time change | Each returns `stale_observation`; original fixture remains foreground with zero action clicks |
| Window becomes secure during review | Home returns `screenshot_secure_window`; subsequent observation exports neither tree nor pixels |
| Empty input becomes a password field during review | Home is denied when the original acceptable window does not return; UiAutomation confirms password state and subsequent observation returns `sensitive_window` |
| App grant revoked during review | Biometric authentication does not override the revoked grant; Home returns `forbidden` and the fixture remains foreground |
| Key-operation grant revoked during review | Same denial with the operation grant still absent |
| Pending Home deadline expires | `consent_denied`, pending review removed, fixture stays foreground |
| Stop during pending Home review | Stop succeeds, cancels Home, removes consent and revokes the session token; fixture stays foreground |

The mode expects exactly 37 assertions, including the three shared setup
assertions, and these seven sensor markers:

```text
home-content
home-strict-tap
home-strict-back
home-secure
home-password
home-revoked-app
home-revoked-operation
```

The bounded host runner refuses missing/reordered markers, a mismatching summary,
or an unsuccessful instrumentation/ADB result. Its new adversarial test confirms
that six markers or a 36-assertion summary cannot pass. All ten host harness tests
passed. The mode has a 150-second overall deadline. Existing bounded read-only
observation readiness waits remain in use; this is functional acceptance, not an
unretried capture reliability benchmark.

## Evidence and retained regression failure

Artifacts are in
`test-results/phone-control/native-home-lifecycle-1789271940923`:

- `provenance.json`: APK SHA-256 values and `readEmulatorEvidence` output.
- `home-lifecycle.txt`: the complete successful 37-assertion protocol.
- `full.txt`: the failed full regression, after 40 assertions.
- `semantic.txt`: the successful 14-assertion semantic regression.
- `home-lifecycle-fixture.png`: visually inspected after the Stop case; the
  changed status, checked box and `Action clicks: 0` are readable.
- `results.json`: per-mode outcomes, display settings and cleanup evidence.

The dedicated AVD was
`orchestrator-phone-control-api361-google-20260913`, `emulator-5576`, Google APIs
Android 16 QPR2 image revision 4. Runtime SDK was 36, full SDK `36.1`, fingerprint
`google/sdk_gphone64_x86_64/emu64xa:16/BE4B.251210.005/14574095:userdebug/dev-keys`.
Display size was 720 by 1,600, density 280, font scale 1.0. Current app, test and
fixture APKs were installed with `-r`; no uninstall or data clearing was used.

The full regression reached all nine ordinary mutation paths and both
stale-content cases. It failed while obtaining the read-only observation after
explicit review denial, before its final deadline and Stop cases. The safe
diagnostic was `screenshot_geometry_changed`, stage `encoding`, elapsed 7 ms:
the returned screenshot buffer dimensions did not match the observed window.
Existing diagnostics did not include both dimension pairs, so this record does
not infer an inset, animation or platform cause. The capture gate rejected the
mismatch; that trial was retained without adding a retry or substituting a pass. The new
dedicated mode independently exercised Home deadline and Stop cases, but its
pass does not erase the full regression failure.

The parent-run combined build passed before these device trials: 116 Gradle
tasks, 44 JVM tests, app/fixture lint and APK legal/identity verification. This
worker ran the ten Python host tests and inspected the changed source/diff.
After native QA, the companion was force-stopped and its PID absence verified;
private `phone-qa-token`/`phone-qa-stop` files were removed. No ADB forwards were
created. The unlocked emulator lease was returned for separate document-task QA.

## Independent production review and limits

The reviewed `ActionRevalidation` comparison checks package identity, signer/
version/update identity, window ID and all twelve rectangle coordinates before
considering tree content or events. Initial observation matching remains exact.
Only the validated `key`/`home` pair gains permission for tree changes after
consent. Both the restoration check and final synchronized dispatch use this
comparison. The original-window secure screenshot probe, fresh full tree scan,
keyguard, policy, session generation, freshness and deadline checks remain in the
dispatch path. No verified gate bypass was found in this independent review.

This trial did not simulate signer replacement, an application update, an OEM
window implementation or a physical sensor. Geometry/window-identity rejection
also has separate pure JVM coverage; this fixture did not inject every possible
protected overlay or rotation race. Emulator biometrics verify the native
CryptoObject integration and cancellation behavior, not physical biometric
assurance or a human's understanding of the review. The secure review surface
was not made capturable to obtain a screenshot.

## Later functional trial with explicit read readiness

The follow-up changes only the instrumentation readiness loop and its host
diagnostic parser. `screenshot_geometry_changed` joins the existing bounded
readiness refusals in `BiometricProbe.stableObservation`, with at most eight
read-only attempts. No production capture check, mutation request, action retry,
image dimension or strict integration benchmark changed.

The source review does not establish the mismatch's cause. AOSP obtains the app
surface asynchronously and builds its layer-capture arguments without using the
earlier accessibility-window bounds as a source crop. Equality with an earlier
accessibility rectangle therefore cannot be inferred from that implementation.
The 7 ms encoding-stage refusal proves that a buffer arrived and failed the
companion's dimension check; the absent expected/actual dimension pairs prevent
a more specific attribution.
[Reviewed QPR2 capture arguments](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/accessibility/java/com/android/server/accessibility/AbstractAccessibilityServiceConnection.java#1488)

Every refused readiness attempt now emits a fixed record containing sequence,
attempt, allowlisted code/stage and bounded elapsed milliseconds. Every completed
sequence emits `ready` or `failed` with its refused-read count, including zero.
Capture diagnostics reset between attempts. No exception message or app content
is exported. The host validates ordered counts, ranges and complete status
records before emitting them; missing terminal evidence, an exhausted eight-read
sequence claimed as ready, private text and sensor/readiness interleaving fail
the protocol. A matching updated test APK is required; an older transcript with
no readiness evidence cannot pass this updated runner.

The one later full trial passed all 45 assertions. It made 20 read attempts across
19 readiness sequences. Sequence 18 retained this refusal and recovery:

```text
PHONE_READINESS_REFUSED 18 1 screenshot_geometry_changed encoding 12
PHONE_READINESS_RESULT 18 ready 1
```

All other sequences completed with zero refused reads. This is functional
coverage under an explicit readiness contract, not a production reliability
correction or a clean unretried capture pass. The original full-40 failure above
remains evidence. The strict 30-read integration gate was not changed or rerun by
this worker.

Evidence is `test-results/phone-control/native-full-readiness-1789272864784`:
`full.txt` retains every emitted record, `results.json` includes all 19 terminal
results and the refusal, and `provenance.json` identifies the device and APKs.
The new test APK SHA-256 is
`a83410316c20c98af89e88c912f7659c7b967ab23f5b1b13d5a222ee1057e85b`.
The local and installed production APKs were checked before and after the trial;
both remained
`61904eef09de40d2f14aad85a1f085563b63e0fa0faa4db69e5dbcb090ab6b48`.

All 14 Python harness tests passed. Instrumentation rebuild and app lint passed
52 tasks, seven executed, in two seconds. After the single trial the companion
was stopped, PID absence verified, and private probe files removed. No forwards
were created; emulator and Gradle leases were returned to the parent task.
