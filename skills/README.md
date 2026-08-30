# Skills in this template

Executable project skills live under `.agents/skills/`, the repository location
Codex scans. This top-level folder contains the human-facing maintenance material.

## Adopted set

| Skill | Source | Invocation | Purpose |
| --- | --- | --- | --- |
| `unslop` | Pstack | Automatic when prose work matches, or `$unslop` | Tighten important prose without changing facts or voice. |
| `grill-with-docs` | Matt Pocock | Explicit `$grill-with-docs` | Stress-test a project decision and retain the useful context. |
| `grilling` | Matt Pocock | Automatic when an interview is requested | Sequence decisions and expose assumptions. |
| `domain-modeling` | Matt Pocock | Automatic for active glossary or ADR work | Maintain shared language and rare durable decisions. |

Start with [ADOPTION.md](ADOPTION.md). Source pins and licences are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Add another skill

Use this structure:

```text
.agents/skills/
  skill-name/
    SKILL.md
    agents/openai.yaml  # Optional UI and invocation policy
    scripts/            # Optional deterministic automation
    references/         # Optional supporting instructions
    assets/             # Optional output material
```

Every `SKILL.md` needs a lowercase hyphenated `name` and a precise `description`
that says when the skill should and should not trigger. Keep instructions concise.
Add supporting files only when the workflow uses them.

Validate a new or edited skill with the installed skill creator's
`quick_validate.py` script before relying on it.
