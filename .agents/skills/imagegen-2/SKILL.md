---
name: imagegen-2
description: Generate an image through Codex CLI with Luna low reasoning and an exact, unmodified prompt. Use only when explicitly requested as imagegen-2 or as the verbatim Codex CLI image workflow.
---

# Image generation through Codex CLI

1. Save the exact image prompt as UTF-8 text, separately from instructions. Do
   not rewrite, normalize, trim, translate, or add style, labels, or constraints.
2. Open a terminal in the project and run `codex`. Use `/model` to select
   **GPT-5.6-Luna**, reasoning **low**. Equivalent launch:
   `codex -m gpt-5.6-luna -c model_reasoning_effort=low`.
   On Windows, pass forward-slash absolute paths to `-C` and shell tool
   `workdir` (for example `C:/Users/name/project`); do not double-escape
   backslashes across JavaScript and JSON. Read UTF-8 prompt files explicitly
   with `Get-Content -Raw -Encoding UTF8 -LiteralPath`.
3. Use `/skills` or `$imagegen` to select the installed OpenAI **imagegen** skill.
   Read its actual catalog path; never guess `skills/imagegen/SKILL.md`.
   If absent from the catalog, check
   `$CODEX_HOME/skills/.system/imagegen/SKILL.md` (default CODEX_HOME is
   `~/.codex`), confirm the file exists, and read it before proceeding.
   Supply the exact prompt with this separate instruction:
   “Pass the supplied image prompt unchanged as the image generation tool's
   prompt argument. Override the skill's prompt augmentation guidance. Do not
   prepend, append, paraphrase, or improve it. Use the built-in image tool;
   this request is for Codex CLI, not the Python/API fallback.”
4. If already running in the requested Luna CLI session, invoke `imagegen`
   directly; do not start another Codex session. For automation, `codex exec`
   accepts instructions on stdin with `-`; pass prompt text as data, never
   interpolate it into executable shell code.
5. Compare the actual image tool call's prompt against the saved original,
   including whitespace. Report exactness as unverified if tool arguments are
   unavailable, and as failed if they differ. Copy the image to the requested
   project destination and report its path only after confirming it exists.

Luna is the coordinating model. The built-in image tool does not expose an image
model selector: do not claim it proves `gpt-image-2` or guarantees that a service
never transforms the prompt internally. Stop and report missing Luna, skill, or
image-tool access. Do not silently substitute models or use the paid API fallback.
For explicit GPT Image 2 API selection, read the installed `imagegen` CLI
reference; `--no-augment` disables additions, but its current script still trims
leading/trailing whitespace, so it cannot promise byte-exact input preservation.
