# Deployment

## Native process

```bash
npm ci
npm run build
ORCHESTRATOR_MASTER_KEY="$(openssl rand -base64 32)" npm start
```

The supplied key must decode to exactly 32 bytes. Store it in an OS secret manager, systemd credential, or container secret. If omitted on loopback, Orchestrator creates `master.key` next to the database.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ORCHESTRATOR_HOST` | `127.0.0.1` | Listen address |
| `ORCHESTRATOR_PORT` | `4400` | Listen port |
| `ORCHESTRATOR_DATA_DIR` | `./data` | SQLite database and local key |
| `ORCHESTRATOR_MASTER_KEY` | local generated key | Base64-encoded 32-byte encryption key |
| `ORCHESTRATOR_ALLOWED_ORIGINS` | local HTTP origins | Comma-separated browser origins |
| `ORCHESTRATOR_TRUST_PROXY` | `loopback` | Comma-separated trusted proxy ranges |
| `ORCHESTRATOR_DEMO` | off | Loopback-only representative data and auth bypass |
| `LOG_LEVEL` | `info` | Server log level |

## Docker Compose

Create a `.env` with a master key, then run `docker compose up -d --build`. The provided compose file publishes only on host loopback and persists `/data`. Mount knowledge directories read-only before configuring a Markdown connector.

The OpenClaw CLI adapter expects an `openclaw` executable on the same host as Orchestrator. For Docker deployments, use a webhook connector or build a trusted image that includes the compatible OpenClaw CLI and its configuration mount.

## Tailscale Serve

Complete first-run setup from the local URL, then expose the loopback service:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:4400
tailscale serve status
```

Set the exact HTTPS URL as an allowed origin and restart Orchestrator:

```text
ORCHESTRATOR_ALLOWED_ORIGINS=http://127.0.0.1:4400,https://portal.example-tailnet.ts.net
```

Use tailnet ACLs or grants to restrict which users and devices can reach the node. App authentication still applies. Do not use Tailscale Funnel for a private assistant portal.

## Backup and restore

Pause writes or stop the service, then back up the entire data directory. Preserve `orchestrator.db`, its WAL/SHM files if present during a live copy, and `master.key` or the external master-key secret.

The database is not useful without the same master key. Test restores periodically on another private host.

## Health and operations

- `GET /healthz` is unauthenticated and contains no private data.
- Request logs intentionally omit request bodies.
- Use one server replica per data directory.
- Run `npm run check` and `npm run test:e2e` before upgrading.
