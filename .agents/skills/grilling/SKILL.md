---
name: grilling
description: Interview the user to stress-test a plan, design, or decision before action. Use when the user asks to be grilled, interviewed, challenged, or wants assumptions surfaced. Do not use for routine clarification or when the user has already supplied settled requirements.
metadata:
  author: "Matt Pocock; adapted for this template"
  source: "https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling"
---

# Grilling

Reach a shared understanding by walking a decision tree. Ask only questions whose
prerequisites are settled, then use each answer to expose the next useful branch.

## Before asking

Inspect the repository, existing documentation, configuration, and available
tools. Resolve factual questions yourself. Ask the user for decisions, priorities,
preferences, and context that cannot be discovered safely.

Do not reopen a settled choice unless new evidence contradicts it. Skip decisions
that are reversible, low-impact, or already implied by an explicit requirement.

## Run the interview

Maintain the design tree internally. Its frontier is the set of unresolved
decisions that no longer depend on another answer.

- Ask one question when the answer changes later branches.
- Ask up to three questions in a round only when they are independent and easy to
  answer together.
- Number every question and state why the decision matters.
- Give a recommended answer and the reason for it.
- When useful, give two to four choices on separate lines. Include a free-form
  escape route when the choices are not exhaustive.
- Let the user answer with a number, a choice label, "accept recommendations",
  "skip", or "park".

Use this shape:

```text
Q1. <short decision title>

<question and relevant constraints>

A. <choice>
B. <choice>

Recommendation: <choice and concise reason>
```

After each response, record the settled decision, recompute the frontier, and ask
the next useful question. If an answer exposes a contradiction, surface it before
continuing.

## Finish

The interview ends when the meaningful frontier is empty, not when every
theoretical edge case has been discussed. Recap:

- settled decisions;
- intentionally parked questions;
- important constraints and risks;
- the next logical action, without taking it.

Ask the user to confirm the shared understanding. Do not implement, create a spec,
or open tickets unless the user separately asks for that work after the interview.
