# Alpha build

This release is a local, single-operator alpha for evaluating assistant oversight and interaction. It adds complete supported journeys to the original portal, with a monochrome interface based on the supplied Invisible OS reference. It is not a claim that every workflow in the broader product direction has passed live integration validation.

## Try the application

Use Node.js 24 or newer:

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4400`, set a workspace passphrase, and add a connection. For an isolated synthetic workspace, run `npm run dev:demo` and open `http://127.0.0.1:5173`. Demo storage defaults to `data/demo`; private storage remains `data`. An explicitly configured `ORCHESTRATOR_DATA_DIR` overrides that separation, so do not point both modes at the same directory.

The public repository contains application source. Runtime connections, credentials, reports, and indexed documents belong on the user's gateway, not on a public host. No new hosted service is required.

## Supported journeys

1. **Orient:** the Portal shows received decisions, project state, expected routines, and source freshness. An empty workspace does not report healthy assistants. Sources last checked over 15 minutes ago produce an incomplete-coverage notice; this is a freshness heuristic, not a measured availability guarantee.
2. **Activate an assistant:** choose an outcome template or write a purpose, identify success criteria, reuse a connected runtime, and confirm its data and provider restrictions. Profiles use separate source session keys where supported. The portal does not create sandboxed runtime identities through this form.
3. **Get a result:** request a report, inspect the source claim beside its criteria, mark it useful or disputed, and send a correction. Revisions preserve the original report. No response or a timeout becomes `unknown`, and the assistant blocks another dispatch until the operator inspects and resets it.
4. **Sustain follow-up:** daily and weekly expectations show missing work separately from returned reports. OpenClaw can commit a native read-only recurring schedule. The job has an idempotent declaration key, an isolated session, a `read` tool allow-list, a 120-second turn timeout, and no channel delivery. Fetch scheduled reports from the assistant detail panel; duplicate runs are not reimported. Native schedules keep running when the portal is paused or offline. Disable them in OpenClaw.
5. **Converse:** send messages to a connected runtime, attach an explicitly chosen small text file, or carry a draft from the Portal. Hermes receives the previous 20 nonfailed, nonambiguous messages from the selected connection. Message content is encrypted in local storage. Sending a message can invoke the source's tools, so configure those restrictions in the source before connecting it.
6. **Deliberate:** select two or three assistant profiles and explicitly consent to share the question with their configured providers and their assessments with the lead. Participants respond independently before synthesis. The request makes at most four source turns, without automatic retries. Distinct profiles are not proof of distinct models or independent training. A missing assessment produces a partial council.
7. **Inspect activity:** filter source events, create persistent keyword/source watches, inspect event evidence, and review local changes. Watches highlight matching records in the foreground; they do not enable push notifications.
8. **Retrieve knowledge:** browse indexed documents, inspect their source and modification time, and search authorized Markdown directories or an explicitly connected gbrain instance. Correct source documents in the original store and resync. No model summarizes or stores search results automatically.
9. **Continue work in T3 Code:** add its workspace URL, prepare an editable project handoff, remove unrelated context, copy it, then open the independent workspace. No undocumented T3 execution or session API is used.
10. **Personalize and recover:** reorder, resize, and hide supported dashboard widgets; save them to the local profile; undo the last saved layout in Settings. Arbitrary widget code and assistant-authored layout changes are not enabled.

## Integration matrix

| Adapter | Supported alpha surface | Validation and limits |
| --- | --- | --- |
| OpenClaw CLI | Chat; work and routine snapshots; usage; native scheduled briefs and run-history import | CLI help checked on installed `2026.9.1`. Contract fixtures cover scheduling and deduplication. Real turns and schedules need an authorized configured runtime; not exercised against personal data during development. |
| Hermes API | Model-catalog health; nonstreaming Chat Completions; explicit conversation history | HTTP request/response and failure fixtures pass. No live Hermes instance was available. Scheduling, cancellation, and per-token streaming are not advertised. |
| gbrain CLI | Explicit keyword search with source references | Uses `gbrain search <query> --json`; expects an array or a `results` array. The installed launcher failed because its target module was missing. Live compatibility is pending a repaired install; unsupported output is reported as incomplete coverage. |
| T3 Code | Reachability; source-native workspace link; editable copied handoff | No history or execution API parity claimed. Test the configured workspace URL during setup. |
| Markdown directory | Opt-in indexing, full-text search, document inspection | Filesystem fixtures include exclusions and source boundary checks. Index copies are plaintext; protect the data directory. |
| Generic webhook | Explicit message POST; bounded reply; reachability check | Remote URLs require HTTPS. Redirects are not followed. Delivery success does not establish external completion. |
| Demo | Synthetic assistant, reports, projects, activity, and knowledge | No external execution. Always visibly labelled. |

