---
name: unslop
description: Edit or audit user-facing prose to remove machine-shaped writing while preserving meaning, facts, and voice. Use for requests to unslop, humanize, tighten, or polish documentation, READMEs, reports, emails, and release or pull-request text. Do not apply to code, structured data, verbatim quotations, or casual answers unless asked.
metadata:
  author: "Lauren Tan; adapted for this template"
  source: "https://github.com/cursor/plugins/tree/main/pstack/skills/unslop"
---

# Unslop

Produce direct, specific prose that sounds like a person wrote it. Preserve the
writer's position and technical meaning. Never invent opinions, experiences,
facts, measurements, sources, or confidence to make text feel more human.

## Choose the mode

- **Audit:** When the user asks for review or diagnosis, identify concrete tells
  and propose local fixes. Do not silently rewrite the whole document.
- **Rewrite:** When the user asks to edit, humanize, tighten, or unslop, revise the
  smallest scope that solves the problem.
- **Draft:** When creating new prose, write cleanly on the first pass and run the
  self-audit before returning it.

If the requested mode is unclear, preserve the original and provide a revised
version separately.

## Protect invariants

Keep the original meaning, stance, level of certainty, and intended audience.
Preserve code, commands, URLs, citations, identifiers, numbers, quoted text, and
required formatting unless the user explicitly asks to change them. Match the
document's existing spelling convention.

## Default voice for this template

- Lead with the outcome or point.
- Prefer plain, concrete words and short paragraphs.
- Vary sentence length naturally. Do not force every sentence to be short.
- Use contractions and first person when they fit the actual speaker.
- Keep useful technical terms. Remove jargon only when it obscures the point.
- Be confident where the evidence is strong and explicit where it is not.
- Keep structure proportional to the material. Not every answer needs headings or
  a three-part list.

## Patterns to fix

Treat these as signals, not a mechanical banned-word list.

- Canned openings, praise, chatbot pleasantries, and generic conclusions.
- Puffery, promotional adjectives, significance inflation, and unsupported
  claims.
- Vague attribution such as "experts say" without a named source.
- Filler, stacked hedges, weak verbs propped up by adverbs, and dense sentences.
- Stock AI vocabulary when a plainer word carries the same meaning.
- Forced groups of three, synonym cycling, false ranges, and "not just X, but Y"
  constructions.
- Repetitive sentence shapes and overly symmetrical paragraphs.
- Decorative emoji, excessive boldface, title-case headings, inline heading lists,
  and punctuation used as a crutch.
- Passive voice when naming the actor makes the sentence clearer.
- Abstract claims that could appear unchanged in any project's documentation.

Em dashes, colons, parentheses, and technical vocabulary are not forbidden. Keep
them when they are the clearest or most natural choice; remove repetitive or
affected use.

## Process

1. Identify the audience, purpose, and protected facts.
2. Mark the specific patterns that make the text feel generic or machine-shaped.
3. Rewrite at the smallest useful scope.
4. Read the result for cadence, specificity, and unintended meaning changes.
5. Ask: "What still makes this sound generated?" Fix only the remaining evidence.

Return the revised prose first. Mention material editorial choices afterward only
when the user needs them. Do not claim that the result is undetectable or written
by a human.
