# Architecture

## Design boundary

Orchestrator is a control and interaction plane. It is not an execution runtime, universal database, or policy authority. A source system remains authoritative for work state and permissions; the portal normalizes that signal for one operator.

```text
Browser / installed web app
        │ HTTPS + session + CSRF
        ▼
Orchestrator API ─── SQLite ledger / encrypted vault
        │
        ├── Runtime adapters ───── OpenClaw / webhooks / custom harnesses
        ├── Knowledge adapters ─── Markdown / gbrain / future stores
        ├── Verifier adapters ──── source-native evidence
        └── Delivery adapters ──── optional push channels
```

The process is intentionally deployable as one Node service. SQLite WAL mode gives a single-operator installation transactional persistence without an external database. The contracts and adapter SDK are separate workspaces so a multi-process topology can be introduced without changing the public model.

## Evidence states

1. `accepted` — the portal persisted the request.
2. `committed` — the source runtime durably scheduled or recorded it.
3. `observed` — the source reported execution or a result.
4. `verified` — source-native evidence or a verifier confirmed the outcome.
5. `failed` — a known failure occurred.
6. `unknown` — the outcome cannot safely be inferred.

The portal may preserve or downgrade evidence; it must not promote a state without evidence. Provider status and estimated cost are labeled separately from verified business outcomes.

## Data ownership

| Data | Portal storage | Authority |
| --- | --- | --- |
| Connector configuration | AES-256-GCM encrypted | Portal operator |
| Conversation content | AES-256-GCM encrypted | Runtime plus portal receipt ledger |
| Normalized events and metrics | Plain SQLite rows | Source indicated on every row |
| Indexed knowledge text | Plain SQLite FTS index, opt-in | Referenced knowledge source |
| Dashboard layout and attention state | Plain SQLite rows | Portal operator |
| Passwords and ingest keys | scrypt or SHA-256 one-way values | Not recoverable |

Knowledge text is indexed in plaintext because SQLite FTS cannot search encrypted content. Connect only directories appropriate for the host’s disk-security boundary.

## Realtime and failure model

Runtime events can be pulled by adapter sync or pushed through `/api/ingest/events`. The portal emits a lightweight server-sent event after state changes. The event is a refresh hint; clients fetch canonical state from the API, so reconnects do not lose truth.

- The source runtime being unavailable degrades its connector without taking down the portal.
- A send failure is persisted as `failed`; an ambiguous disconnect must remain `unknown`.
- Connector secrets never appear in connector responses.
- Adapter sync is idempotent where the source supplies stable remote IDs.
- The SQLite database and encryption key must be backed up together.

The first release runs connector calls in the API process. Deploy one server replica per data directory. Horizontal replicas require an external queue and database and are outside this topology.
