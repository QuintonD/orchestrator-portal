# Open-source and governance strategy

## Recommendation

License the core under **Apache License 2.0**, use the [Developer Certificate of Origin
1.1](https://developercertificate.org/) for contributions, and do not require a broad
copyright-assignment CLA.

Apache-2.0 preserves broad commercial and community use while adding an explicit patent grant and
termination terms. That is a good fit for an interoperability-heavy control plane likely to be
embedded by individuals, companies, runtime vendors, and managed-service providers. The DCO keeps
the contribution process legible without transferring contributor ownership.

This is a research recommendation, not yet a project decision.

## Repository policy set

The public repository should launch with:

- `LICENSE` — Apache-2.0 text.
- `NOTICE` — required notices and attribution carried from redistributed Apache-licensed work.
- `THIRD_PARTY_NOTICES.md` — dependency/source name, version or commit, license, source URL, what
  was copied or modified, and required attribution.
- SPDX identifiers in first-party source files and machine-readable SBOMs in releases.
- `CONTRIBUTING.md` — setup, tests, DCO sign-off, review expectations, compatibility policy.
- `GOVERNANCE.md` — maintainer roles, decision process, release authority, conflict resolution,
  and path to broader stewardship.
- `CODE_OF_CONDUCT.md` — Contributor Covenant or an equivalent standard.
- `SECURITY.md` — private reporting channel, supported versions, disclosure process, response
  targets, and threat-model scope.
- `TRADEMARKS.md` — code freedom separated from project name/logo rights.
- `TELEMETRY.md` — exact data fields, retention, destinations, opt-in controls, and how to verify
  that collection is off.
- A compatibility and deprecation policy for the canonical adapter/event protocol.

## Reuse boundaries

Licenses apply to copied or derivative code, not to abstract ideas. Record provenance before code
enters the tree and choose one of four treatments:

1. **Dependency:** consume the upstream package unchanged under its terms.
2. **Vendored or adapted source:** preserve notices, license headers, source/commit, modification
   record, and upstream security advisories.
3. **Protocol adapter:** interoperate across an API or separate process without copying source.
4. **Clean implementation:** implement documented behavior from specifications and keep design
   notes showing the independent source of requirements.

The adapter boundary is especially important for reciprocal and source-available systems:

| Project | Relevant license posture | Safe default |
| --- | --- | --- |
| [T3 Code](https://github.com/pingdotgg/t3code) | MIT | selective reuse is compatible with Apache-2.0 when notices are preserved |
| [OpenClaw](https://github.com/openclaw/openclaw) | MIT | dependency or adapter; retain upstream attribution for copied source |
| [OpenHands](https://github.com/OpenHands/OpenHands) | core MIT with separately licensed enterprise material | use only clearly MIT paths or integrate through a process/API boundary |
| [LangGraph](https://github.com/langchain-ai/langgraph) | MIT | dependency or adapter |
| [Home Assistant](https://github.com/home-assistant/core) | Apache-2.0 | compatible dependency or attributed reuse |
| [LibreChat](https://github.com/danny-avila/LibreChat) | MIT | dependency, adapter, or attributed reuse |
| [Plane](https://github.com/makeplane/plane) | AGPL-3.0 | separate-process/API adapter unless the intended combined-work license is reviewed |
| [Khoj](https://github.com/khoj-ai/khoj) | AGPL-3.0 | separate-process/API adapter |
| [n8n](https://github.com/n8n-io/n8n) | Sustainable Use License / fair-code terms | API adapter; do not vendor into the Apache core |
| [Langfuse](https://github.com/langfuse/langfuse) | mixed tree: MIT core plus separately licensed enterprise paths | consume only audited MIT packages or use its API |

This table is an engineering policy, not legal advice. Recheck the exact file-level license and
commit before every reuse decision.

## Plugin and adapter trust

The portal's extensibility layer is part of its security boundary. Each plugin or adapter should
ship a machine-readable manifest declaring:

- publisher identity and source URL;
- version, content hash, and optional signature;
- runtime and protocol compatibility;
- requested filesystem, network, secret, command, artifact, and UI capabilities;
- data collection and outbound destinations;
- isolation mode and whether it runs in-process;
- update channel and security contact.

Default to out-of-process adapters with least privilege. Installation and capability increases are
explicit user decisions. Updates that request new privileges should not inherit the previous
approval. A locally installed adapter remains usable without a marketplace account.

## Release and supply-chain baseline

- Reproducible or independently verifiable build instructions.
- Signed source tags and release artifacts.
- CycloneDX or SPDX SBOM for every binary/container release.
- Dependency pinning, automated vulnerability monitoring, and a published support window.
- Provenance attestations following [SLSA](https://slsa.dev/) where the build platform permits.
- Separate signing identities and permissions for CI, release maintainers, marketplace metadata,
  and hosted services.
- No release process should require sending private user data or agent traces to the project.

## Governance sequence

### Incubation

During the first working prototype, a small maintainer group can use documented rough consensus
with a named final decision maker. Architectural decision records should capture changes to the
event model, approval semantics, security boundary, and compatibility promises.

### Community formation

After external adapters or meaningful outside contributions appear:

- publish maintainer nomination and removal criteria;
- separate code ownership by subsystem;
- require two-person review for security-critical policy, authentication, update, and signing code;
- report financial sponsors and conflicts of interest;
- run public roadmap and compatibility discussions.

### Durable stewardship

If the project becomes infrastructure for multiple vendors, consider a neutral foundation or
fiscal host. Do not promise foundation transfer before a contributor community and real governance
load exist.

## Sustainable business boundary

A hosted business can coexist with an open control plane if user freedom is preserved:

- Open core capabilities: local operation, all canonical data, adapters, approvals, audit/replay,
  export/import, Tailscale/private-network serving, and plugin installation.
- Plausible paid services: managed encrypted sync, backups, relay, team administration, compliance
  exports, hosted updates, support, and enterprise identity integration.
- No intelligence tax: do not mark up the user's chosen model/runtime merely for passing through
  the portal.
- No hostage data: hosted state must be exportable in documented formats, and local operation must
  not require an online entitlement check.

## Telemetry and privacy

Telemetry should be off by default during research and explicitly opt-in in released builds. The
portal can measure product value locally and show the user the same metrics it computes. Any
external telemetry needs field-level documentation, short retention, deletion controls, and a
network-verifiable off switch. Prompts, outputs, filenames, artifacts, approval content, memory,
and destinations are excluded from default collection.

## Decision required before code import

Before adapting T3 Code or any other repository, record:

1. exact upstream repository and commit;
2. files or package consumed;
3. license and notice obligations at that commit;
4. whether the result is a dependency, copied derivative, protocol adapter, or independent work;
5. update/security ownership;
6. an exit path if the dependency changes license or becomes unmaintained.

That record should live beside the code as an ADR and be reflected in the third-party notice file.