Primary integration references: [OpenClaw agent CLI](https://docs.openclaw.ai/cli/agent), [OpenClaw cron CLI](https://docs.openclaw.ai/cli/cron), [Hermes API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/), [gbrain source](https://github.com/garrytan/gbrain), and [T3 Code source](https://github.com/pingdotgg/t3code). Installed runtime behavior takes precedence over compatibility assumptions.

On Windows the OpenClaw adapter invokes `openclaw.mjs` with Node directly, avoiding shell interpolation of message text. Standard npm PATH installations are detected. For another installation, set `ORCHESTRATOR_OPENCLAW_ENTRY` to its absolute entry path. The portal never reads OpenClaw credential files.

## Authority and cost boundaries

Assistant profiles, prompts, and review criteria are not a security sandbox. The source runtime must enforce tool/data restrictions and subscription or local-model selection. The operator confirms these once during profile setup. The portal does not switch providers or silently enable a paid fallback. All metered profile dispatch is blocked, even with an entered limit, because no current adapter enforces an aggregate spending reservation. Direct chat follows the connected source's configuration and requires deliberate operator submission.

The **Pause dispatch** control blocks new portal assistant requests, direct messages, and council turns. It does not terminate in-flight work or source-owned schedules. In-flight requests cannot be duplicated by pausing and immediately resuming an assistant. Gateway restart converts unfinished assistant and council requests to unknown.

The optional broker supports one narrow operation: reading documents from one indexed knowledge connection. Settings creates a separate bearer identity for a selected assistant and source, expiring in seven days. The API allows expiry up to 31 days. Requests cannot choose another source, and revocation is checked on every call:

```sh
curl -H 'Authorization: Bearer <one-time-grant>' \
  'http://127.0.0.1:4400/api/broker/knowledge?q=project'
```

Only a token hash is persisted. Upstream provider credentials are never returned. This isolates the broker's reads, not the assistant's other tools, filesystem, shared memory, or credentials. Mail, finance, arbitrary provider operations, OAuth brokerage, delegation, and permission expansion are outside this broker implementation.

## Data and release checks

SQLite stores assistant profiles, reports, reviews, councils, watches, and layout revisions in encrypted records using the existing local vault. Messages and connector configurations also remain encrypted. Searchable knowledge, event metadata, and audit metadata are not fully encrypted. Gateway authentication, CSRF checks, origin checks, and rate limits cover the new human-facing endpoints. Broker reads use a distinct scoped credential.

Back up the stopped gateway's full data directory and its encryption key together; restore to an isolated private directory. Keep one process per data directory. Source connectors remain the authority for external data deletion and running work. Removing a connection deletes its indexed documents, local messages, secrets, and broker grants, but separately stored reports and councils remain in the encrypted outcome history. Retention and derived-content deletion controls still need a dedicated workflow before sensitive-data use.

Validation commands are `npm run check`, `npm run build`, and `npm run test:e2e`. End-to-end tests use a fresh synthetic data directory and a separate loopback port (`4411`) on each run. Tests cover desktop and mobile setup/report review, councils, watches, knowledge dialogs and focus restoration, draft continuity, navigation, and layout persistence. Server fixtures cover authentication, scoped access, revocation, metered limits, pause, concurrency, timeout ambiguity, corrections, replay, and scheduling receipts.

The remaining broader-alpha work is explicit: live authorized integration acceptance, full proactive configuration improvement and rollback, generalized provider brokerage, source capture and derived-content deletion, rich artifact handling, push/quiet-period delivery, real independent outcome verification, and measured founder workflows. No efficacy or feature-completeness claim is made for these unvalidated areas.
