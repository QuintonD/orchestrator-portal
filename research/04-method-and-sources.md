# Research method and source register

## Scope and date

This research snapshot was completed on 28 August 2026. It addresses product category, users,
human oversight, information architecture, implementation boundary, security/failure modes,
interoperability, open-source governance, T3 Code reuse, validation, and the “AI brain” metaphor.

It is a decision dossier for a research phase, not a claim that the product has been validated or
implemented.

## A correction about STORM

[STORM](https://aclanthology.org/2024.naacl-long.347/) and
[Co-STORM](https://aclanthology.org/2024.emnlp-main.554/) come from Stanford's OVAL lab, not
Harvard. The useful transferable idea is not merely “ask many agents.” STORM uses perspective-guided
questions and retrieval-grounded synthesis; Co-STORM adds experts, a moderator that finds knowledge
gaps, a shared mind map, and human participation.

This project adapted that shape and widened the perspectives. It did not reproduce the published
system or claim its evaluation results.

## Research process

Thirteen Luna agents at extra-high reasoning were assigned isolated, source-grounded briefs in
successive concurrency-limited waves:

1. product and competitive landscape;
2. architecture, domain model, persistence, and security;
3. human factors, mixed initiative, calm technology, and oversight;
4. information architecture and multi-surface UX;
5. market timing and demand signals;
6. incident/failure forensics;
7. open-source licensing and governance;
8. current protocol and standards integration;
9. qualitative user/operator evidence;
10. a code-level T3 Code reuse audit;
11. a Co-STORM-style adversarial moderator/gap audit;
12. evaluation and benchmark design;
13. cross-runtime memory and “AI brain” modeling.

The primary synthesis then:

- reconciled overlapping findings rather than counting agent agreement as evidence;
- gave direct documentation, specifications, repositories, papers, advisories, and code precedence
  over product copy or commentary;
- recorded contradictions and kill criteria instead of smoothing them away;
- separated the long-term vision from the first falsifiable wedge;
- inspected a fixed T3 Code commit read-only rather than relying on its marketing surface;
- preserved source-runtime authority as the key architecture constraint.

Independent context reduces shared prompt anchoring, but it does not create true epistemic
independence: agents can still retrieve the same sources and inherit similar model priors. The
moderator pass therefore searched specifically for category overlap, impossible promises, and
disconfirming evidence.

## Evidence labels

The dossier implicitly uses four evidence classes:

- **Specification or code fact:** confirmed in an official specification, repository, source file,
  advisory, or maintainer documentation.
- **Empirical research:** a paper or published measurement with a described method.
- **Operator report:** an issue, forum post, or anecdote; useful for hypothesis generation, not
  prevalence.
- **Recommendation or inference:** the research team's proposed product/architecture decision.

Claims that affect security, protocol compatibility, licensing, or implementation were preferentially
grounded in primary sources. Fast-changing details should be reconfirmed at implementation time.

## Representative primary sources

The claim-level links throughout the dossier are the authoritative source trail. This register is a
curated index, not an exhaustive bibliography.

### Research architecture and human oversight

- [STORM, NAACL 2024](https://aclanthology.org/2024.naacl-long.347/)
- [Co-STORM, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.554/)
- [Stanford OVAL STORM repository](https://github.com/stanford-oval/storm)
- [Human Oversight of AI Agent Systems in Practice](https://arxiv.org/abs/2606.05391)
- [Anthropic: measuring agent autonomy](https://www.anthropic.com/research/measuring-agent-autonomy)
- [AgentGUI](https://arxiv.org/abs/2607.26300)
- [Microsoft Research Magentic-UI report](https://www.microsoft.com/en-us/research/publication/magentic-ui-report/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)

### Core products and runtimes

- [T3 Code repository](https://github.com/pingdotgg/t3code),
  [architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
  [remote model](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md),
  [remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md), and
  [permission modes](https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md)
- [OpenClaw repository](https://github.com/openclaw/openclaw),
  [tasks](https://docs.openclaw.ai/automation/tasks),
  [exec approvals](https://docs.openclaw.ai/tools/exec-approvals), and
  [security](https://docs.openclaw.ai/gateway/security)
- [OpenHands repository](https://github.com/OpenHands/OpenHands),
  [architecture](https://github.com/OpenHands/OpenHands/blob/main/docs/architecture.md), and
  [self-hosting security notes](https://github.com/OpenHands/OpenHands/blob/main/docs/SELF_HOSTING.md)
- [LangGraph repository](https://github.com/langchain-ai/langgraph),
  [interrupts](https://langchain-ai.github.io/langgraph/concepts/breakpoints/), and
  [event streaming](https://docs.langchain.com/oss/python/langgraph/event-streaming)
- [n8n repository](https://github.com/n8n-io/n8n) and
  [documentation](https://docs.n8n.io/)
- [Letta repository](https://github.com/letta-ai/letta)
- [Home Assistant](https://github.com/home-assistant/core)
- [LibreChat](https://github.com/danny-avila/LibreChat)
- [Agent Cockpit](https://github.com/agent-cockpit/agent-cockpit)
- [Flightdeck](https://github.com/flightdeckhq/flightdeck)
- [CoWork OS](https://github.com/CoWork-OS/CoWork-OS)

### Protocols and transport

- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28),
  [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
  [Tasks](https://modelcontextprotocol.io/extensions/tasks/overview),
  [Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation), and
  [Apps](https://modelcontextprotocol.io/extensions/apps/overview)
- [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/)
- [Agent Client Protocol](https://agentclientprotocol.com/protocol/overview)
- [AG-UI documentation](https://docs.ag-ui.com/) and
  [event model](https://docs.ag-ui.com/concepts/events)
- [A2UI repository](https://github.com/google/A2UI)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
- [OTLP specification](https://opentelemetry.io/docs/specs/otlp/)
- [CloudEvents specification](https://github.com/cloudevents/spec)
- [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
- [WHATWG server-sent events](https://html.spec.whatwg.org/dev/server-sent-events.html)
- [WebSocket RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)
- [SPIFFE specifications](https://spiffe.io/docs/latest/spiffe-specs/)
- [AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html)
- [W3C PROV data model](https://www.w3.org/TR/prov-dm/)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Web Push for iOS/iPadOS Home Screen apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Agentic Payment Protocol v0.2](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)

### Security and failure research

- [AgentDojo](https://arxiv.org/abs/2406.13352)
- [ConstraintRot](https://arxiv.org/abs/2606.22528)
- [AgentDoS, USENIX Security 2026](https://www.usenix.org/conference/usenixsecurity26/presentation/zhou-zhiyuan-agentdos)
- [MIT AI Agent Index](https://aiagentindex.mit.edu/)
- [MCP security policy](https://github.com/modelcontextprotocol/modelcontextprotocol/security)
- [OpenClaw GitHub security advisories](https://github.com/openclaw/openclaw/security/advisories)
- [SQLite WAL](https://www.sqlite.org/wal.html) and
  [transaction isolation](https://www.sqlite.org/isolation.html)

### Open-source and supply chain

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Developer Certificate of Origin 1.1](https://developercertificate.org/)
- [SPDX](https://spdx.dev/)
- [CycloneDX](https://cyclonedx.org/)
- [SLSA](https://slsa.dev/)
- [The Update Framework](https://theupdateframework.io/spec/)

### Regulation and affected-person rights

- [EU AI Act overview and current application timeline](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=en)
- [General Data Protection Regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)

## Limitations

- No original interviews, diary study, deposits, production telemetry, or controlled usability study
  has yet been completed.
- GitHub/community evidence is biased toward visible failures and technically engaged users.
- Product features, licenses, protocols, and vulnerabilities are moving quickly; this is a dated
  snapshot, not permanent truth.
- The T3 audit covered one fixed commit and static behavior. Runtime and security behavior still
  require a technical spike and adversarial tests.
- Normalizing heterogeneous runtime semantics may prove too lossy. The dossier intentionally leaves
  a source-native escape hatch, but that can reduce the promised portability.
- Open-source license guidance is not legal advice.
- The 30% attention/time improvement target is a proposed gate, not an observed result.

## What would upgrade the evidence

The next evidence tier is not another landscape scan. It is direct observation of 24–30 target
operators, a two-week event/attention diary, lifecycle probes against two candidate runtimes, a
metadata-only adapter spike, and a native-UI-versus-portal experiment with seeded faults. The
[validation plan](./08-user-evidence-and-validation.md) defines those gates.
