# Orchestrator

Orchestrator is a private, local-first command centre for your AI assistant. It replaces the chat-feed view of an assistant with a calmer operating surface for conversations, active work, recurring tasks, decisions, knowledge, cost, project health, and verified outcomes.

The portal is deliberately **not** another agent runtime or knowledge store. OpenClaw, custom harnesses, Markdown vaults, and future providers remain authoritative. Orchestrator connects to them through capability-based adapters and records exactly what was accepted, committed, observed, or independently verified.

![Orchestrator overview](docs/assets/overview-light.png)

## What is included

- A responsive, installable React interface with light and dark themes
- A customizable overview designed around exceptions and outcomes
- Direct assistant messaging with explicit delivery receipts
- Project, routine, attention, usage, mail-summary, and provider-health views
- Full-text search over opt-in Markdown directories
- Built-in OpenClaw CLI, generic webhook, and Markdown directory adapters
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

Requirements: Node.js 24 or newer.

```bash
git clone https://github.com/QuintonD/orchestrator-portal.git
cd orchestrator-portal
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4400`, create the first local workspace, then add a connection. The server binds to loopback by default.

For a representative, non-production workspace:

```bash
npm run dev:demo
```

Demo mode is intentionally refused on non-loopback interfaces.

## How it fits

| Layer | Owns | Examples |
| --- | --- | --- |
| Orchestrator portal | Interaction, normalized signal, receipts, attention policy, layouts, audit | This project |
| Runtime adapter | Turns, task state, schedules, runtime health | OpenClaw CLI, webhook |
| Knowledge adapter | Search and source references | Markdown directory, future gbrain adapter |
| Source system | Execution and source-of-truth policy | OpenClaw, custom agents, calendars, mail |

Orchestrator never treats a provider claim as stronger evidence than it is. `accepted`, `committed`, `observed`, and `verified` are different states throughout the API and interface.

## Connecting OpenClaw

Choose **OpenClaw CLI** in Connections. The adapter uses the installed `openclaw` executable and its documented CLI surface:

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
npm install
npm run dev:demo
npm run check
npm run build
npm run test:e2e
```

The repository is an npm-workspaces monorepo:

- `apps/server` — Fastify API, SQLite persistence, security, built-in adapters
- `apps/web` — React/Vite interface
- `packages/contracts` — validated public data contracts
- `packages/adapter-sdk` — provider capability interfaces
- `tests/e2e` — desktop and mobile browser coverage
- `research` — the research dossier that shaped the product boundaries

## Documentation

- [Architecture and evidence model](docs/architecture.md)
- [Adapter authoring](docs/adapters.md)
- [Security and privacy model](docs/security.md)
- [Deployment and backup](docs/deployment.md)
- [Research synthesis](research/00-executive-synthesis.md)
- [High-level research gap review](research/11-high-level-gap-review.md)
- [Evaluation benchmark](research/10-evaluation-benchmark.md)

## Project status

Version `0.1.0` is a production-oriented first release: real authentication, persistence, encryption, adapter boundaries, deployment assets, automated tests, and desktop/mobile visual QA are present. It is still young software. Use the benchmark in `research/10-evaluation-benchmark.md` before entrusting it with irreversible actions, and keep source runtimes responsible for authorization and execution policy.

Orchestrator is Apache-2.0 licensed. It contains no copied T3 Code implementation; T3 Code informed interaction and local-serving research only. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
