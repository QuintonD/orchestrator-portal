# Presence field: reference baseline and current mark

The particle baseline below was superseded later on 9 September 2026 by the
owner's supplied main-assistant artwork. See [the motion suite](assistant-motion.md)
for the current implementation and validation. The linked Portal screenshots
now show the assistant rig with source-reported team counts; the original
layout and command entry remain. Study 02 adds idle motion, topology changes
and sound, as documented in the current motion suite.

The starting point is the Portal particle field in
[the original reference board](../../assets/invisible_os_agent_handoff/00_reference_direction.png)
and section 10 of the supplied implementation handoff. The design uses fine
stippling, sparse focal nodes and hairline rays. The original Portal proportions
and command entry are restored.

The previous orb implementations, controls, tests and exploration assets have
been removed from the application and design folder. A local recovery copy lives
under ignored `test-results/retired-presence-designs`; it is not part of the app.
The supplied reference assets and unrelated repository edits are preserved.

The earlier `PresenceField` used a deterministic SVG particle pattern grouped into three
paths. It is decorative, has no canvas loop and is static for idle, attention
and stale-source states. Only a pending source check moves the central field and
reveals additional links. Reduced motion, an offscreen element or a hidden
document pauses movement. Source text remains the authority for state; the
illustration does not claim to visualize actual agent relationships.

Validation on 9 September 2026:

- Web production build and TypeScript compilation passed.
- Presence-field and existing refinement browser suites: 22 passed on Chromium
  desktop and mobile emulation. Checks cover static idle states, source-check
  failure recovery, live reduced motion, viewport suspension, both themes,
  horizontal overflow and the existing command entry.
- Inspected the desktop and mobile screenshots against the supplied reference.
- Release identity check and diff whitespace check passed.
- Native Android and upgrade/release QA were not run for this unreleased UI reset.

[Desktop light](reference-presence/desktop-light.png),
[desktop dark](reference-presence/desktop-dark.png),
[mobile light](reference-presence/mobile-light.png),
[mobile dark](reference-presence/mobile-dark.png).
