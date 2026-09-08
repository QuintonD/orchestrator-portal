# Beta 2 validation — 6 September 2026

> Historical development record. The beta labels below describe the names used during that work, not an approved beta release. The application remains alpha; original results and artifact names are preserved. See [release history](releases.md).

Version: **0.2.0-beta.2**, Android version code **4**. Testing uses synthetic,
disposable workspaces. No personal financial accounts or production runtimes were
used as fixtures. The [implementation plan](personal-workflows-plan.md) and
[workflow guide](personal-workflows.md) define the implemented scope.

## Checks performed

| Check | Result |
| --- | --- |
| Type checks and tests | 101 passed: 97 server, 2 web and 2 contract tests. Final production build passed after the last UI changes. |
| Full browser suite | 75 passed, 3 skipped for device applicability. Desktop Chrome and Pixel-sized Chromium. |
| Personal browser coverage | Project plan, source draft, acceptance and persistence; import preview/replay/correction; goal/check-in/undo/linked agenda/calendar export; monthly plan and historical month; theme/layout coverage. |
| Personal visual review | 29 browser captures across 1440, 393 and 320px in light and dark themes, plus project, money and check-in dialogs. |
| Native regression | 13 Android journeys passed on disposable API 36 emulator 5560: authentication, persistence, keyboard, rotation, document picker, connected-source fixtures, large text, nested Back, decision flow and offline recovery. |
| Android builds | Debug and signed release builds passed native unit tests and lint. |
| Native personal review | 14 captures in light/dark themes, project draft preparation, check-in persistence and native Back passed. |
| Signed APK smoke | Install, private login, navigation, native Back, process persistence and offline recovery passed. The manifest is non-debuggable; the userdebug emulator forces inspection. |
| Windows package | 4 packaging tests and the extracted archive smoke passed, including checksums, isolated runtime, setup, persistence, shutdown and invalid-gateway handling. |

Remote CI results are recorded on the pull request. These checks do not imply live
bank, broker, calendar or production runtime acceptance.

Selected captures: [Today on desktop](assets/personal/today-desktop.png),
[money on a phone](assets/personal/money-phone.png),
[project draft](assets/personal/project-draft.png).

## Findings and fixes

- Phone headers and competing toolbar actions initially pushed useful information
  below the first screen. Short page names, compact headers and actions beside
  their relevant information made the first cash-flow and attention items visible.
- Six navigation entries initially wrapped into a second row. The layout now has
  six explicit columns; the visible Chat label retains the full Conversations
  accessible name. A legacy text-only test was corrected to use that name.
- Money-plan remove buttons initially wrapped and stretched adjacent inputs.
  Field groups now keep the remove action beside its amount.
- A prepared demo plan initially looked like a failed operation. It now appears
  as a ready plan with a clear next step.
- Reusing a runtime profile could mix project source sessions. Each project and
  personal response now requests a distinct session. The source still owns isolation.
- A corrected draft could otherwise leave downstream acceptance looking valid.
  Revision now retains history and resets dependent stages before new preparation.
- Imported snapshots need recovery paths. Source removal/reimport, transaction
  correction, financial export, check-in undo and commitment edit/reopen are implemented.
- Calendar overlap analysis now checks across midnight. iCalendar text is escaped
  and folded by UTF-8 octets; source text cannot inject additional events.
- Source dispatch is persisted before I/O. Restart and uncertain-delivery cases
  were tested, along with duplicate/concurrent requests, changed mandates, global
  pause, stale revisions and rejection of unsupported or unconfirmed dispatch.
- Financial tests cover integer arithmetic, refunds, transfers, currency exclusion,
  duplicate imports, conflicting previews, invalid dates, stale valuations, target
  totals, allocation drift, deletion/reimport and preservation of corrections.
  Category and asset labels match regardless of capitalization.
- Privacy checks confirm personal records are encrypted on disk and that project
  dispatch excludes money/coaching records. Personal money responses share aggregates,
  not individual merchants. Context sharing requires explicit confirmation.

## Critical assessment

These are expert walkthroughs and automated checks, not a recruited usability study.
The app now has meaningful records and draft follow-through, but setup still requires
CSV exports for money and calendars. Merchant classification, recurring bills,
live account balances, brokerage connectivity, live email/calendar sync, time-zone
conversion and push notifications remain gaps. Portfolio analysis is a snapshot
comparison with user-entered targets, not a suitability engine or trading assistant.

Project automation produces bounded text artifacts through an existing runtime;
it does not independently execute, test and deploy a project. An operator still
provides acceptance evidence. Real-provider acceptance and longitudinal operator
testing are needed before claiming reliable autonomous progress toward personal
project, financial or coaching outcomes.

Existing generated sprite atlases are reused with stable role assignments. No new
raster assets were required. User-owned design references under `assets/` are not
included in the change.
