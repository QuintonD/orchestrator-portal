# Grok Bot manual handoff

The alpha supports the official [Grok Bot product](https://x.ai/bot) through a
guided task handoff and local result import. It does not connect to the Grok model
API or control the Bot. No API key, cloud collector, or telemetry setup is needed.

## Use it

1. Open Connections → Work with Grok Bot → Prepare a new task.
2. Edit the Bot name, task, and acceptance criteria; save the handoff.
3. Copy the task, or download it in a browser. The Android portal app offers copy
   and text selection instead of downloads. Open the Grok Bot app, select or create the
   named Bot, and paste the task into its conversation. Review source permissions
   and approve any source action in Grok Bot itself.
4. Ask the Bot to return a JSON or plain-text file, then save it from its result
   card. Grok Bot documents both file attachments and saving generated results in
   [Files and results](https://docs.x.ai/grok-bot/files-and-results).
5. Select the matching saved handoff in the portal, choose the result file or
   paste its contents, and preview it. Check its task, evidence, and uncertainty.
6. Choose **Confirm import as claimed**, then **Open Reports**. The report appears with
   **Manual Grok Bot** as its source and **claimed** evidence state.

Saving or copying a handoff does not send it. The portal cannot know whether a
Bot is working, blocked, or finished. An import records receipt of a manually
supplied report; it does not verify the report or attest that Grok Bot authored
it. To change a saved task, use **Edit as new handoff**; its new ID keeps the
original task and its evidence distinct. Send corrections manually in Grok Bot.

## Result format

Use the handoff ID generated in your workspace; the UUID below is illustrative.

```json
{
  "version": 1,
  "handoffId": "11111111-1111-4111-8111-111111111111",
  "title": "Project progress",
  "body": "Findings, evidence, freshness, uncertainty, and next steps.",
  "sourceUrls": ["https://example.com/project"]
}
```

JSON must contain only the documented fields. `sourceUrls` may be omitted or
empty. The title is limited to 160 characters, body to 50,000 characters, and
sources to ten HTTP(S) URLs of at most 2,048 characters without credentials or
whitespace. The input file is limited to 100,000 UTF-8 bytes. Plain text uses the
selected handoff's title and ID; verify that association yourself before import.
HTML, shell commands, and instructions inside result text are displayed as text.
Source URLs are retained as text, never fetched or executed.

## Storage and boundaries

Handoffs and the latest pending preview for each handoff use the existing
encrypted `alpha_records` store. Handoff APIs enforce the signed-in owner's
identity, existing session authentication, and CSRF checks. Confirmed reports
join the existing workspace Reports collection and follow its review model.

The exact normalized result and handoff ID determine a report ID. Repeating an
import does not create a duplicate or reset an existing review. Different result
contents create separate reports. A replaced preview cannot be confirmed with
an earlier preview ID. Unconfirmed previews expire after 24 hours. A workspace
owner can keep up to 100 saved handoffs; the alpha has no handoff deletion UI.

No connector, `message.send` capability, health probe, native approval action,
remote scheduling, or public Bot conversation link is created by this flow.
The official [Bot share link](https://docs.x.ai/grok-bot/bots) copies configuration
into another account; it is not a link to this task or approval. The product's
[chat workflow](https://docs.x.ai/grok-bot/chat-and-collaboration) remains the place
to redirect work and inspect activity.

## Official live surface for a later integration

As checked on September 5, 2026, Cursor Enterprise offers Grok Bot Action Recording
and [OpenTelemetry Export](https://cursor.com/docs/enterprise/opentelemetry-export).
It requires a public HTTPS collector and explicit team setup. The
[wire reference](https://cursor.com/docs/enterprise/opentelemetry-export/wire)
documents MCP calls, shell policy observations, browser navigation and computer
use summaries; these are not a general Bot control API or verified task outcomes.
This alpha does not enable or depend on that surface. The separate
[xAI inference API](https://docs.x.ai/developers/rest-api-reference/inference)
does not establish access to existing Grok Bot conversations.

## Validation

`npm run test -w @orchestrator/server -- src/grok.test.ts` covers encrypted storage,
session/CSRF enforcement, owner boundaries, explicit confirmation, repeat import
idempotence, source URL/schema rejection, adversarial text, file limits, stale
previews, and expired previews. `npm run typecheck` checks server and UI wiring.
