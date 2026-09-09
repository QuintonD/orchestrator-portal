# One home for assistant platforms

Direction confirmed by the owner on 9 September 2026: Orchestrator should bring
major assistant platforms into one home, with the integration depth and engineering
scrutiny expected of T3 Code. This extends the existing personal and professional
assistant workflows. The owner clarified that coding agents and general assistant
services have equal priority from the first integrations, including personal-agent
services such as Muse Assistant.

This is a development plan and coverage record, not a claim that every platform is
integrated. The branch starts with subscription and local model access. Native
platform integration remains required work.

## What integration means

A supported platform should let an operator connect an existing account, choose an
assistant, give or continue work, inspect its state and deliverables, correct it,
and recover from a failure without rebuilding context in another app. Source
runtimes retain their native tools, execution and permission authority. Multiple
accounts must have separate identities and histories.

Record coverage separately for model access, native sessions, work history,
artifacts, approvals, cancellation, usage and account health. A model API, a
workspace link and a native runtime adapter provide different capabilities.
Unsupported controls stay unavailable. A successful health request establishes
only the condition actually checked.

T3 Code's current setup uses separately installed and authenticated providers,
with distinct instances for accounts/configurations. Its provider list includes
Codex, Claude, Cursor, Grok Build, OpenCode and Antigravity. This is a useful
integration reference, not evidence that Orchestrator already supports them.
[T3 Code installation and providers](https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md).

## Coverage and next work

The following inventory is intentionally broader than the first implementation.
An entry in the target column is a commitment to investigate and integrate an
authorized, maintainable surface, not a promise of an undocumented API.

| Platform or family | Implemented portal coverage | Next acceptance milestone |
| --- | --- | --- |
| OpenClaw | CLI messaging, work/schedule sync and health | Live subscription-backed general assistant journey with recovery evidence |
| Hermes | Compatible API messaging and model catalog check | Live assistant journey and native session/history capability review |
| T3 Code | Workspace availability and handoff | Versioned native integration probe; retain it as an independent work environment |
| ChatGPT / Codex | Generic model access when exposed by the configured proxy; no native adapter | Codex account discovery, native session resume, streamed work and permission handling; assess ChatGPT-specific surfaces separately |
| Claude / Claude Code | Same generic model route; no native adapter | Native account/session adapter, tool and approval events, recoverable turns |
| Gemini / Antigravity | Same generic model route; no native adapter | Verify each source's supported account/protocol boundary, then native sessions and work |
| Grok / Grok Bot / Grok Build | Grok Bot manual handoff and claimed result import; generic model route where configured | Keep Bot and Build separate; add native capabilities only after protocol and authority checks |
| Muse Assistant (working assumption: Meta Muse at muse.ai) | No integration; no external control API verified | First-wave investigation of authorized account access, task/activity reads, artifacts and handoffs; retain Muse's native permissions and execution |
| Cursor, GitHub Copilot, OpenCode | No native adapters | Separate account/runtime probes and versioned conformance fixtures |
| Perplexity, Mistral, DeepSeek, Qwen and other general assistants | No platform-specific integration | Establish supported APIs, exports or handoffs; distinguish model access from the hosted assistant product |
| Local models and CLIProxyAPI | New `openai-compatible` text adapter and setup form | Live compatibility record per server/version/model/auth route |

