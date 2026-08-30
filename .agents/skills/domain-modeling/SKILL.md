---
name: domain-modeling
description: Build or sharpen a project's shared vocabulary and record durable architectural decisions. Use when discussing domain terminology, editing CONTEXT.md, or creating or revisiting ADRs. Do not use merely to read existing context or write a feature specification.
metadata:
  author: "Matt Pocock; adapted for this template"
  source: "https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling"
---

# Domain modeling

Keep the project's language precise and durable. Challenge ambiguous terms,
stress-test relationships with concrete scenarios, and record only what future
contributors need to interpret the project correctly.

## Locate the context

Most projects use one root glossary:

```text
repo/
  CONTEXT.md
  docs/
    adr/
  src/
```

If `CONTEXT-MAP.md` exists, read it and update the context relevant to the current
topic. System-wide decisions belong in the root `docs/adr/`; context-specific
decisions belong with that context. If the correct context is genuinely ambiguous,
ask before writing.

Create files lazily. Do not create `CONTEXT.md` until the first term is confirmed,
or `docs/adr/` until the first qualifying decision is confirmed.

## Sharpen the model

- Compare the user's terminology with the existing glossary. Surface conflicts
  immediately.
- Replace vague or overloaded language with one canonical project term.
- Use concrete scenarios and edge cases to test boundaries between concepts.
- Check statements about current behavior against the code and documentation.
  Surface contradictions instead of silently choosing a version.
- Record a term as soon as the user confirms it. Follow
  [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` is a glossary, not a specification or scratchpad. Keep implementation
details, task status, API design, and general programming terms out of it.

## Record ADRs sparingly

Create or offer an architectural decision record only when all three conditions
hold:

1. Reversing the decision later would carry meaningful cost.
2. A future contributor would reasonably wonder why this choice was made.
3. The team chose between genuine alternatives for specific reasons.

If one condition is missing, do not create an ADR. Follow
[ADR-FORMAT.md](./ADR-FORMAT.md), scan existing numbers, and use the next sequence
number.

Confirm the term or decision with the user before writing it. This skill may edit
the glossary and ADRs in the current project when invoked for that purpose. It does
not authorize implementation, refactoring, ticket creation, or external changes.
