# Product direction: a useful portal to autonomous assistants

Date: 2026-09-09

Status: confirmed direction for a competitive, feature-complete alpha; detailed implementation recommendations below are not claims of implemented capabilities. The first release is the broad alpha, not a separate narrow prototype or beta. The dated research dossier remains historical evidence; its read-only proof recommendation is not the user's current deliverable request.

## Product promise

Get useful assistants working for you, keep them improving, and stay in control without managing their setup all day.

The portal facilitates proactive assistance as well as interaction and reporting: it helps turn an unmet need into an operating assistant or workflow, then makes relevant work and results understandable across tools.

The portal should be useful across personal and professional work. Coding is an important integration and test case, not the definition of the product. Its value is reduced effort and better decisions, not the number of agents, widgets, or connectors displayed.

## Confirmed direction

- Major assistant platforms should be housed in one portal, with T3 Code as an integration-depth and engineering-quality benchmark. Existing subscriptions, supported APIs and user-configured CLI proxies are first-class access routes. This supplements the personal-assistant scope; it is not a claim of universal support today. See [platform coverage, delivery order and quality gates](assistant-platforms.md).
- Coding agents and general assistant services have equal priority from the first working integrations. Personal-agent services such as Muse Assistant are included in that first-wave scope; their supported access paths must be verified separately from model API access.
- A local-first, open-source portal over autonomous assistants and existing knowledge architectures. Source systems retain execution and knowledge authority.
- A usable assistant interaction surface and modular dashboard, with useful defaults and bounded assistant-driven customization saved to the user's profile.
- OpenClaw is the default, without lock-in; Hermes and collaboration between assistants are in scope. A lead assistant can convene different perspectives for hard topics.
- T3 Code is integrated as an independent work environment; the portal does not replace it. gbrain is the default knowledge integration.
- Users control which messages, services, and streams warrant updates. Optional depth should not overwhelm the default experience.
- The next deliverable is a competitive, feature-complete alpha, initially tested by the founder. It covers complete supported workflows for proactive setup, agent management, chat, project oversight, reporting, councils, knowledge, modular dashboards, and scoped connections. This does not mean universal integration support or every competitor feature. Single-person testing cannot establish general market demand or population-level efficacy.
- Proactive agent creation, guided setup, and ongoing improvement of agents, workflows, and integrations are core value, not optional dashboard enhancements. Model and provider choice must remain replaceable.
- The confirmed default is proactive action for low-risk, reversible work within a standing mandate, with the user retaining control and separately authorizing expanded access, spending limits, or external effects.
- Concrete unmet needs are oversight of numerous projects and an already-connected finance assistant that produces useful follow-up rather than remaining silent. User interaction and non-interaction should inform improvements.
- Optional portal-managed connections and permissions are included in the alpha, alongside native-runtime-managed connections; provider credentials remain on the user's private gateway.
- Hosting is user-managed, with an always-on desktop as the default arrangement. Managed hosting is a future option, not an alpha dependency.
- Autonomous work defaults to supported existing subscriptions or local models. Metered APIs require an explicit user-set spending limit; no silent paid fallback or overage is authorized. Subscription eligibility, quotas, and local capacity remain constraints, not guarantees of unlimited free execution.

## Proactive assistance: proposed operating model

The portal should help a source-hosted lead assistant discover unmet needs within authorized sources, activate suitable assistants or workflows, and review whether they are delivering value. Execution, scheduling, and assistant reasoning remain in capable source runtimes. The portal supplies guided setup, capability checks, policy controls, evidence, and feedback; this is a meaningful expansion beyond passive monitoring.

### From need to first useful result

1. Ask about the outcome the user wants and discover relevant existing agents and authorized sources before creating duplicates.
2. Reuse or create a focused assistant through supported runtime capabilities. Set its purpose, permitted data, expected outputs, cadence or trigger, budget, and review point using inspectable defaults.
3. Request only missing access or material decisions. Do not make the user assemble prompts, schedules, integrations, and reporting widgets by hand.
4. Produce a first useful result during setup where feasible, then show when the next result is expected and what could block it.
5. Track whether promised follow-up occurs. Distinguish nothing material changed, no work ran, unavailable data, failed delivery, and a user who did not open the report.

