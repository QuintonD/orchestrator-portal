# Agent Instructions

This file defines the default working agreement for AI agents and human
contributors in this repository. More specific `AGENTS.md` files may be added in
subdirectories; their instructions supplement or override this file within that
subtree.

## Project context

- **Purpose:** Build an open-source, local-first portal for monitoring and safely
  interacting with AI assistants and the work they perform. The portal is an
  attention, evidence, and correction layer, not another agent runtime.
- **Users:** Initially, technical operators running at least two local or remote
  assistant runtimes who need low-overhead exception handling and trustworthy
  outcome history.
- **Key constraints:** Source runtimes retain execution authority. Begin with a
  read-only, metadata-minimized proof; distinguish claimed, committed, observed,
  and verified outcomes; preserve source-native semantics and affected-party
  authority; require explicit security gates before command forwarding, remote
  approval, or consequential-domain actions.
- **Source of truth:** Start with `research/00-executive-synthesis.md`,
  `research/03-architecture-security.md`, `research/05-interoperability.md`,
  `research/10-evaluation-benchmark.md`, and
  `research/11-high-level-gap-review.md`. `README.md` indexes the complete dated
  research dossier.

## Working principles

- Understand the existing project before making changes.
- Make the smallest coherent change that fully addresses the request.
- Preserve existing behavior unless the task explicitly changes it.
- Prefer clear, maintainable solutions over clever ones.
- State assumptions when requirements or project context are incomplete.
- Do not invent APIs, files, test results, or external facts.
- Never expose secrets, credentials, private data, or sensitive logs.

## Before changing code

1. Read the relevant documentation, configuration, and nearby implementation.
2. Check the working tree and preserve unrelated user changes.
3. Identify the appropriate validation commands and project conventions.
4. Ask for clarification only when a safe, reasonable assumption would materially
   change the outcome.

## Implementation

- Follow the language, framework, formatting, and naming conventions already in
  use.
- Keep modules focused and public interfaces explicit.
- Validate inputs at system boundaries and handle errors deliberately.
- Avoid new dependencies unless they provide clear value; document why they are
  needed.
- Update documentation, examples, configuration, and migrations when behavior
  changes.
- Treat generated files as generated: change their source and regenerate them.

## AI-specific guidance

- Keep prompts, model settings, tools, and output schemas versioned when they
  affect product behavior.
- Use structured outputs for machine-consumed responses where practical.
- Treat model output as untrusted input; validate it before executing actions or
  persisting data.
- Make model choice, token limits, retries, timeouts, and fallbacks explicit.
- Protect against prompt injection when processing external or user-provided
  content.
- Do not send confidential data to external models or services without explicit
  authorization.
- For behavior changes, add representative evaluations or fixtures, including
  failure and adversarial cases where relevant.

## Testing and verification

- The application remains **alpha**. Use `0.1.0-alpha.N` for distributions until
  the owner explicitly approves a stage change. Run `npm run release:check` and
  follow `docs/releases.md` for matching desktop/Android assets and in-place
  upgrade verification. Historical beta-labelled records are evidence, not an
  approved promotion; preserve their tags, assets and stored identifiers.

- Add or update tests for changed behavior.
- Run the narrowest relevant checks first, then broader checks when warranted.
- Do not claim a command passed unless it was actually run successfully.
- If a check cannot be run, explain what remains unverified and why.
- Review the final diff for accidental edits, secrets, debug output, and stale
  documentation.

## Communication

- Lead with the outcome and mention important tradeoffs or risks.
- Summarize changed files and verification performed.
- Use concise comments to explain intent or non-obvious constraints, not syntax.
- Record durable project knowledge in the repository rather than leaving it only
  in chat history.

## Project-local skills

Discoverable workflows belong in `.agents/skills/<skill-name>/`. Each skill should
be narrow, actionable, and self-contained. See `skills/README.md` for structure,
adoption notes, and third-party provenance.

- Use a skill when the request matches its description or the user invokes it with
  `$skill-name`.
- Keep explicit-only skills explicit. In this template, `grill-with-docs` must not
  start unless the user asks for that interview and its documentation changes.
- Read an existing `CONTEXT.md` for project vocabulary when relevant. Editing the
  glossary is active domain-modeling work and should follow that skill.
- Treat adapted third-party skills as maintained local code. Compare upstream
  changes and merge them deliberately instead of overwriting local behavior.
