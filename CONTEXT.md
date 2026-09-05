# Orchestrator context

Orchestrator is a local-first portal to autonomous assistants and their work. This glossary captures confirmed product vocabulary; proposed scope and acceptance criteria live in the product direction document.

## Language

### Assistants and sources

**Portal**:
The user's interaction, attention, evidence, and correction surface across connected assistants and knowledge sources. Source runtimes retain execution authority.
_Avoid_: Agent runtime, replacement knowledge store

**Assistant**:
An agent with its own role, context, model configuration, and available tools, presented as an identifiable collaborator.

**Source runtime**:
The external system that executes assistant work and owns its native sessions, permissions, and execution state.

**Knowledge source**:
An existing store from which assistants and the portal retrieve authorized context with source references. gbrain is the default integration, not a required universal knowledge architecture.

**Lead orchestrator**:
The designated assistant responsible for coordinating other assistants for a piece of work. It runs in a source runtime, not in the portal.

**Council**:
A bounded collaboration in which assistants contribute different perspectives, context, or models to a hard question under a lead orchestrator.

### Presentation and attention

**Widget**:
A modular view of connected data, summaries, notifications, or work that a user or authorized assistant can configure within supported capabilities.

**Attention item**:
A source-linked matter surfaced because it needs the user's awareness, decision, or intervention.

**Watch**:
A user-configurable subscription to updates about a particular message, service, stream, or work context.

### Evidence

**Claimed outcome**:
A source's assertion about what its work achieved; the assertion alone does not establish the external result.

**Committed outcome**:
A result recorded as committed by the authoritative source, with that source's native meaning preserved.

**Observed outcome**:
A result supported by observation of the affected state, with the observer and freshness identified.

**Verified outcome**:
A result checked against explicit criteria using identified evidence; verification does not imply broader correctness beyond those criteria.