An assistant count is not an outcome. Prefer improving an existing assistant or routine when that meets the need with less cost and complexity.

### Bounded initiative, not approval on every step

Confirmed by the user: obtain a clear standing mandate once, then permit low-risk, reversible changes within its data scope, capabilities, and resource limits without repeated approval, including creating and improving agents using already-authorized data and providers within a shared spending limit. Let the user inspect recent autonomous changes, undo eligible changes, lock settings, and pause further dispatch. Report whether already-running work actually stopped; a portal pause is not a universal runtime cancellation guarantee.

Reversibility alone is insufficient: model spend cannot be recovered, a transmitted secret cannot be unshared, and an externally sent message can affect someone even if deleted. Require a separate grant for new data access, provider/model egress, increased budgets, expanded permissions, or consequential external effects. An agent must not broaden its own mandate or alter approval, audit, and safety controls through self-improvement.

### Improvement loop

- Use explicit corrections, repeated manual steps, missing expected outputs, and recurring failures to identify candidate improvements.
- Treat non-interaction as ambiguous evidence, not permission or proof of disinterest. A report may have been useful without a click, missed, delivered poorly, or unnecessary that day.
- Within the mandate, trial bounded changes to reporting cadence, prompts, routing, or widgets. Record the reason, version, affected scope, evaluation, and rollback path; prevent oscillating changes and unbounded agent proliferation.
- Validate integration/configuration changes before activation. Generated executable connector code and dependency changes need a separate review and test path, not the same permissions as a layout edit.
- Evaluate usefulness and missed-important-event rates rather than optimizing clicks, messages, or time in the app. Do not silently suppress safety-critical or explicitly watched updates based on inactivity.

### First concrete scenarios

**Project oversight:** with authorized project sources, identify active projects, existing owners and assistants, stale commitments, blockers, and missing reporting coverage. Establish an inspectable reporting routine and produce a source-linked cross-project brief with recommended next steps. Project priority changes or messages to other people require the applicable authority; discovering a repository does not grant access to every file or permission to act on it.

**Finance follow-through:** after explicit financial-data opt-in, help configure a read-only analyst with a reporting mandate. Surface spending patterns, budget drafts, missing inputs, and review questions; investment-related analysis must make its assumptions, data freshness, uncertainty, and suitability limits explicit. This is a product workflow, not financial advice or authorization to trade, transfer money, change accounts, or infer risk preferences from silence. Finance remains optional rather than a default data connection.

Both scenarios should reveal why an assistant has gone quiet and guide the user through the smallest intervention needed to restore useful service.

## Competitive implications