The proxy's published coverage includes multiple provider login paths and API
formats. Availability and entitlements are upstream concerns; proxy support does
not establish vendor endorsement or access to a hosted app's tools and history.
[CLIProxyAPI overview](https://github.com/router-for-me/CLIProxyAPI#overview).

Muse is included as a personal-agent service, independently of access to any
underlying model. Its product team describes background tasks, goals, persistent
context, artifacts, activity history and structured approval controls. These are
useful capabilities to preserve in a portal integration. The reviewed product
description does not establish an API for another application to control Muse.
Record its integration route as unverified until supported documentation and a
working probe establish it. [Muse product design](https://introducing.muse.ai/),
[Meta's Muse announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/).

## Use an existing subscription or local model

The new **Subscription / local model API** connection speaks a bounded,
non-streaming Chat Completions interface. It can serve source conversations,
prepared teams, reports and existing text-draft workflows. It does not run tools,
import native chats, or create a new execution runtime.

1. Start and authenticate your chosen compatible server on the gateway computer.
   For CLIProxyAPI, follow its [setup guide](https://help.router-for.me/). Configure
   only the intended subscription account/model route and disable paid fallback.
   Keep account passwords and OAuth credentials in the source's authentication
   flow. The portal needs only the proxy client key.
2. In **Connections**, choose **Add connection**, then **Subscription / local model
   API**. Enter the API base address, for example `http://127.0.0.1:8317/v1`, and the
   proxy access token. Use HTTPS and a token for a server on another computer.
   Unauthenticated local inference is allowed only at a loopback address.
3. Enter the exact model ID listed by your source and choose subscription or local
   access. No model is silently selected. The output limit defaults to 4,096
   tokens and can be set from 256 to 16,384.
4. Confirm the source's billing configuration, then **Add and check**. This sends
   an authenticated `GET /v1/models`, checks that your model is listed, and makes
   no generation request. A failed check keeps one saved connection for retry.
5. Send a first message in **Conversations**, or prepare a team with the matching
   subscription/local policy. Only an actual turn establishes that generation
   works. Use synthetic text for an initial connectivity check.

The default CLIProxyAPI port is 8317, but its example configuration binds all
interfaces unless `host` is set. For a same-computer connection, configure
`host: "127.0.0.1"` and a client key under `api-keys`.
[CLIProxyAPI example configuration](https://github.com/router-for-me/CLIProxyAPI/blob/main/config.example.yaml).

Subscription login and metered API access are different routes. For example,
Codex documents ChatGPT sign-in for subscription access and API-key sign-in for
usage-based billing. A ChatGPT subscription is not a general Platform API key.
[Official OpenAI authentication documentation](https://developers.openai.com/codex/auth).

This connector accepts subscription/local configurations only. The confirmation
is an operator declaration: the portal cannot inspect or enforce a proxy's
upstream account selection, paid fallback, model aliasing or quota policy. Use a
dedicated route with those restrictions configured at the source. No metered
route is offered until a shared spending limit can be enforced. No retry,
provider switch or paid fallback occurs in this adapter.

Each named connection has its own conversation history and encrypted settings.
An outgoing conversation carries its latest 20 eligible messages plus the new
message and attached text. The serialized request is limited to 256 KiB; responses
are limited to 1 MiB. Health checks time out after 10 seconds and turns after
120 seconds. Redirects are rejected. Source errors are sanitized.

Normal text is **claimed**. Truncated text is retained as **unknown**; malformed,
empty and tool-call responses do not become completed work. Timeouts remain
uncertain because the source may have received the request. Check it before
retrying. Model catalogs do not establish quota, subscription validity or native
tool support. Token/cost reporting and streaming are not implemented in this slice.

## The scrutiny required

"Like T3 Code" sets an engineering benchmark, not an inherited certification.
T3's repository provides separate type, formatting/lint, test, native, build and
release-smoke commands; its CI also records transfer-budget evidence. Compare
observable behavior and test coverage, not stars or an asserted equivalent quality
level. [T3 scripts](https://github.com/pingdotgg/t3code/blob/main/package.json),
[T3 CI](https://github.com/pingdotgg/t3code/blob/main/.github/workflows/ci.yml).

Every new integration must have a reviewable evidence record:

| Gate | Required evidence |
| --- | --- |
| Real compatibility | Exact source version, model, account route and supported capabilities; a live synthetic first turn before claiming a tested provider |
| Authentication and isolation | Signed-out, missing-CSRF, revoked-login and multiple-account tests; encrypted secrets absent from responses and audit |
| Reliable state | Missing models, malformed/partial output, quota exhaustion, transport failure, timeout and restart tests; no invented completion or automatic duplicate dispatch |
| Native authority | Source session IDs and permissions retained; expiry, wrong-session and replay challenges before approvals or cancellation are exposed |
| Resource and spending limits | Bounded input/output, deadlines, concurrency and quota behavior; no unapproved fallback; enforceable aggregate reservation before metered automation |
| Usable journeys | Keyboard and mobile setup, first useful result, visible recovery, readable long errors and explicit unsupported features |
| Maintainability | Small adapter boundary, versioned schemas/defaults, no copied secret formats or undocumented endpoints, current setup and coverage docs |
| Release confidence | Local CI, adversarial review with reproducible findings, desktop packaging, fresh Android build and in-place upgrade QA from the released commit |

The current CI runs the added adapter/lifecycle tests through `npm run check` and
the browser journey through `npm run test:e2e`. Before a PR, run
`npm run release:check`, `npm run check`, `npm run build` and the applicable browser
and desktop checks. Record exact results and skipped platform checks in
[the branch validation record](assistant-platforms-validation.md). Keep the alpha
stage and existing release workflow.

## Delivery order

1. **Subscription access foundation:** complete the new connection's setup,
   message, failure, privacy and mobile fixtures; record live upstream testing
   separately from protocol fixtures.
2. **First-wave platform integrations, with equal priority:** advance coding
   agents (Codex, Claude Code and Gemini CLI), general assistant services
   (ChatGPT, Claude and Gemini), and personal-agent services (including Muse,
   OpenClaw, Hermes and Grok Bot) together. Verify each service's actual access
   route early. Establish a reusable conformance suite around account identity,
   sessions, native events and recovery. The first integration milestone needs
   a working coding-agent journey and a working general/personal-assistant
   journey, with source/version and access limitations recorded for each.
3. **Broader coverage:** extend those journeys to Antigravity, Grok Build, Cursor,
   Copilot, OpenCode and the remaining general assistants against the same suite.
   Track unsupported service APIs explicitly; pursue authorized exports or
   handoffs where useful, and label their narrower coverage. A model-only route
   does not satisfy a native service-integration milestone.
4. **Cross-platform continuity:** preserve source ownership through handoffs,
   shared deliverables, corrections, attention items and bounded councils. Compare
   matched personal/professional tasks against native tools and T3 where relevant.

Streaming, source approvals/cancellation, durable dispatch reconciliation and
enforceable metered budgets are explicit follow-up work. The first slice does
not satisfy the complete platform-integration vision by itself.
