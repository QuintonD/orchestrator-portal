# Adapter authoring

Adapters let Orchestrator remain independent of runtimes and knowledge stores. A connector advertises capabilities; the interface enables only workflows supported by those capabilities.

## Capability vocabulary

- `message.send`, `message.stream`
- `work.read`, `work.cancel`
- `schedule.read`
- `knowledge.search`, `knowledge.read`
- `usage.read`, `health.read`

The TypeScript interfaces live in `packages/adapter-sdk`. Public schemas live in `packages/contracts` and use Zod at trust boundaries.

```ts
import type { RuntimeAdapter } from "@orchestrator/adapter-sdk";

export const adapter: RuntimeAdapter = {
  manifest: {
    id: "example-runtime",
    displayName: "Example Runtime",
    version: "1.0.0",
    capabilities: ["message.send", "work.read", "health.read"],
  },
  async sendMessage(context, body) {
    return { state: "observed", reply: "Runtime reply" };
  },
  async sync(context) {
    return { status: "connected", latencyMs: 42, events: [] };
  },
};
```

Adapters must set bounded timeouts and response-size limits, avoid shell interpolation, preserve source IDs, return `unknown` when a result is ambiguous, redact credentials, omit hidden chain-of-thought, and document whether capabilities mutate source state.

## Push integration

Create an ingest key in Settings and send a normalized event:

```bash
curl -X POST http://127.0.0.1:4400/api/ingest/events \
  -H "Authorization: Bearer opk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "source": "my-runtime",
    "kind": "work.completed",
    "title": "Weekly review prepared",
    "summary": "The report is available at the source.",
    "status": "observed",
    "metadata": { "remoteId": "task-42" }
  }'
```

The key is shown once and stored as a hash. Use HTTPS when the caller is not on the same host.

## Knowledge adapters

The built-in Markdown adapter indexes `.md`, `.mdx`, `.txt`, and `.json` files. It ignores hidden entries, symlinks, files larger than 2 MiB, and collections beyond 10,000 files per sync. Results retain source and URI metadata. The index is read-only; Orchestrator never writes to the knowledge directory.
