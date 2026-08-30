# Brain and memory model

## Product conclusion

“Portal to your AI brain” is a compelling metaphor and a dangerous data model.

The portal should be a read-mostly observability and correction layer over runtime-native memory. It
should not initially become a global identity resolver, canonical personal-memory store, autonomous
memory writer, or hidden cross-agent profile.

The honest promise is:

> Show what each assistant may know, use, remember, intend, or act on; show where it came from and
> whether it is stale or contested; let the user correct the portal and explicitly request supported
> runtime changes.

## Existing memory systems are not equivalent

- [Letta/MemGPT](https://docs.letta.com/v1-sdk/concepts/stateful-agents) persists agent state that
  includes messages, tool calls, prompts, memory blocks, and other context. Its
  [memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks),
  [archival memory](https://docs.letta.com/v1-sdk/memory/archival-memory/), files, external RAG, and
  conversation search have different mutability and retrieval semantics.
- [OpenClaw memory](https://docs.openclaw.ai/concepts/memory) uses human-readable workspace files as
  canonical memory and SQLite as a derived search index. Its
  [memory architecture](https://docs.openclaw.ai/concepts/memory-architecture) separates
  instructions, curated profile memory, episodic notes, standing intents, and review material;
  [provenance/forgetting](https://docs.openclaw.ai/concepts/memory-provenance) explicitly cannot
  guarantee removal from every transcript, backup, export, other agent, or paraphrase.
- [LangGraph memory](https://docs.langchain.com/oss/python/concepts/memory) separates thread/checkpoint
  state from namespaced long-term stores. Semantic facts, episodic experience, and procedural rules
  are concepts rather than a universal authority/provenance model.
- [ChatGPT memory controls](https://help.openai.com/en/articles/8590148-memory-and-controls-faq)
  expose saved memories and past-chat personalization, with separate custom instructions,
  [project memory](https://help.openai.com/en/articles/10169521-projects-in-chatgpt), and temporary
  chat. Product-visible summaries are not exhaustive, and deleting a conversation is not identical
  to deleting a saved memory.

These systems differ in authority, scope, visibility, retention, deletion, and ability to affect
behavior. A merged screen must never imply a merged source of truth.

## Object taxonomy

| Object | Meaning | Typical examples |
| --- | --- | --- |
| Observation or episode | immutable event or source reference | message, tool result, meeting, file span |
| Claim or fact | assertion about a person, project, world, or event | “supplier uses EUR invoices” |
| Preference or constraint | directive or inferred preference with scope and validity | tone, working hours, forbidden destination |
| Goal or aspiration | desired outcome, not authority to execute | “move house in October” |
| Plan or task | proposed or committed steps, dependencies, owner, state | research trip, renew insurance |
| Commitment or standing intent | future action conditioned on an event | “when invoice arrives, prepare approval” |
| Procedure, policy, or authority | instruction, skill, standing order, or permission | system prompt, filesystem allowlist |
| Identity or profile | authenticated principal or self-declared/agent-derived persona | owner account, agent role |
| Entity/project/relationship context | the scope an object concerns | client, household, repository |
| Retrieval artifact | derived search material | chunk, embedding, rank, cache |
| Summary, reflection, or dream | model-generated synthesis | weekly profile review |
| Correction, supersession, or tombstone | explicit history that marks something wrong/replaced/blocked | “old address is no longer valid” |

## Authority rules

1. Runtime-native state remains canonical for that runtime's behavior and execution.
2. Portal annotations are local until the user explicitly asks to apply them and the adapter returns
   a committed receipt.
3. Evidence outranks synthesis. A summary is never more authoritative than its linked sources.
4. Authenticated principal identifiers outrank display names and conversational self-assertions.
5. Contradictions remain visible. Do not silently choose the newest, most frequent, or
   highest-confidence claim.
6. An explicit user correction may supersede an older claim while preserving lineage.
7. Private memory never crosses runtime/agent scopes merely because the portal can index both.
8. Embeddings, summaries, ranks, caches, and search indexes are rebuildable projections.
9. Export/import is a snapshot, not live federation.
10. Unsupported read, write, delete, or evidence capability is shown as unsupported, never
    simulated.

## UX: a per-runtime brain map

Use five plainly named sections:

- **May influence replies:** current profile memory, context, system/user instructions.
- **Searchable history:** episodes, archives, transcripts, files, and derived indexes.
- **May trigger actions:** tasks, standing intents, schedules, and automations.
- **Evidence and history:** sources, revisions, supersession, conflict, retrieval trace.
- **Unavailable or blocked:** unsupported APIs, private scopes, stale indexes, disconnected sources.

Every card carries explicit state badges such as `canonical`, `derived`, `inferred`, `unverified`,
`stale`, `conflicted`, `redacted`, or `blocked`. A runtime-provided summary gets a persistent “not
exhaustive” label.

The detail view shows:

- source runtime, native object/revision, actor/channel, time, and deep-link;
- scope and access boundary;
- why the object was retrieved or used, when available;
- supporting, contradicting, and superseding evidence;
- indexed time versus source revision;
- retention and deletion capabilities;
- whether the object can actually influence runtime behavior.

### Correction and forgetting

- **This is wrong:** append a portal correction and supersede the prior claim.
- **Do not use or mention:** append a deny/tombstone record; optionally propose a runtime mutation.
- **Delete everywhere supported:** first show a dry-run impact and coverage report.

A deletion report distinguishes:

- removed from portal index;
- removed from portal-derived caches/embeddings/summaries;
- removed from the runtime;
- blocked from future ingestion;
- prevented from future use;
- unresolved copies in transcripts, backups, exports, or other agents.

Keep minimal deletion audit metadata—object ID, actor, time, reason, result—not the deleted content.

## Privacy and retention

Default to local, scoped, metadata-first indexing. Do not copy raw transcripts automatically. Do not
embed credentials, tokens, private tool output, or sensitive exact values into searchable text.
Recent research such as [AMP](https://proceedings.mlr.press/v317/wu26a.html) and
[SP-Mem](https://arxiv.org/abs/2608.16551) motivates redaction at rest and purpose-bound hydration
of exact protected values.

Each adapter independently declares:

```text
read
search
source_evidence
version_history
propose_write
commit_write
delete_source
delete_derived
tombstone
sensitive_value_hydration
```

No background process silently broadens a source's scope, retention, sharing, or write capability.

## Failure modes

- **False memory or unverifiable summary:** require evidence, inference labels, and abstention.
- **Stale preference:** validity windows, review dates, supersession, and visible conflicts.
  [HorizonBench](https://arxiv.org/abs/2604.17283) and
  [PrefEval](https://arxiv.org/abs/2502.09597) specifically examine temporal preference failures.
- **Memory poisoning:** untrusted content cannot promote itself to trusted memory.
  [MINJA](https://papers.nips.cc/paper_files/paper/2025/file/42a97bbd9844d2bf68596730af80bcdf-Paper-Conference.pdf)
  demonstrates query-only attacks that induce malicious memory.
- **Secret leakage:** redact before indexing; separate searchable reference from protected value.
- **Surveillance and creepiness:** opt-in sources, scope visibility, “why used,” and no invisible
  cross-agent aggregation. Memory can violate user expectations even when technically disclosed.
- **Cross-user leakage:** namespace by authenticated principal, never display-name similarity.
- **Unexpected side effect:** runtime mutations remain explicit proposals with committed receipts.
- **Race/last-write loss:** use native revisions and optimistic concurrency; surface conflict.
- **Overactive standing intent:** require scope, expiry, cooldown, cancellation, and fire budget.
- **False completeness:** keep coverage, freshness, unavailable sources, and unsupported operations
  visible.

## Normalized read schema

```json
{
  "id": "portal:uuid",
  "kind": "observation|claim|preference|goal|plan|task|commitment|procedure|identity|relationship|summary|retrieval|correction|tombstone",
  "subject": { "principalId": "...", "entityId": "..." },
  "predicate": "prefers",
  "value": "...",
  "status": "candidate|active|superseded|conflicted|completed|cancelled|expired|deleted|blocked",
  "authority": "user|runtime|developer|agent|external|unknown",
  "scope": {
    "userId": "...",
    "agentId": "...",
    "projectId": "...",
    "visibility": "private"
  },
  "evidence": [{
    "runtime": "openclaw",
    "nativeId": "...",
    "nativeRevision": "...",
    "locator": "...",
    "actor": "...",
    "observedAt": "...",
    "quoteHash": "...",
    "redaction": "partial"
  }],
  "validTime": { "from": "...", "to": "...", "reviewAt": "..." },
  "provenance": {
    "sourceKind": "explicit_user|runtime_state|agent_derived|external|system",
    "sourceIds": ["..."],
    "method": "verbatim|structured|model_summary|embedding",
    "model": "...",
    "createdAt": "..."
  },
  "confidence": { "value": null, "basis": "explicit|corroborated|inferred|unknown" },
  "supersedes": [],
  "contradicts": [],
  "retention": { "expiresAt": null, "policy": "..." },
  "freshness": {
    "indexedAt": "...",
    "sourceRevision": "...",
    "state": "fresh|stale|unavailable"
  },
  "canonical": { "runtime": "openclaw", "nativeId": "..." },
  "derivation": { "summaryOf": [], "transform": "..." }
}
```

The schema is a projection contract. The `value` may be a protected reference rather than copied
content, and the source-native record remains authoritative.

## MVP and later

### First proof

- read-only local view with an explicit runtime selector;
- one or two adapters with genuinely inspectable memory state;
- observations, claims, preferences, goals, tasks, intents, identity, and corrections;
- sanitized metadata/text index with no automatic cross-runtime merge;
- source links, evidence, freshness, and retrieval traces where supported;
- portal-local correction events;
- dry-run forgetting with a coverage/capability report;
- strict user/agent/project scope isolation and a local audit trail.

### Later, only after validation

- confirmed two-way mutation with revision-bound receipts;
- richer provenance/contradiction graphs;
- protected-value vault and purpose-bound hydration;
- structured conflict-resolution workflow;
- a shared capability profile for memory adapters.

Avoid initially: autonomous memory writing, global person resolution, invisible embeddings, broad
transcript ingestion, automatic execution, or claims of complete deletion.

## Falsifiable tests

- source-finding time improves by at least 30% over the native runtime view;
- at least 90% of test users distinguish source-backed facts from inferred summaries;
- explicitly corrected preferences are selected stale in at most 5% of seeded cases;
- deletion never claims success for unsupported copies and removes every supported derived object
  from retrieval;
- zero cross-user, cross-agent, or private-channel leakage under adversarial tests;
- untrusted source text saying “remember this” is never promoted to trusted memory;
- portal-local edits never change runtime behavior without explicit commit and receipt;
- standing-intent evaluation measures precision, recall, false alarms, and cancellation success;
- users can accurately describe which sources are absent or incomplete.

[CoALA](https://arxiv.org/abs/2309.02427) provides a useful separation between memory modules,
decision procedures, and the external world. [LongMemEval](https://arxiv.org/abs/2410.10813)
provides relevant tasks for extraction, temporal reasoning, updates, and abstention.
