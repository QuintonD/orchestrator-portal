# Orchestrator

[Documentation](docs/README.md) | [Downloads](https://github.com/QuintonD/orchestrator-portal/releases) | [Discussions](https://github.com/QuintonD/orchestrator-portal/discussions) | [Contributing](CONTRIBUTING.md)

Orchestrator is an open-source, local-first portal for following your AI assistants and their work. Review reports, inspect evidence, continue assistant conversations, and see which decisions need your attention from a browser or Android phone. Your connected runtimes retain execution authority.

**Status:** `main` contains **0.2.0-beta.2**, available to build from source. The latest published downloads are **0.1.0-alpha.2** for Windows, macOS, Linux, and Android. Beta features shown here are not all available in those alpha downloads. There is no stable release yet.

## Start here

| Your goal | Start with |
| --- | --- |
| Try a download without installing developer tools | [Alpha downloads](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.2) and [desktop setup](docs/desktop.md) |
| Explore the current beta with synthetic data | [Run the demo](#try-the-beta-demo) |
| Connect a phone to your gateway | [Android setup](docs/android.md) |
| Connect assistants or search your notes | [Adapter guide](docs/adapters.md) and [knowledge setup](docs/knowledge.md) |
| Understand beta features and limitations | [Beta guide](docs/beta.md), [personal workflows](docs/personal-workflows.md), and [validation](docs/personal-validation.md) |
| Ask a question or contribute | [Support](SUPPORT.md) and [contributor guide](CONTRIBUTING.md) |

OpenClaw, Hermes, custom harnesses, and connected knowledge stores remain authoritative. Orchestrator records whether an outcome was claimed, committed, observed, or verified; an assistant's response alone does not establish success.

![Orchestrator overview](docs/assets/overview-light.png)

## What is included

- A responsive, installable React interface with light and dark themes
- A customizable overview designed around exceptions and outcomes
- Assistant profiles with purpose, success criteria, provider mandates, and dispatch pause
- Reviewable reports, preserved revisions, and targeted corrections
- Bounded councils with independent assessments and a lead synthesis
- Persistent activity watches and scoped, revocable knowledge grants
- Direct assistant messaging with text attachments and explicit delivery receipts
- Project, routine, attention, usage, mail-summary, and provider-health views
- Guided connections with an immediate check and recoverable setup errors
- Full-text search over selected local documents, Obsidian vaults and Notion pages
- OpenClaw CLI, Hermes API, generic webhook and experimental gbrain adapters
- Guided Grok Bot handoffs and previewed manual result imports, preserved as claims
- Source-owned OpenClaw recurring briefs and deduplicated report import
- An editable context handoff to an independent T3 Code workspace
- An adapter SDK and stable shared contracts for other runtimes and knowledge stores
- Encrypted connector secrets and message content in a local SQLite database
- Passphrase authentication, HttpOnly sessions, CSRF protection, strict origins, CSP, rate limits, and an audit trail
- Bearer-key event ingestion for runtimes that push normalized events
- Server-sent updates without a cloud relay
- Docker and Tailscale Serve deployment paths
- No telemetry

The assistant channel carries the same operational context and evidence model into conversation:

![Orchestrator assistant channel](docs/assets/assistant-dark.png)

## Quick start

1. Download and extract the [desktop bundle](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.2) for your computer.
2. Open `Orchestrator.cmd` on Windows, `Orchestrator.command` on macOS, or `./orchestrator` on Linux. Keep the launcher running.
3. Create your workspace in the browser that opens. In **Connections**, start with a local folder or Obsidian vault; no AI account is needed to search your notes.

For Notion, connect a read-only internal integration and choose individual pages. For Grok Bot, prepare a task, copy it into Grok Bot and import the result after reviewing its preview. See [knowledge setup](docs/knowledge.md) and [Grok Bot handoffs](docs/grok-bot.md).

The portable alpha downloads are unsigned. Workspace data is stored separately from the program, so replacing the extracted program preserves your workspace. [Desktop setup](docs/desktop.md) covers launch warnings, diagnostics, upgrades and commands an agent can use.

### Run from source

Contributors need Node.js 24 or newer and Git:

```bash
git clone https://github.com/QuintonD/orchestrator-portal.git
cd orchestrator-portal
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4400`, create the first local workspace, then add a connection. The server binds to loopback by default.

### Try the beta demo

After cloning the repository and running `npm ci` as above:

```bash
npm run demo
```

Open `http://127.0.0.1:4425`. This builds the beta and starts a fresh, populated synthetic workspace, separate from your real gateway data. Stop it with Ctrl+C. The simulated decisions do not publish content or send external messages.

Demo mode is intentionally refused on non-loopback interfaces.

## How it fits

| Layer | Owns | Examples |
| --- | --- | --- |
| Orchestrator portal | Interaction, normalized signal, receipts, attention policy, layouts, audit | This project |
| Runtime adapter | Turns, task state, schedules, runtime health | OpenClaw CLI, webhook |
| Knowledge adapter | Search and source references | Local folders, Obsidian, Notion, gbrain CLI |
| Source system | Execution and source-of-truth policy | OpenClaw, custom agents, calendars, mail |

Assistant responses remain `claimed`; an ambiguous timeout is `unknown`. Source events preserve their reported states and evidence. A useful rating does not establish independent verification. The portal has no general-purpose independent verifier.

## Connecting OpenClaw

Choose **OpenClaw** in Connections. The adapter uses the installed `openclaw` executable and its documented CLI surface:

- `openclaw agent --message ... --json` for assistant turns
- `openclaw tasks list --json` for background work
- `openclaw cron list --all --json` for recurring tasks

This keeps the integration compatible with the installed runtime rather than binding the portal to a beta SDK. Orchestrator does not read `~/.openclaw` configuration or credentials directly.

## Private remote access

Tailscale Serve is the recommended remote path. Keep Orchestrator on loopback and proxy it inside your tailnet:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:4400
```

Add the resulting HTTPS origin to `ORCHESTRATOR_ALLOWED_ORIGINS`. Portal authentication remains required; tailnet membership is an additional boundary, not a replacement for app authentication. See [deployment](docs/deployment.md).

## Development

```bash
npm ci
npm run dev:demo
npm run check
npm run build
npm run test:e2e
```

See [Contributing](CONTRIBUTING.md) for prerequisites, validation, and the pull-request process. The repository is an npm-workspaces monorepo:

- `apps/server` — Fastify API, SQLite persistence, security, built-in adapters
- `apps/web` — React/Vite interface
- `packages/contracts` — validated public data contracts
- `packages/adapter-sdk` — provider capability interfaces
- `tests/e2e` — desktop and mobile browser coverage
- `research` — the research dossier that shaped the product boundaries

## Documentation

The [documentation index](docs/README.md) groups setup guides, integration references, validation records, and the complete research dossier.

- [Product direction and prototype refinement proposal](docs/product-direction.md)
- [Shared product vocabulary](CONTEXT.md)
- [Architecture and evidence model](docs/architecture.md)
- [Adapter authoring](docs/adapters.md)
- [Security and privacy model](docs/security.md)
- [Deployment and backup](docs/deployment.md)
- [Research synthesis](research/00-executive-synthesis.md)
- [High-level research gap review](research/11-high-level-gap-review.md)
- [Evaluation benchmark](research/10-evaluation-benchmark.md)

## Project status

This is pre-release software. Authentication, persistence, encryption, adapter boundaries, and automated tests are implemented, but live integration acceptance and operator evaluation remain incomplete. Read the [beta validation](docs/beta-validation.md) and [beta 2 validation](docs/personal-validation.md) for tested behavior and remaining limits. The [product direction](docs/product-direction.md) describes proposals, not a delivery commitment.

For help, use [Discussions](https://github.com/QuintonD/orchestrator-portal/discussions). Report reproducible defects through [Issues](https://github.com/QuintonD/orchestrator-portal/issues/new/choose) and vulnerabilities through the [security policy](SECURITY.md). Participation follows our [code of conduct](CODE_OF_CONDUCT.md).

Orchestrator is Apache-2.0 licensed. It contains no copied T3 Code implementation; T3 Code informed interaction and local-serving research only. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