OpenClaw already provides persistent, agent-created session dashboards, layout controls, and permissioned widget capabilities. Reproducing those features supplies familiarity, but does not establish a distinct product advantage. The portal must earn its place through cross-source continuity and useful attention management. See [OpenClaw session dashboards](https://docs.openclaw.ai/web/dashboards).

The user confirmed [official Grok Bot](https://x.ai/bot) as the reference. Its product page presents role-based assistants, parallel work, shared-thread handoffs, persistent context, and teaching workflows that become routines. Its onboarding emphasizes outcomes, constraints, deliverables, and review points. These are documented product patterns, not independently tested performance claims. See [Grok Bot getting started](https://docs.x.ai/grok-bot/get-started).

Recommended adaptations for this portal:

- Present assistants by their useful role, current responsibility, and availability; expose model and runtime details on demand.
- Make collaboration and handoffs visible within the work conversation, while showing which assistant owns the next step.
- Provide a review loop from deliverable to correction to an explicitly saved preference or source-owned routine. Show where a lasting change is stored and whom it affects.
- Offer source-native computer takeover or inspection links where supported, rather than building another computer-use runtime.

Role-based assistants and handoffs are therefore reference-product expectations, not sufficient differentiation. The portal must make these workflows coherent across independently chosen runtimes and knowledge sources, with less noise and trustworthy evidence. Grok Bot remains a UX reference. The user subsequently approved guided task handoff and manual result import for the alpha; automated Bot control and Enterprise telemetry are outside this increment. See [the expansion plan](alpha-expansion-plan.md).

Use supported integration surfaces where available; OpenClaw documents an [external-app Gateway integration path](https://docs.openclaw.ai/gateway/external-apps). Documentation alone does not prove a particular installed version, permission configuration, or other runtime can support the same workflow.

## Recommended experience

Keep five questions easy to answer:

| User question | Default experience | Depth when needed |
| --- | --- | --- |
| What matters now? | Short brief of relevant changes, decisions, and commitments | Why shown, source, freshness, watch and priority controls |
| What are my assistants doing? | Work grouped by intended outcome, with owner and blockers | Native sessions, tools, dependencies, costs, and runtime health |
| What should I tell them? | Contextual conversation and clear handoff | Inspectable context, assistant selection, scope and review points |
| What did I get? | Deliverables and results ready to review | Artifacts, evidence, criteria, disagreement, and corrections |
| How should this work for me? | Natural-language customization with sensible defaults | Inspectable rules, widget revisions, permissions, and undo |

Start with a compact overview rather than displaying the entire default widget catalog at once. Offer deeper views for work, assistants, knowledge, and system health. Preserve the user's arrangement; automatic updates must not steal focus or continually rearrange the interface.

Hiding noise must not hide uncertainty. Missing data, stale sources, failed delivery, and unverified claims remain visible wherever they change the interpretation of a summary.

## Highest-value functional requirements to validate

1. **Relevant briefing and attention.** Group related updates, explain why they matter, support watches and quiet periods, and reconcile resolution in the source application. Keep an inspectable recent-activity view so filtering is not irreversible disappearance.
2. **Context continuity.** Resume an objective across assistants and T3 Code with source-linked decisions, artifacts, outstanding questions, and freshness. Users can inspect and exclude context before it is sent to another assistant or model.
3. **Useful interaction.** Support rich conversations, attachments, work-linked history, delivery state, and supported intervention controls. Separate message delivery, execution, and outcome evidence; an ambiguous timeout is not a definite failure.
4. **Result review.** Put the actual deliverable beside its claimed result and acceptance criteria. Allow correction, dispute, and follow-up without losing the original evidence or implying that a model's self-assessment is independent verification.
5. **Cross-assistant coordination.** Show the responsible lead, participating assistants, ownership changes, and conflicting or duplicate work. For councils, retain distinct initial assessments, substantive disagreement, and a bounded synthesis rather than displaying conversation volume as progress.
6. **Safe personalization.** Let assistants compose new widgets from approved datasets and supported presentation primitives, with user locks, previews where appropriate, revision history, and undo. Arbitrary executable widget code is not needed to prove this value.
7. **Source-grounded knowledge.** Retrieve from existing stores and offer deliberate capture into the chosen knowledge source. Preserve provenance, scope, correction, and deletion lineage; avoid automatic promotion of every conversation into durable memory.
8. **Proactive activation and upkeep.** Detect uncovered needs in authorized context, reuse or create source-hosted assistants under a standing mandate, establish expected follow-up, and improve bounded configurations based on observed usefulness. Include understandable pause, rollback, budget, and scope controls.

## Integration strategy

### Optional portal-managed access

Confirmed alpha scope: offer an optional connection and permission broker on the user's private gateway, alongside native-runtime-managed connections. This expands the planned security boundary; it is not an implemented feature or a decision to move credentials into a hosted profile service.

The value is substantial: connect an account once where provider rules permit, assign purpose-specific access to assistants, create assistants under preauthorized role templates, and inspect or revoke grants centrally. This reduces repetitive setup and makes proactive creation practical across supported runtimes. It does not remove provider consent requirements or make unsupported architectures automatically compatible.

Distinguish three responsibilities: authenticating the human, authorizing an agent's operation, and holding a provider connection. Clerk may handle the first; it does not by itself enforce which agent can read which mailbox or account. Tailscale provides private reachability, not per-agent data authorization.

Recommended modes, selectable per connection:

- **Native-managed:** the runtime owns credentials and enforcement. The portal displays known capabilities and assists configuration; it must label unverified or externally managed restrictions honestly.
- **Portal-managed:** a private broker holds provider credentials and exposes narrow, authenticated operations through supported protocols such as MCP or adapters. Agents receive scoped broker identities, not reusable upstream credentials. Each operation is checked against current policy and provider authorization.

For example, a mail assistant may read a selected mailbox and draft replies without sending; a finance assistant may read selected financial records without accessing mail or moving money. A lead can coordinate both without automatically inheriting their raw data or credentials. Cross-domain summaries require an explicit sharing policy, including limits on what can enter shared knowledge and council context.

Enforcement must bind grants to authenticated agent identities, not agent names supplied in requests. A shared runtime credential cannot establish strong per-agent isolation on its own. Separate runtime instances or supported sandbox and credential boundaries may be required. Shell access, browser sessions, shared files, shared memory, and direct credentials can bypass a broker; label coverage accordingly and do not claim isolation until those paths are controlled. OpenClaw provides [per-agent sandbox and tool policies](https://docs.openclaw.ai/tools/multi-agent-sandbox-tools), but compatibility and isolation still require deployment-specific tests.

Treat delegated access as no broader than the authorized role/task grant; spawning a subagent must not grant the parent's entire access by default. Previously authorizing the portal to hold a connection does not authorize every future agent to use it. Show resource, operation, agent, purpose, permitted data recipients, expiry, and limits in plain language, with deeper detail available. Natural-language policy proposals must become validated rules enforced outside the model.

Brokered authorization is security-critical infrastructure. Reuse established OAuth and secret-management components; validate token audiences and separate incoming broker credentials from upstream provider credentials. MCP explicitly prohibits token passthrough and documents per-client consent requirements for proxies: [MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).

Costs and limits: credential custody increases compromise impact and creates rotation, recovery, provider-consent, API-maintenance, and availability responsibilities. A broker outage must fail closed for protected operations, not fall back to unrestricted credentials. Revocation blocks subsequent broker access but cannot retract already-disclosed data or reliably undo in-flight external operations. The current trusted-host security model is insufficient evidence for strong isolation between potentially hostile agents.

Alpha validation includes scoped agent identities, denial of cross-domain access and delegated privilege escalation, policy rechecks on revocation, safe outage handling, and auditable requests, using both fixtures and authorized real integrations. These are development and release checks within the broad alpha, not a separate narrow prototype milestone. Runtime-native approvals and provider restrictions continue to apply; portal policy can narrow authority, not override it.

### Capability-based interoperability

Architecture agnosticism means preserving meaningful differences behind a coherent experience, not flattening all runtimes into identical capabilities.

For each adapter, declare supported versions and separately test discovery, observation, retrieval, messaging, streaming, control, approvals, and evidence. Unsupported actions should be unavailable with a reason and a source-native escape hatch. Never infer cancellation, durable receipts, or approval authority from generic agent-to-agent messaging support.

Prioritize OpenClaw, Hermes, T3 Code, and gbrain as the reference integration set. Validate T3's supported integration boundary early, before promising complete history or control. Prove the same selected user journeys across OpenClaw and Hermes rather than chasing every native feature.

Add another knowledge base, runtime, or application when it unlocks a recurring user job, has an authorized and maintainable access path, and passes conformance tests. Prefer using existing runtime integrations when they already expose adequate data. Add direct connectors where independent evidence, context quality, or reliability justifies them. Connector count is not a success metric.

Start onboarding with one useful connection and one successful job. Introduce additional runtimes, knowledge, remote access, and customization progressively.

## Non-functional requirements and alpha checks

| Requirement | Observable check |
| --- | --- |
| Trustworthy state | Disconnect, timeout, duplicate-event, and restart fixtures never turn unknown outcomes into success; stale data is labelled. |
| Safe interaction | Controls preserve source identity, authority, exact request scope, and expiry; retries cannot silently duplicate consequential actions. Unsupported guarantees block forwarding. |
| Privacy | Content access, retrieval exclusions, retention, and model egress are inspectable; deletion invalidates portal indexes and dependent summaries without deleting authoritative sources accidentally. |
| Low attention cost | Measure missed important updates, unnecessary interruptions, and time spent reconstructing context against the user's existing tools. |
| Responsive and accessible use | Test keyboard, screen reader, mobile layouts, and representative loading states. Set numeric latency and capacity gates against a measured workload before treating them as release promises. |
| Recoverability | Test backup/restore, source reconnection, layout undo, and revoked access. Distinguish portal, runtime, network, and notification outages. |
| Portable integration | Run adapter capability and semantic conformance tests; retain native identifiers and source links rather than inventing unsupported equivalence. |
| Bounded autonomy | Test that proposed improvements cannot enlarge permissions, bypass approval, switch to unapproved data recipients, exceed aggregate budgets, or create agents recursively without limits. |
| Feedback integrity | Test inactivity, missed delivery, and ignored notifications separately; none alone grants authority or silently removes important coverage. |
| Cost consent | Block autonomous metered API use without an explicit spending limit; test quota exhaustion, concurrent work, and provider fallback without silently enabling paid usage. |

Clerk and Tailscale are implementation candidates for identity and private reachability, not product differentiators or substitutes for source authorization. Document cloud-stored profile fields and recovery explicitly. Local-first does not imply that connected models, identity providers, or push services operate offline or receive no data.

## Alpha priorities and scope control

Build complete journeys with real integrations, not a broad collection of partly working screens:

- **Activate and sustain:** turn the project-oversight need into a working source-hosted assistant or routine, deliver its first useful brief, and detect a missed follow-up without manual configuration assembly. Exercise finance follow-through only with explicitly authorized data or synthetic fixtures.
- **Orient:** understand relevant overnight changes and identify the next decision across connected sources.
- **Delegate and resume:** give or continue work with the right assistant, including a T3 handoff, without rebuilding context manually.
- **Review and correct:** inspect a real deliverable, distinguish claims from evidence, and send a targeted correction.
- **Deliberate:** request one bounded council and judge whether it improves a difficult decision over a strong single-assistant baseline at comparable cost and time.

Controls must pass their security and capability checks before use. The alpha ships complete supported workflows without treating every integration as equally safe or mature.

Defer the connector long tail, native-feature parity, arbitrary widget execution, marketplace, human team collaboration, and a portal-owned planner or memory system. Preserve extension points without implementing speculative infrastructure. Do not add an expensive feature solely because a reference product has it.

## How the alpha is evaluated

Run a founder diary and matched tasks against the current native tools. Track time to orient and resume, missed important changes, wrong interventions, useful result corrections, setup/maintenance burden, and repeated voluntary use. Evaluate council quality separately from interface convenience.

Before running the comparison, agree the tasks and pass/fail thresholds. If a native dashboard or thin extension achieves the same benefit with less overhead, narrow the portal accordingly. A successful founder trial supports further testing, not a claim that other users will adopt it.

## Implementation planning still required

No further product-direction interview is required before implementation planning. Translate this direction into a finite alpha feature inventory, supported integration/version matrix, ownership boundaries, and acceptance tests. Grok Bot support is scoped to the subsequently approved manual handoff and result-import workflow, with no universal feature-parity commitment. Request user input only when an implementation discovery materially changes agreed scope or requires new authority; actual provider credentials and spending limits are supplied during setup, not inferred from this document.
