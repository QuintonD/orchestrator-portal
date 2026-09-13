# Third-party notices

Runtime dependencies are installed from npm and retain their own licenses. Direct production dependencies include Fastify and its official plugins, React, Lucide, and Zod. Development dependencies include Vite, TypeScript, Vitest, and Playwright. `package-lock.json` is the authoritative dependency inventory.

No T3 Code, OpenClaw, Tailscale, or gbrain source code is copied into this repository. OpenClaw is accessed through its public CLI contract. Tailscale is an optional operator-managed reverse proxy. Product and project names belong to their respective owners.

Project-local Codex skills under `.agents/skills` retain the provenance documented in `skills/THIRD_PARTY_NOTICES.md` and are development aids, not runtime dependencies.

The separately licensed Phone Control broker and Android companion are original
project components. Their local `LICENSE`, `NOTICE` and `ATTRIBUTION.md` files
define their AGPL-3.0-only and attribution terms. The companion's Gradle wrapper
retains its upstream licence and build-tool notices; see its local third-party
notice file. Citing Android, OpenAI, scrcpy or AndroidWorld documentation does not
import those projects' source into this repository.

Release SBOM validation vendors the unchanged CycloneDX 1.5 JSON schemas under
`scripts/third-party/cyclonedx-1.5/`, licensed by their upstream contributors under
Apache-2.0. That directory includes the upstream license and exact source URLs
and digests in `PROVENANCE.md`. Ajv and ajv-formats validate these schemas as
release tooling and retain their own npm licenses.
