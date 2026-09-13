# Owned Android CI lifecycle

Phone Control CI uses `scripts/android-emulator-ci.mjs` to own one fresh emulator
from creation through cleanup. It runs only on Linux GitHub Actions runners and
refuses any attached device or occupied reserved port. It creates a unique AVD
inside a fresh `RUNNER_TEMP` directory, without copying userdata, replacing an
existing AVD, wiping data or retrying tests. Existing developer and release QA
emulators are outside its scope.

Install the matrix's SDK image before invoking it:

```sh
sdkmanager 'platforms;android-36' 'build-tools;35.0.0' 'system-images;android-36.1;google_apis;x86_64'
node scripts/android-emulator-ci.mjs --image 36.1 --test tests/phone-control/native.mjs --test tests/phone-control/integration.mjs
```

Images 34, 35, 36 and 36.1 are accepted; the workflow selects the supported gate.
Only the two explicit test entry points are permitted. Neither a failed native
assertion nor a setup failure is converted into success. API-specific
compatibility exclusions must remain explicit in the workflow and release docs.

The runner downloads emulator 36.6.11.0, build 15507667, to its own temporary
directory without overwriting the SDK emulator. Its Linux archive is pinned to
331232577 bytes and SHA-256
`1eade4cf2df6ea8eeead4902c635897ba12aaa32aac4389eaae0fdb498a5b830`, verified against
[Google's emulator archive](https://developer.android.com/studio/emulator_archive).
It also checks the executable's reported version and build ID before launch,
using `-no-window -version` so verification selects the same headless runtime
as the actual CI launch. A nonzero or timed-out version command still fails.
The size and checksum apply to the decoded ZIP. HTTP `Content-Length` is
informational because Google can gzip the transfer or omit that header. The
runner records only the HTTP status, advertised length and a fixed encoding
category, then bounds and verifies the decoded bytes before extraction.
The download has a three-minute bound; startup has a ten-minute bound. The AVD
uses 2 CPU cores, 2048 MB RAM, and a 720×1600 LCD at density 280.

The workflow selects command-line tools 16.0 (build 12266719), and the runner
uses that versioned directory after checking its revision metadata. If setup
reuses `latest`, the runner accepts it only when the versioned directory is
absent and the same exact revision is verified. It does not assume `latest`
refers to the tools selected by setup. New owned
AVDs explicitly use a 6 GiB data partition, matching local QPR2 QA. This setting
is applied before first boot; it never resizes or clears an existing AVD.

Readiness requires the boot flag, expected API and emulator identity, a running
`system_server`, and live activity, package, input, window and settings services.
Read-only settings and package queries must succeed. Three consecutive samples
must retain the same system-server PID. Only then may the runner unlock the
display or change animation scales. It rechecks readiness and the unlocked user
after configuration and refuses a system-server restart before or after either
test. Fractional API 36.1 also requires `ro.build.version.sdk_full=36.1`; an
Android 36.0 runtime cannot satisfy that gate. Actual build fingerprints are
recorded alongside service facts.

This addresses an observed gap in
[android-emulator-runner v2.34.0](https://github.com/ReactiveCircus/android-emulator-runner/blob/v2.34.0/src/emulator-manager.ts):
that action checks only `sys.boot_completed`, then unconditionally sends an input
event before reaching the workflow's test script. The API 36.1 job on
13 September 2026 returned the boot flag while input and settings services were
missing; the action exited 20 before running tests. Disabling its animation
option or adding a wait inside its test script cannot guard that earlier input
call. The retained log does not establish why the Android services disappeared;
the new diagnostics distinguish readiness failure from a test failure without
assuming a root cause.

A second CI run reached the same unconditional input call and received a broken
pipe from the input service (exit 224), also before instrumentation. Both
failures remain recorded; neither is counted as native test coverage.

The first owned-launcher CI attempt stopped all three companion jobs during the
archive download, before starting an emulator. A reproduced HTTP 200 response
advertised 329592949 gzip-encoded bytes for the pinned 331232577-byte ZIP. The
original guard incorrectly compared those different lengths. Local HTTP tests
now cover gzip and chunked delivery, failed or partial HTTP responses, incorrect
checksums, short or oversized decoded bodies, and cancellation. Exact decoded
size and SHA-256 checks remain mandatory.

The following CI run verified the download on all three images but failed in
the combined extraction/version stage, again before creating an AVD. An owned
Ubuntu 24.04 reproduction showed that plain `-version` selected the GUI QEMU
binary and failed on an unavailable PulseAudio library; `-no-window -version`
reported the pinned version and exited successfully using the same archive.
The runner now records extraction and version verification as separate stages,
with only the exit code and timeout flag for a failed setup command. The prior
CI artifact did not retain the exact subcommand or library error, so that
reproduction explains the fixed setup dependency without claiming a native
test failure or a successful emulator boot.

`test-results/phone-control/emulator-ci-<image>-<run-id>-<attempt>/results.json`
contains typed readiness samples, stage, elapsed time, test exit codes, cleanup
confirmation and fixed crash/error counters. Decimal image punctuation is
removed in the directory name. Raw log messages, UI screenshots, settings dumps,
environment variables and credentials are not published by this runner. A
failure still collects diagnostics before stopping its verified owned AVD. If
ADB cannot identify it, cleanup can signal only the process started by this
runner. Failure to confirm cleanup fails the job. Temporary data remains for the
disposable runner's teardown; the script contains no recursive deletion.
Cleanup independently requires the owned process to exit and a successful ADB
device listing with its serial absent. It polls both facts for up to 20 seconds,
then signals a remaining owned process and allows a further 10 seconds for
retirement, with individually bounded ADB calls. It records typed component
facts, including unreadable ADB or a lingering registration. A failed evidence
write cannot interrupt those cleanup attempts and still fails the job afterward.
Each test runs in its own Linux process group. Timeout, cancellation or completion
terminates only that owned group, including leftover broker or fixture-server
children; the following test is never a retry of a failed one.

Unit fixtures cover missing services despite a boot flag, restarting system
servers, bounded timeout, device/path ownership, failure cleanup and diagnostic
minimization. Real Linux subprocess tests require both a parent and child to
announce readiness, then prove both disappear after timeout or output overflow.
Spawn errors also fail closed. These tests run in Linux CI and explicitly report
a platform skip on Windows.

The first local Docker process-tree check caught a real implementation error:
`execFile` did not forward the `detached` option, so the child remained in the test
harness's process group and group termination could not stop it. That owned QA
container was stopped after recording its process tree. The helper now uses
`spawn` directly, with a four-megabyte output cap, owned group termination,
bounded timeout and cancellation. The corrected subprocess checks passed using
the pinned Node image with Docker `--init` and read-only mounts of only the two
test scripts. This host QA is separate from the product's container isolation
proof. The Linux CI run remains the integration check for the downloaded Linux
emulator and real Android services.

The next retained CI run reached Android: API 34 and 35 each passed 47 native
assertions. API 35 also passed all eight integration checks and 30 independent
reads, but its job failed because the final one-shot process/ADB cleanup check
was unconfirmed. API 34 separately failed integration with a `session_expired`
response; the cause of that session termination remains under investigation.
The cleanup evidence did not identify which component remained, so the new
bounded retirement observations preserve that distinction; they do not waive
cleanup failures or replace failed native or integration tests.

That run's Android 16 QPR2 image restarted `system_server` repeatedly and never
unlocked, before any application tests ran. For failures in those two readiness
stages only, the runner now projects bounded crash-buffer code locations:
allowlisted system process names, signals, framework exception classes and
frames, native module/function identifiers and fixed failure categories. It
discards exception messages, argument/template text, addresses and raw log
content. Once a test starts, this boot-only projection is disabled. It helps
diagnose the OS failure without changing readiness deadlines or app guards.

The next candidate passed the complete API 34 and 35 suites, including delayed
process/ADB retirement. QPR2 still restarted before tests. Its boot trace
included framework SQLite and Bluetooth failures plus graphics mapper lock
frames; these locations do not establish a single cause. That QPR2 candidate
selected `swiftshader` with the default Vulkan setting, matching local QPR2
native and upgrade QA. Other images retained `swangle` with Vulkan disabled.
Both modes are described in the
[official graphics documentation](https://developer.android.com/studio/run/emulator-acceleration).
This is a controlled profile change involving two settings, not evidence that
QPR2 universally requires Vulkan or that ANGLE caused the earlier crashes.
The selected profile is recorded with the unchanged image/build pins, readiness
checks, deadlines and test gates. Its Linux acceptance requires fresh CI.
The runner also records host storage capacity before launch, then host and guest
`/data` total/available bytes before tests and after boot or test failures. Unreadable,
ambiguous or invalid observations become `null`. It retains no paths, raw
command output or storage contents. These diagnostic facts never establish
readiness or excuse a failed test; a SQLite exception alone does not establish
storage exhaustion.

The profile candidate passed Android 14 and 15 again, including complete raw
native Stop metadata. QPR2 reached readiness but failed while installing the
synthetic APKs, before instrumentation. Host storage had 84 GB available; guest
capacity was not observed by that candidate. The former `androidStable: false`
value was a default after test failure, not independent evidence of a restart.
The launcher now probes Android after failed tests too and records the actual
snapshot, with `null` when no snapshot can be read. A failed test cannot pass
because Android remains ready. An unverified post-test state also fails and
does not, by itself, establish whether the process restarted.

Investigation found that setup selected tools 16.0 while the launcher invoked
the runner's preinstalled tools 12.0 through `latest`. A separate, unbooted
Pixel 7/QPR2 configuration generated with Google's checksum-verified tools 12.0
used an 800 MiB data partition; local tools 21.0 generated 6 GiB. The launcher
previously changed RAM and display settings but retained that storage default.
This establishes the configuration mismatch. It supports the guest-storage
hypothesis without proving the unrecorded installation error or every earlier
OS crash. Explicit tool and partition selection plus fresh guest storage and
install diagnostics are required for the next qualification run.
The native harness records the attempted APK role, elapsed time, exit status
and a fixed allowlisted package-manager failure code. It preserves prior
successful installs and stops after the first failed attempt. Both successful
process exit and the exact installation success protocol are required before
instrumentation. Missing, overflowing or contradictory output fails without
exporting APK paths, error messages or retrying installation.

The explicit-tools/storage candidate passed API 35, but QPR2 still failed during
initial configuration with mapper lock and composition-sampling crash locations.
The Linux runner now uses `swangle` with Vulkan disabled on all selected images,
the profile that passed API 34 and 35. Earlier QPR2 runs with this profile used
the old 800 MiB/tool-12 configuration, so they do not establish failure of this
corrected combination. Local Windows QA retains its independently exercised
profile. Three exact source-derived mapper assertion categories help distinguish
the next boot failure without exporting abort messages; existing traces cannot
identify those missing assertions retroactively. Configuration records the
current fixed step name while preserving the original command failure.

An actual API 34 storage probe explained the unavailable guest facts: `df /data`
reports its bind mount as `/data/user/0`, which the strict parser rejected.
The fixed `/data` query now uses `stat -f -c %S:%b:%a`, a single numeric record
for filesystem block size, total blocks and available blocks. The actual probe
and bounded parser checks validate those byte counts without exporting paths or
expanding a mount-name allowlist.

The [Android 14 activity manager](https://android.googlesource.com/platform/frameworks/base/+/android14-release/services/core/java/com/android/server/am/ActivityManagerService.java)
exposes a separate sequencing risk: `am force-stop` queues a
`PACKAGE_RESTARTED` broadcast, whose accessibility package monitor can later
remove the component from the current enabled-services set. The native harness
now waits for the broadcast barrier, including broadcast-loop and application-
thread flushes, immediately after force-stop and before the following test.
It uses the existing ten-second cleanup command bound; failure still fails QA
and cannot skip private-file or child-process cleanup. Five tests exercise the
actual cleanup block's ordering and failure paths. Android 14, 15 and QPR2 source
all expose this command and flags; the command also returned successfully in
171 ms on the owned API 34 emulator. Local lifecycle probes did not reproduce
the CI failure: one exited before READY, and a follow-up could not verify its
instrumentation prerequisite. The latter's failed cleanup lacked command-level
facts, so it cannot identify a barrier failure or timeout. This is a correction
to a source-established sequencing gap, not a proven diagnosis of the earlier
service destruction. Full hosted native/integration acceptance remains required.
