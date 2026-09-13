# Android 14/15 capture recovery and limits

Android 14 and 15 remain supported by this alpha and remain required emulator
release gates. The owner explicitly retained this scope on 13 September 2026.
The companion is not restricted to a particular Android 16 emulator fingerprint.
Physical-phone acceptance is still pending.

## What failed

Candidate `c2bf845f44170153609a01592beae0fbc8f82076` passed general CI, CodeQL,
all six desktop targets and the complete Android 14 and QPR2 workflows. Its
[Android 15 job](https://github.com/QuintonD/orchestrator-portal/actions/runs/34765827817)
passed 47 native assertions, installation, cleanup and authenticated Stop, but
two of 30 independent observation requests failed. Attempts 16 and 19 were
tree-only requests; both reported `screenshot_internal_error` while
`awaiting_callback`, after 5,004 and 5,003 ms. Android's system process remained
stable. The failed run remains failed.

Inspected Android 14/15 framework source retains the screenshot consumer through
a weak JNI reference. AOSP's
[strong-reference correction](https://android.googlesource.com/platform/frameworks/base/+/7549d7629fb0939b1cdac7a3695dcaf5e832d8aa)
fixes that lifetime defect. The public
[per-window capture API](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#takeScreenshotOfWindow(int,java.util.concurrent.Executor,android.accessibilityservice.AccessibilityService.TakeScreenshotCallback))
exposes no handle with which this app can retain the internal consumer.
The two observed failures fit this defect's symptoms, but their artifacts do not
prove the cause of each request. Target-app, compositor or scheduling delays can
also produce a missing callback. See the
[source investigation](phone-control-capture-investigation.md).

## Bounded read recovery

On API 34/35, an observation may make one fresh read after the exact Android
internal-error callback is accepted for its first capture. A matching public
error string alone cannot enable recovery. Secure-window, permission, rate-limit,
encoding and local no-callback timeout failures do not qualify.

The first observation is discarded. The replacement must reacquire the allowed
target with the same package, window and signing identity, then repeat all
secure-window, disclosure and before/after consistency checks. It gets its own
observation ID and capture time. No tree or pixels from the failed read are
returned or used for an action.

The entire observation has a nine-second monotonic budget on these versions,
including tree reads, screenshot pacing, capture and publication. Recovery uses
the remaining time; it does not restart the budget. There is no third attempt.
The shared capture checks used before mutations do not perform this recovery.
Action, consent, session and SDK/task deadlines are unchanged.

The result or terminal error retains a strictly bounded `captureRecovery` record:

```json
{
  "retryCount": 1,
  "initialError": "screenshot_internal_error",
  "initialStage": "awaiting_callback",
  "initialElapsedMs": 5004,
  "totalElapsedMs": 5400
}
```

These numbers illustrate the schema, not a measured recovery. `retryCount` means
one fresh read attempt began; a subsequent policy check can refuse it before an
OS screenshot is requested. It is not a count of dispatched OS captures. Elapsed
facts are bounded to 60 seconds for safe diagnostics and may exceed the operation
budget when Android schedules completion late. Such lateness cannot authorize
publication after the deadline. No first-attempt content appears in the record.

Broker signatures cover this metadata. The SDK and portal preserve it, and the
portal distinguishes a recovered observation from an uninterrupted read. SDK
stable-condition waits reset their consecutive-match count after a recovery.

## Operational caveats

- Recovery is a reliability mitigation, not a framework patch or a guarantee of
  eventual success. Both attempts can fail. Devices with persistent failures
  need a compatible firmware update or another tested device.
- Android's internal-error callback can itself be its five-second timer. It ends
  that public interaction without proving that downstream native capture has
  finished. Late callbacks cannot release a newer ticket or publish old content.
  A local timeout keeps its capture slot occupied until callback cleanup.
- A recovered read usually costs the initial callback delay plus a fresh read.
  The busy lock can block other normal operations during this interval. Stop
  remains independent, and a stopped or changed session cannot publish a result.
- The SDK's default ten-second observation timeout has only nominal headroom.
  Scheduling or transport delay can exhaust it; shorter caller budgets still
  win. Client cancellation does not guarantee cancellation of Android's native
  work. No caller timeout creates permission to replay an action.
- Tree-only reads still require the OS window-capture check to establish secure
  content handling. Turning screenshots off cannot bypass the defect or privacy
  checks. There is no full-display fallback, hidden API, reflection, forced-GC
  strategy or automatic permission expansion.
- Recovery is limited to API 34/35. The older recorded Android 16 revision 7
  failure remains under strict legacy compatibility tests; QPR2 retains its
  unchanged full release tests. SDK numbers and security-patch dates do not prove
  that an OEM includes the framework correction.
- Emulator success does not establish physical biometrics, OEM behavior,
  TalkBack, battery/thermal suitability, broad live-agent task success or Astra
  parity. This remains an alpha for controlled owner testing.

## Acceptance evidence

The integration harness still requires every logical observation request to
complete and retains terminal failures. It separately records first-attempt
failures, recovery reads, recovered requests and latency. A recovered request is
never reported as a successful first capture. This explicitly changes acceptance
from one capture per request to the bounded product behavior above; it does not
remove Android 14/15 from CI or alter earlier failed records.

The first actual API 35 recovery run completed all 30 logical requests with one
failed first capture and one successful recovery. That failure took 5,010 ms;
the fresh observation completed at 5,257 ms total. All eight integration checks,
47 native assertions and cleanup passed, and authenticated Stop took 372 ms.
The fixed missing-consumer warning count rose from zero to one for the sampled
companion PID. This confirms a missing-consumer warning occurred during the
sample, not per-request causation or a statistically established recovery rate.
Evidence is retained in `test-results/phone-control/integration-1789318728790/`
and `native-1789318587474/`. The fixture screenshot was inspected and Android's
system process stayed stable.

Fresh hosted checks still gate merge. Publication also requires fresh signed builds from clean `main`,
matching workflow artifacts and complete in-place upgrade proofs. The
[alpha validation record](alpha-7-validation.md) and PR identify which checks
actually passed; this design description alone establishes no recovery rate.
