# Assistant reasoning validation — 10 September 2026

The preference controls future portal requests for one assistant. Saving does not
dispatch, change models, expand permissions, or edit native schedules. Legacy
profiles send no override. See [source behavior and limits](assistant-defaults.md).

## Local checks

- `npm run check`: type checks and 219 tests passed (189 server, 16 web, 14 contracts).
- `npm run build`: production build passed; the existing large web chunk warning remains.
- `npm run test:e2e`: 123 passed; three desktop-only cases intentionally skip on mobile.
- `npm run release:check`: alpha 6 identities agree.
- `npm run desktop:test`: four packaging/path isolation tests passed.
- `node scripts/desktop/package.mjs win32-x64` and `npm run desktop:smoke`:
  fresh Windows archive and 13 packaged runtime checks passed, including native
  startup without system Node/npm/Git, authentication, graceful stop and persistence.
- `npm run android:build`: fresh debug APK assembly, native unit tests and lint passed.

The new server fixtures cover all effort values, documented HTTP payload paths,
real argument delivery to a synthetic OpenClaw CLI, invalid settings, source
rejection without fallback, authentication, persistence across gateway restart,
assistant isolation, duplicate installs, in-flight guards, paused/unknown state,
queued council changes, and preferences changed during scheduled-report imports.

Browser checks cover setup, immediate conversation editing, keyboard focus,
failed reads and writes, a committed write whose response is lost, draft retention,
reload, source-controlled reset, and 740×360 layouts with a reachable Send button.
No background model request occurs when preferences are read or saved.

The first hosted run exposed a Windows-only assumption in the CLI test fixture.
The fixture now uses the explicit JS entry on Windows and an executable on PATH
on POSIX, matching the adapter's existing platform behavior.

## Direct QA and review

Chrome computer-use inspection changed the preference to High, verified the saved
state, then sent one synthetic task to a loopback fixture. Its captured request
contained `reasoning_effort: high`. No external model was called.

An isolated Android API 36 emulator used a fresh debug APK installed in place with
existing fixture settings retained. Five focused journeys passed: native selector
interaction, saving without dispatch, keyboard/composer usability, requested effort
reaching the synthetic API, and persistence after reload. Menu, saved state,
keyboard, and reloaded screenshots were inspected. Local evidence is under
`test-results/reasoning-native/`; it contains synthetic data only.

Adversarial LLM review reproduced preference-loss races in queued council turns
and scheduled-report imports. Both now read current profiles before dispatch or
timestamp updates, with regression tests. It also identified a failed-read
navigation lock and short-screen clipping. Assistant switching stays available
during read failures, sending waits for known preferences, and short conversations
can scroll to the composer. The browser regressions pass after these fixes.

## Limits

These are control-path and interface checks, not live model-quality evaluations.
Model support is source-dependent; rejected or ignored values are not retried or
silently replaced. OpenClaw keeps its native session preference until reset there.
Deadlines and output caps are unchanged; explicit compatible-API effort counts
reasoning within the completion budget. The preference adds one small local read
when opening a conversation and one local write per edit, with no polling.

This is a source feature merge, not a distribution release. The existing alpha
version remains; signed desktop/Android upgrade publication is outside this change.
Hosted CI additionally builds desktop bundles and runs the full Android journeys.
