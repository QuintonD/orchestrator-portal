> For the personal-workflows extension, see [the guide](personal-workflows.md) and [validation](personal-validation.md).

# Prepared teams and local briefs - alpha 3

This page records the alpha 3 workflows. The current source build expands and
revises the catalog; see [the review of all presets and model classes](assistant-defaults.md).
Its team picker starts with one role and leaves external first briefs off.

The filename is retained for existing links. Earlier development documents called this work beta; the application remains alpha. See [release history](releases.md).

This alpha prepares useful work before asking the operator to configure a role or
reconstruct a decision. Compass produces the first local brief automatically.
Each connection offers a small prepared team, with its execution path visible.

## Default teams

| Connection | Prepared selection | Behavior |
| --- | --- | --- |
| Workspace | Compass, Lens, Keeper | Local overview, uncertain results and evidence age, open decisions. Compass is installed automatically. |
| Demo | Atlas, Sage, Relay | Distinct coordination, evidence review and follow-up in a deterministic launch scenario. |
| OpenClaw | Atlas, Sage, Relay, Rhythm | Runtime briefs and conversations; Rhythm focuses on recurring work. Source schedules remain separate. |
| Hermes | Atlas, Sage, Relay | Dedicated role conversations through the configured API. |
| Generic webhook | Atlas, Sage, Relay | Role prompts through the configured endpoint. Session continuity depends on the endpoint's capabilities. |
| Markdown directory | Librarian, Curator, Scout | Local document inventory, age/title review signals and a bounded reading list. |
| Obsidian vault | Librarian, Curator, Scout | The same guides scoped to the selected indexed vault. |
| Notion | Librarian, Curator, Scout | The same guides scoped to the pages explicitly shared and indexed. |
| gbrain | Scout, Keeper | Prepared memory-search and review tasks. Search remains available in Knowledge; these templates do not create a gbrain agent runtime. |
| T3 workspace | Builder, Reviewer, Launch | Prepared implementation, code-review and release-review tasks, with a source link and copyable mandate. No direct execution adapter is claimed. |

The catalog lives in `packages/contracts/src/assistant-catalog.ts`. Each template
has a stable ID, version, icon row, role, mandate, criteria, trigger and supported
connection kinds. Portal profiles are roles using a connection; installing one
does not create a native runtime agent or sandbox. Separate conversation keys
preserve portal identity without overstating runtime isolation.

## First-use behavior

1. Compass summarizes records already available to the gateway, with no model call.
2. Connection discovery suggests installed tools. Adding a source requires its
   normal scope and credentials; indexing still requires explicit consent.
3. “Prepare this team” opens that connection's matching roles. Installation is
   idempotent. Indexed guides prepare reports immediately. Runtime teams offer
   one first brief per new role after the existing runtime boundaries are confirmed.
4. Local guides refresh when their input changes while the gateway runs, checked
   every 30 seconds. Health-check timestamps alone do not create identical briefs.
   New guide reports supersede earlier versions; history is retained.
5. Pause controls stop new portal requests and local guide refreshes. Source work
   and source schedules retain their own lifecycle. Ambiguous source delivery is
   retained as unknown and never silently retried.

An empty workspace is described as empty; no synthetic achievements, time saved,
or independently verified outcomes are inferred for a real user.

## Complete demo journey

Open Team → Sage → Open conversation. The page, prompt, session and history all
remain Sage's. Atlas and Relay have separate histories and different assessments.

Request Atlas's report. It contains a recommendation and two inspectable source
documents. Open a document and use Escape or Android Back: only the top dialog
closes. Ask for evidence before publication to receive a separate revision with
the new checkpoint and an explicit list of changes. The original stays intact.

In Attention, review the launch positioning. Compare two complete copy options
and their tradeoffs. “Use this direction” records a simulated choice and updates
the linked attention item, project description/status, outcome report and event
in one database transaction. Project progress does not increase. Repeating the
same choice is idempotent; stale or conflicting choices are rejected. No content
is published and no external message is sent.

Councils retain independent role assessments and synthesize agreement,
disagreement and the next checkpoint. The simulation is a bounded product demo,
not an open-ended language model or evidence of real-world task success.

## Reports and continuity

Runtime briefing requests use a versioned, bounded JSON presentation contract.
Valid results render as recommendations, findings, evidence and limits. Unsupported
responses remain literal text; executable links and schema expansion are rejected
by the structured parser. A polished report never upgrades its receipt to verified.

Conversations persist their input before source I/O. On an interrupted gateway
restart, an in-flight assistant and its pending message become unknown. Profiles
can be edited, paused and archived. Archiving retains reports and revokes scoped
portal grants; it does not cancel native work or schedules.

## Reviewed screens

[Prepared defaults](assets/beta/default-team.png) ·
[Report and evidence](assets/beta/report.png) ·
[Preserved revision](assets/beta/revision.png) ·
[Phone decision](assets/beta/decision-phone.png) ·
[Android Team](assets/beta/android-team-dark.png) ·
[Android Sage conversation](assets/beta/android-sage-light.png).

The [validation record](beta-validation.md) separates tested behavior from the
remaining live integration and operator-pilot acceptance.

## Research and product direction

The [research and acceptance scope](beta-scope.md) records the primary sources:
Claude Code, OpenClaw, LangGraph, Zapier Agents, Magentic-UI and T3 Code. The useful
patterns are focused roles, clear routing, durable state and concrete templates.

The extension here is to combine those patterns with automatically prepared local
findings and a decision that carries its alternatives, evidence and follow-through.
The intended benefit is less operator reconstruction, rather than a larger roster
of agents. This is a product hypothesis; automated walkthroughs do not establish
comparative superiority or replace sessions with actual operators.

## Run and test

- `npm run demo`: build and start an isolated synthetic workspace at port 4425.
- `npm run check`: type checks and unit/integration tests.
- `npm run test:e2e`: desktop and mobile browser regression suite.
- `node tests/beta-journey.mjs`: isolated complete prepared-team journey and screenshots.
- `node tests/design-capture.mjs`: light/dark captures of all twelve routes at phone and desktop sizes.
- `npm run android:build`: debug APK, native unit tests and lint.
- `npm run test:android`: disposable emulator journeys, including nested Back and the full decision.
- `node tests/android/visual.mjs`: final native WebView screenshots and animation checks.
- `npm run desktop:package` and `npm run desktop:smoke`: self-contained desktop bundle and extracted-package checks.

Alpha 3 includes these features in the desktop bundles. Follow the [upgrade guide](desktop.md#workspace-files-and-upgrades) to retain your workspace. Runtime connections still require their normal authorization.
