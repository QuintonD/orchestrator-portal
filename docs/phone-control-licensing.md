# Phone Control licensing

Date: 12 September 2026. The user requested strong credit protection for reuse.

## Scope

| Material | License |
| --- | --- |
| Existing portal and its new HTTP/UI integration | Existing Apache-2.0 |
| Original `components/phone-control/` broker, CLI, tests and docs | AGPL-3.0-only, with attribution term in that directory |
| Original `apps/phone-android/` companion, tests and docs | AGPL-3.0-only, with attribution term in that directory |
| `scripts/phone-control-upgrade-build.mjs` and owner tooling, tests and evaluation fixtures under `tests/phone-control/` carrying an AGPL SPDX header | AGPL-3.0-only, with the referenced `components/phone-control/ATTRIBUTION.md` term |
| Other repository tooling and fixtures without that AGPL designation, including `scripts/phone-android-build.mjs` and `scripts/phone-control-license-check.mjs` | Existing Apache-2.0 |
| Third-party build tools, dependencies, imported material | Their own licenses and notices |

Each component includes the complete GNU license, NOTICE and ATTRIBUTION.md.
Original source headers must identify AGPL-3.0-only and the additional term.
The existing portal's Apache grants are not revoked or retroactively replaced.
Do not claim sole ownership of others' contributions or third-party code.

The attribution names **Orchestrator Phone Control** and the **Orchestrator
contributors**, and links to the project's source repository. Copyright holders
remain the actual authors; repository ownership is not a copyright assignment.

## What these terms do

AGPL covers distribution of covered versions and, under section 13, requires a
modified network-facing version to offer its corresponding source to remote
users. Section 7(b) permits reasonable attribution-preservation terms. The
included term preserves legal credit without adding advertising, compulsory
logos, endorsement, telemetry or a network licence check. Keep the project's
existing legal/about notices visible and include them in binary distributions.
[GNU AGPL text](https://www.gnu.org/licenses/agpl-3.0.html)

This does not guarantee public credit for every private use, cover independently
implemented ideas, or automatically require every unrelated application that
talks to the broker to adopt AGPL. A process boundary is an architectural
separation, not a blanket legal exemption for a combined derivative work.
Review actual copying, linkage and interaction before distributing combinations.
[GNU licence FAQ](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)

Apache-2.0 remains useful for the portal's broad adapter ecosystem. Its notice
preservation conditions apply on redistribution, but adding a NOTICE cannot turn
them into an obligatory product badge or new licence restrictions.
[Apache-2.0, section 4](https://www.apache.org/licenses/LICENSE-2.0)

## Contributor and release checks

1. Contributions to the two component directories and the explicitly designated
   AGPL owner tooling and fixtures above use their component licence and
   attribution term, with the repository's DCO sign-off. Other contributions
   retain the repository's Apache terms. A DCO is not a copyright transfer.
2. Package LICENSE, NOTICE and ATTRIBUTION.md with every broker archive and APK.
   Include corresponding source, build instructions, pinned dependencies and
   the exact released revision. A link to a changing branch is insufficient to
   identify the source corresponding to a particular binary.
3. Show project origin, licence, warranty notice and the appropriate source link
   in native legal information and CLI legal output. Preserve third-party
   attributions and publish an SBOM before a distribution is approved.
4. Audit new dependencies and copied files before inclusion. No source from
   scrcpy, Appium, AndroidWorld or other reference projects is implicitly imported
   by citing their documentation.
5. Review licence compliance, source availability, attribution visibility and
   distribution compatibility as a release gate. Commercial dual licensing is
   not established here: it would require rights from all relevant holders.

The full licence text was retrieved from GNU's official `agpl-3.0.txt`. Maintain
the canonical text unchanged; keep the section 7(b) term in its separate file.
