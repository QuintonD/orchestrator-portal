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
It also checks the executable's reported version and build ID before launch.
The size and checksum apply to the decoded ZIP. HTTP `Content-Length` is
informational because Google can gzip the transfer or omit that header. The
runner records only the HTTP status, advertised length and a fixed encoding
category, then bounds and verifies the decoded bytes before extraction.
The download has a three-minute bound; startup has a ten-minute bound. The AVD
uses 2 CPU cores, 2048 MB RAM, and a 720×1600 LCD at density 280.

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

`test-results/phone-control/emulator-ci-<image>-<run-id>-<attempt>/results.json`
contains typed readiness samples, stage, elapsed time, test exit codes, cleanup
confirmation and fixed crash/error counters. Decimal image punctuation is
removed in the directory name. Raw log messages, UI screenshots, settings dumps,
environment variables and credentials are not published by this runner. A
failure still collects diagnostics before stopping its verified owned AVD. If
ADB cannot identify it, cleanup can signal only the process started by this
runner. Failure to confirm cleanup fails the job. Temporary data remains for the
disposable runner's teardown; the script contains no recursive deletion.
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
