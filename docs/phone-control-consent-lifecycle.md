# Consent lifecycle investigation

Research date: 2026-09-13. This is a source investigation and experiment proposal,
not an architecture decision or a validated replacement for `ConsentActivity`.
This investigation makes no change to production consent, cryptographic
authorization or Stop. No emulator or physical-device experiment was run for
the proposed service-overlay replacement. The separate, implemented
[Home action contract](android-phone-control.md#controls-and-console-equivalence)
still uses the existing Activity and per-action strong biometric consent.

## Finding

A public `BiometricPrompt.Builder(serviceContext)` is syntactically supported,
but this does not establish permission to authenticate while another package owns
the foreground Activity. A normal enabled accessibility service can create an
accessibility overlay; that overlay does not give its package a foreground
Activity task. The examined Android 14 and Android 16 QPR2 implementations enforce
this distinction in SystemUI and again in biometric authentication processing.
Consequently, replacing the consent Activity with a service Dialog is not an
established portable API 34+ solution while retaining per-action strong biometric
authentication. The expected result in the ordinary single-app foreground case
is cancellation or rejection, not successful authorization.

This investigation was prompted by document-task stale-precondition failures
around consent. Their exact changed fields and artifact counts belong to the
document-task investigation. Android documents that launching another Activity,
including a translucent or dialog-themed Activity, can pause the underlying
Activity. Changing only the Activity theme therefore does not remove the relevant
lifecycle transition. A separate non-Activity window is a useful experiment, but
absence of `onPause` alone would not prove that focus, IME, insets, accessibility
actions, or application data stayed unchanged.
[Activity lifecycle documentation](https://developer.android.com/guide/components/activities/activity-lifecycle#onpause)

## Biometric authority: process foreground is not Activity foreground

The source references below use the immutable Android 16 QPR2 framework revision
`45034f0663f960d9ee5fb0a101a4732b71f6e2f4`, plus the API 34 release tag
`android-14.0.0_r1`. These are reviewed AOSP implementations, not a claim that
every OEM build has identical code.

| Check | Verified behavior and implication |
| --- | --- |
| Public builder | `Builder(Context)` takes a Context, without an Activity-only parameter. This establishes the call shape, not background authentication authority. See the [public API](https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt.Builder#Builder(android.content.Context)). |
| Initial service admission | `AuthService.authenticate`, around lines 305–318, checks AppOps and `Utils.isForeground(uid, pid)`. The latter accepts process importance at least as high as `IMPORTANCE_FOREGROUND_SERVICE`. A bound or foreground service may pass this process check; it is not the last check. See [AuthService](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/biometrics/AuthService.java#305) and [server Utils](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/biometrics/Utils.java#582). |
| API 34 prompt ownership | `AuthController.cancelIfOwnerIsNotInForeground`, lines 242–268, compares the top Activity package with the prompt client and dismisses a non-system client on mismatch. Showing a prompt schedules this check unless background authentication was explicitly allowed. An accessibility overlay does not change the top Activity package. See [Android 14 AuthController](https://android.googlesource.com/platform/frameworks/base/+/android-14.0.0_r1/packages/SystemUI/src/com/android/systemui/biometrics/AuthController.java#242), and its [post-show check](https://android.googlesource.com/platform/frameworks/base/+/android-14.0.0_r1/packages/SystemUI/src/com/android/systemui/biometrics/AuthController.java#1256). |
| QPR2 prompt ownership | `AuthController` checks before showing the dialog and on task changes. Its helper examines top/visible Activity tasks, with system and credential-flow handling; there is no enabled-accessibility-service exception. See [AuthController](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/packages/SystemUI/src/com/android/systemui/biometrics/AuthController.java#1317) and [SystemUI task helper](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/packages/SystemUI/shared/biometrics/src/com/android/systemui/biometrics/Utils.kt#170). |
| Authentication completion | `AuthenticationClient` changes an otherwise successful authentication to failure when the non-system/non-keyguard owner is background and background authentication was not allowed. QPR2 `Utils.isBackground` accepts the top Activity package or a matching visible task. A service window is not either. See [QPR2 AuthenticationClient](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/biometrics/sensors/AuthenticationClient.java#201), [task test](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/biometrics/Utils.java#645), and the [Android 14 authentication check](https://android.googlesource.com/platform/frameworks/base/+/android-14.0.0_r1/services/core/java/com/android/server/biometrics/sensors/AuthenticationClient.java#193). |
| Privileged exception | `Builder.setAllowBackgroundAuthentication` defaults false and is hidden, marked `@TestApi`, and requires `TEST_BIOMETRIC` or `USE_BIOMETRIC_INTERNAL`. `PromptInfo` requires test/internal permission when it is enabled; `AuthService` enforces that permission. This is not a public application workaround. See [BiometricPrompt](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/hardware/biometrics/BiometricPrompt.java#639), [PromptInfo](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/hardware/biometrics/PromptInfo.java#160), and [permission enforcement](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/biometrics/AuthService.java#321). |

The newer visible-task rule leaves a distinct multiwindow hypothesis, but it
does not authorize a service-only design and is not consistent with the API 34
top-task check above. No split-screen or invisible-Activity workaround is
proposed. Neither process priority nor permission to start a background Activity
should be confused with permission to authenticate without one.

## What a secure accessibility Dialog can and cannot establish

An enabled `AccessibilityService` has framework-managed overlay tokens. Its
WindowManager and accessibility window contexts supply those tokens. A future
test may use a themed service/window Context and public
`TYPE_ACCESSIBILITY_OVERLAY` window attributes; it must not copy hidden token or
window-manager APIs from the implementation. This supports drawing a review
surface, independently of the biometric authority question.
[AccessibilityService window-context/token implementation](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/accessibilityservice/AccessibilityService.java#1168)

`FLAG_SECURE` protects window content against screenshots and nonsecure display
output. It does not authenticate who initiated a click or prove that the human
read the exact action. `Window.setHideOverlayWindows(true)` requires
`HIDE_OVERLAY_WINDOWS` and hides non-system overlay windows; it is not a promise
to remove every privileged or accessibility surface.
[Window flags](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_SECURE),
[overlay-hiding API](https://developer.android.com/reference/android/view/Window#setHideOverlayWindows(boolean))

The implementation makes this limit concrete: `WindowState` force-hiding applies
to system-alert window types and toast windows, with exemptions. The alert-type
switch does not include accessibility overlays. `InputMonitor.isTrustedOverlay`
explicitly includes `TYPE_ACCESSIBILITY_OVERLAY`. Android's input-system term
"trusted" therefore must not be interpreted as cryptographic proof of our app's
review text or a guarantee against another user-enabled accessibility service.
[WindowState suppression](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/wm/WindowState.java#3110),
[alert-window classification](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/view/WindowManager.java#2662),
[input overlay classification](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/services/core/java/com/android/server/wm/InputMonitor.java#726)

The default `filterTouchesWhenObscured` check rejects the full-obscuration flag;
partial obscuration needs an explicit policy and test. Sensitive accessibility
data restricts services that are not declared accessibility tools, while retaining
an accessibility-tool path. These controls are useful layers, not replacement
authorization. Preserve accessible denial/Stop and test the legitimate
accessibility route instead of assuming all automation-generated input is
blocked. The current Activity also uses these kinds of protections; the peer
accessibility limitation is not unique to a proposed overlay.
[View security filtering](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/view/View.java#16849)

A review window must prevent unintended interaction with the underlying target.
`FLAG_NOT_TOUCHABLE` permits pass-through under conditions including trusted
windows; `FLAG_NOT_TOUCH_MODAL` allows touches outside the window to reach windows
behind it. A focusable overlay may affect the target's focus or IME; a nonfocusable
one has keyboard/accessibility tradeoffs. Neither selection establishes target
state invariance without measurements.
[Input and focus window flags](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_NOT_TOUCHABLE)

The existing `ConsentActivity` uses a strong-biometric, auth-per-use Keystore
Cipher, checks the returned CryptoObject identity, and performs `doFinal` over
the pending request before authorization. A replacement must preserve this
request binding and denial/cancellation behavior. A callback, review-button
click, recent device unlock, or successful non-crypto prompt is not equivalent.
[Local consent implementation](../apps/phone-android/app/src/main/java/io/github/quintond/orchestrator/phonecontrol/ConsentActivity.java),
[auth-per-use CryptoObject semantics](https://android.googlesource.com/platform/frameworks/base/+/45034f0663f960d9ee5fb0a101a4732b71f6e2f4/core/java/android/hardware/biometrics/BiometricPrompt.java#1110)

## Bounded experiment before any implementation decision

The first experiment should be test-only, on synthetic content, with no phone
mutation dispatched. Run each owned emulator separately under the normal lease
rules. Record full SDK version, image revision/fingerprint, companion build,
window type/flags, biometric enrollment and test mode. Do not grant hidden/test
biometric permissions or adopt shell identity for the app's authentication call.

1. Instrument a synthetic editor to count `onPause`, `onStop`, `onResume`,
   `onWindowFocusChanged`, IME/inset changes and saves. Record which approved
   observation fields changed, using counters/hashes rather than document text.
   Use an editor with deterministic save-on-pause behavior and keep its Activity
   as the top target task.
2. Compare the current Activity review, a secure service overlay without a
   biometric call, and that overlay with public service-context
   `authenticate(CryptoObject)`. Separately test focusable and nonfocusable
   overlays. Keep the companion's Activity absent from visible/top tasks in the
   service variants; verify this precondition instead of inferring it from the
   screenshot. Run the Activity variant as an authentication positive control.
3. Run a predeclared ten attempts per variant on API 34 and API 36.1. Retain all
   attempts, including prompt failures. Record terminal callback code, elapsed
   time, task ownership, lifecycle counts, changed-field categories and whether
   the exact auth-per-use Cipher operation succeeded. Authentication success
   requires `doFinal`, not a visible prompt or callback alone. Expect the
   service-only biometric variant to be rejected by the reviewed AOSP rules;
   record a contrary result as a compatibility finding requiring investigation.
4. Test Deny, system biometric Cancel, Stop while review/authentication is pending,
   expiry, service unbind, Activity/task switch, configuration change and a late
   success callback after cancellation. Require zero authorization after terminal
   denial/Stop and no pending request or overlay left behind. Set a fixed overall
   timeout; never retry a failed authorization silently.
5. Only if public crypto authentication and lifecycle preservation both work,
   test full and partial ordinary overlay interference, a separately enabled
   test accessibility overlay/service, IME visibility, outside touches, hardware
   keys, TalkBack, and secure screenshot behavior. Record the trust limitations
   explicitly. Emulator input is test orchestration, not proof of physical
   biometric or human-intent assurance.

This experiment distinguishes three independent questions: whether a review
surface leaves the editor unchanged, whether Android authorizes the exact crypto
operation, and whether the review/Stop surface has the required protections. A
pass in one column cannot substitute for another. Until all are supported, keep
the current consent path. For content-bound actions, if lifecycle changes
invalidate an observation, a later request needs fresh observation and its own
review; silently rebinding an already approved request to changed state would
weaken the gate and is outside this proposal.
