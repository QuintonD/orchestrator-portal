# Alpha setup and integration expansion

Confirmed 2026-09-05. The user accepted these recommendations after reviewing Grok Bot's documented integration limits.

## Deliverables

1. Downloadable desktop gateway bundles for Windows, macOS and Linux. Include Node and the built application, keep private data outside the application folder, provide launch and diagnostic commands, and document upgrades. External assistant runtimes remain separate installations.
2. Guided connections with plain-language instructions, an immediate connection check, recoverable errors and a clear path to the first useful result.
3. Obsidian vaults and local text folders, plus read-only Notion access restricted to explicitly selected pages. Preserve provenance and show incomplete indexing or lost access.
4. Grok Bot handoffs with editable task text and previewed, manually imported results. Imported reports are source claims. Automated Bot chat, control and Enterprise telemetry are outside this agreed increment.

## Acceptance evidence

- Native bundle smoke tests on Windows, macOS and Linux: extraction into a path with spaces, launch without system Node, authentication, restart persistence, shutdown, occupied ports and diagnostics.
- Server fixtures for source bounds, deletion, permissions, malformed responses, authentication, import replay and secret handling.
- Browser journeys at desktop and phone sizes for setup, connection recovery and Grok handoff through report review. Inspect screenshots in both themes and at larger text sizes.
- Android emulator regression and visual checks of the new flows. Publish a new testing distribution only after QA; store submission still requires the user's separate approval.
- Review the complete diff, obtain passing CI, open a PR and merge to main. Record actual platform coverage and any remaining limitations in the release notes.

Unsigned portable downloads are an alpha installation path. Signing and notarization, store privacy declarations and broader real-user usability testing remain release work; synthetic QA alone cannot establish usability for every user.
