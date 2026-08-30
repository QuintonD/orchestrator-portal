---
name: grill-with-docs
description: Stress-test a project plan or design through an interview while capturing confirmed vocabulary in CONTEXT.md and rare, durable decisions as ADRs. Use only when the user explicitly invokes grill-with-docs or asks for both a design interview and persistent project documentation.
metadata:
  author: "Matt Pocock; adapted for this template"
  source: "https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs"
---

# Grill with docs

Run the `grilling` and `domain-modeling` disciplines together. Before starting,
read both sibling skills in full:

- [grilling](../grilling/SKILL.md)
- [domain-modeling](../domain-modeling/SKILL.md)

## Workflow

1. Read `AGENTS.md`, any `CONTEXT.md` or `CONTEXT-MAP.md`, existing ADRs, and the
   code or documents relevant to the topic.
2. State the topic and what this session will decide. Do not create empty
   documentation scaffolding.
3. Run the grilling interview. Investigate facts yourself and put material choices
   to the user.
4. When the user confirms a domain term, update the correct `CONTEXT.md` then.
5. When a confirmed decision meets every ADR threshold in `domain-modeling`, offer
   an ADR. Write it only after the user agrees that the decision is settled.
6. At the end, recap the decisions, documentation changed, open questions, and the
   recommended next action. Ask the user to confirm the shared understanding.

Invoking this skill authorizes the glossary and ADR edits described above inside
the current project. It does not authorize implementation, refactoring, specs,
tickets, commits, or external changes. Stop after the interview and its documents
unless the user separately requests the next action.

If the current directory is not safe to write, run the interview without edits and
return the proposed documentation as a draft.
