# Beta validation — 6 September 2026

Build: **0.2.0-beta.1**. Validation uses disposable synthetic workspaces, local
filesystem fixtures and mock service contracts. Personal runtime workspaces are
not used as test fixtures.

## Completed checks

| Check | Result |
| --- | --- |
| Type checks and unit/integration tests | 83 tests passed: 79 server, 2 web, 2 contracts. |
| Browser regression suite | 65 passed, 3 intentionally skipped by device applicability. Desktop Chrome and Pixel-sized Chromium. |
| Complete beta walkthrough | 6 journeys passed; 11 screenshots, including 320px dark layout and a 540px-high conversation. |
| Native Android journeys | 13 passed on disposable API 36 emulator 5560, including keyboard, rotation, process restart, login, native document picker, large text, nested Back, the complete decision and offline recovery. |
| Android debug and signed release builds | Native unit tests and lint passed for both variants. Version code 3. |
| Route visual review | 48 light/dark phone/desktop route captures, plus icon variants. |
| Final native visual pass | 16 captures; inspected Team, scoped conversation and decision layouts. Theme persistence and sprite animation passed. |
| Signed APK smoke | Install, private login, navigation, Back, process persistence and offline recovery passed. Manifest is non-debuggable; the userdebug emulator itself forces WebView inspection. |
| Windows packaging | 4 packaging unit tests and the extracted archive smoke passed, including checksums, standalone runtime, paths with spaces, setup, persistence, shutdown and invalid/occupied gateway handling. |
| Final focused regressions | 15 beta/report-contract tests and 40 browser checks passed after the final changes. |

These checks support a local beta evaluation; they do not
certify every external runtime or establish real-world autonomous task efficacy.

## What the review found and changed

- A selected assistant previously opened the connector's shared chat. The beta
  retains role identity and history through request, response and reload.
- Reports repeated generic copy. The demo now has distinct roles, meaningful
  revisions and a synthesis preserving disagreement. Live reports have a bounded
  structured contract with literal-text fallback.
- Launch review previously contained no options. It now presents two complete
  choices and inspectable evidence, then updates linked records atomically.
- Local evidence dialogs closed the parent report on Escape. Event handling and
  Android Back now close only the topmost dialog and restore focus.
- The prepared-work section initially appeared only during loading. The final
  page includes it after data loads and refreshes it while open.
- Narrow role cards were too tall. A short task description leads each card;
  the full mandate is available on demand. Icons remain visible at 320px.
- Team's mobile toolbar had two competing primary buttons and wrapped across
  rows. It now has one primary Add team action and compact secondary controls.
- Short-height conversations wasted space on card padding and decoration. The
  scoped conversation reserves space for messages and keeps Send above navigation.
- Repeated index/health refreshes could inflate review work. Unchanged health
  timestamps are ignored; newer guide results supersede older versions without
  deleting their history.

## Integration acceptance matrix

| Connection | Beta evidence | Remaining live acceptance |
| --- | --- | --- |
| Demo | Complete browser/native scenario, distinct roles, corrections, councils, replay and persistence | Synthetic by design. |
| Markdown / Obsidian | Real temporary files; opt-in indexing, search, scope, deletions, prepared guides and malicious-prose fixtures | Larger user collections and workload measurement. |
| OpenClaw | Installed CLI help was checked during alpha development; scheduling, receipts and deduplication have contract fixtures. Current official automation documentation reviewed for beta. | Authorized real turns, source schedules and supported-version acceptance against a configured runtime. |
| Hermes | API contract, history isolation, bounded response and failure fixtures | No live Hermes service acceptance in this pass. |
| Generic webhook | Validated endpoint/configuration, capability filtering, request and failure paths | Endpoint-specific session and outcome semantics require acceptance with that endpoint. |
| Notion | API scope, pagination, partial coverage, revocation and credential fixtures | No live account acceptance in this pass. |
| gbrain | Bounded search adapter and prepared handoff defaults | Previously discovered local launcher had a missing target module; live search remains unverified. No native agent provisioning is claimed. |
| T3 | Workspace handoff, copyable role tasks, source link | Direct portal task execution is not implemented or advertised. |

See [the beta guide](beta.md) for exact default roles and [research scope](beta-scope.md)
for primary sources. These distinctions are deliberate product boundaries, not
successful tests of unavailable integrations.

## Usability assessment

This pass combines a critical visual review with executable operator journeys.
It is not a study with recruited users. The interface now exposes a useful first
result, preserves the chosen assistant, and supports evidence review without
losing context. Those observations are supported by the walkthroughs; comparative
claims about time saved or reduced mental effort are not yet established.

For an operator pilot, measure five tasks: reach a useful first brief, identify
which source is stale, explain a claimed versus observed result, correct a report,
and resume after uncertain delivery. Record completion, wrong turns, source
reconstruction and requests for help. Include a disconnected source and a
misleading report. The beta should not graduate to a broad release until real
operators and their actual connection versions pass those tasks.

## Evidence locations

- `test-results/beta-review/`: complete journey captures and results.
- `test-results/design-review/`: route gallery and icon variants.
- `test-results/android/emulator-5560-1788682454533/`: successful 13-journey native run.
- `test-results/android/design-final/`: final native screenshots.
- `test-results/android/release-emulator-5560-1788683081188/`: successful signed APK smoke.
- `test-results/desktop/`: extracted-package smoke workspaces.

Test outputs are excluded from version control. Selected screenshots are retained
under `docs/assets/beta/` for the handoff.

## Local artifacts

- `dist/desktop/orchestrator-0.2.0-beta.1-win32-x64.zip`
- `dist/android/orchestrator-0.2.0-beta.1.apk`

Both have adjacent SHA-256 files. The fresh demo runs at
`http://127.0.0.1:4425`; its health response reports `0.2.0-beta.1`.
No public release, app-store submission, or personal gateway replacement was made.
