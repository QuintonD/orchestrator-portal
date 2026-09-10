# Skills in this template

Executable project skills live under `.agents/skills/`, the repository location
Codex scans. This top-level folder contains the human-facing maintenance material.

## Project skill map

| Skill | Source | Invocation | Purpose |
| --- | --- | --- | --- |
| [unslop](../.agents/skills/unslop/SKILL.md) | Pstack | Automatic when prose work matches, or `$unslop` | Tighten important prose without changing facts or voice. |
| [grill-with-docs](../.agents/skills/grill-with-docs/SKILL.md) | Matt Pocock | Explicit `$grill-with-docs` | Stress-test a project decision and retain the useful context; uses `grilling` and `domain-modeling`. |
| [grilling](../.agents/skills/grilling/SKILL.md) | Matt Pocock | Automatic when an interview is requested, or `$grilling` | Sequence decisions and expose assumptions. |
| [domain-modeling](../.agents/skills/domain-modeling/SKILL.md) | Matt Pocock | Automatic for active glossary or ADR work, or `$domain-modeling` | Maintain shared language and rare durable decisions. |
| [imagegen-2](../.agents/skills/imagegen-2/SKILL.md) | Project-authored | Explicit `$imagegen-2` | Codex CLI → GPT-5.6-Luna / low → installed `$imagegen` → verbatim image tool prompt. |

This table maps every repository skill. System and plugin skills are supplied by
the current Codex installation; inspect `/skills` for their live inventory rather
than copying versioned plugin paths into the repository. `imagegen-2` depends on
the installed OpenAI `imagegen` skill and built-in image tool. It does not replace
the general image skill or establish which image model the service uses.

Codex discovers these folders from the project root. `/skills` or `$` selects a
skill explicitly, including those with `allow_implicit_invocation: false`.
Restart Codex if a newly added skill does not appear. See the
[official skill documentation](https://developers.openai.com/codex/skills).

### Image workflow verification (2026-09-08)

On Windows with Codex CLI 0.153.3, a live `codex exec` probe recorded model
`gpt-5.6-luna`, effort `low`, and the exact image tool prompt:
`A small blue circle centered on a plain white background.` The tool generated
a PNG successfully. The recorded tool call, rather than the assistant's summary,
confirmed prompt equality. This verifies one direct handoff, not a universal
guarantee of verbatim behavior or the identity of the image backend.

An earlier read-only probe failed to launch shell reads with
`CreateProcessWithLogonW failed: 267`. Subsequent read-only shell probes succeeded
with both forward slashes and doubled backslashes; the original launch failure
could not be reproduced and its cause remains unconfirmed. No sandbox settings
were changed.

The full CLI skill test then exposed a guessed dependency path missing `.system`.
The skill now requires the catalog path or a checked system-skill location.
After that correction, a `codex exec -m gpt-5.6-luna
-c model_reasoning_effort=low -s workspace-write` session invoked `$imagegen-2`,
read both skill files and a UTF-8 prompt file, generated the image, and copied it
to `test-results/imagegen-cli/result.png`. The recorded image call preserved
`A small green triangle centered on a plain white background.` exactly.
Session: `01a07f4a-5e99-77f3-95b8-33b1925831ed`. One pre-call JavaScript attempt
used an unavailable `atob` function; its retry passed the literal prompt without
alteration. This verifies CLI invocation including shell reads and output saving;
the interactive `/skills` picker was not exercised.
All five project skills passed the skill-creator validator in Python UTF-8 mode;
the map covers every project skill. Application and Android tests do not apply
to these instruction-only changes.

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
