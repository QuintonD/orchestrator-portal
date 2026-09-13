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

The first PR run exposed an elevated Windows ownership error: newly created
private paths could belong to the Administrators group even after receiving a
current-user ACL. Setup now assigns the current account as owner explicitly;
loading still rejects foreign ownership and broad explicit grants. The component
suite passed 122 tests locally, including two Windows ACL regressions. The
elevated-token branch still requires the hosted Windows result.

That run also failed Android 14 native startup, Android 16 screenshot reliability
(five missing callbacks in 30 reads), and Android 16 QPR1 emulator startup before
instrumentation. These remain failures pending diagnosis. Native diagnostics now
report only fixed, allowlisted harness phases; eight parser tests cover injected,
unknown and excessive stage values, and the Android test APK build passed. The
additional diagnostics do not change assertions or retry device actions.

## Release gates

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
