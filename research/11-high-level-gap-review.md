# High-level gap review

> Review date: 28 August 2026. This evaluates the research dossier as a product and architecture
> thesis, not by citation count.

## Verdict

The original research is unusually strong on the parts most agent products skip: authority
boundaries, approval integrity, false completion, human attention, protocol lossiness, source-code
reuse, memory provenance, open-source governance, and falsifiable evaluation.

It is strong enough to justify pre-build probes. It is **not** yet sufficient to justify building
the broad portal. Seven gaps could materially change the architecture or product form:

| Gap | Why it is crucial | Required change |
| --- | --- | --- |
| Availability, placement, and push delivery | a private URL is not an always-available attention channel | make placement and delivery planes explicit |
| Mission/priority alignment | efficiently resuming the wrong work is still failure | add commitment sources, priority authority, and alignment metrics |
| Multi-principal and bystander rights | a “single-user” assistant acts on other people's data and resources | model stakeholder, subject, owner, delegation, and dispute |
| Independent effect verification | a runtime receipt can confirm a request, not reality | add verifier adapters and reconciliation states |
| Zero-new-dashboard alternative | the lowest-overhead product may live in existing channels | test ambient/channel-first delivery as a primary baseline |
| Operational security lifecycle | a privileged local daemon must survive updates, key loss, backup, and uninstall | specify custody, migration, recovery, and secure update behavior |
| Consequential-domain protocols | purchases and other signed mandates need stronger semantics than generic approval | preserve domain-native mandates/receipts; defer execution |

The good news is that these gaps reinforce the narrowed, read-only wedge. They do not require a new
agent runtime.

## 1. Availability and push are a separate plane

The dossier treats Tailscale Serve as the preferred remote path, but that solves authenticated
reachability only while the serving node and portal process are online. Tailscale's own examples say
traffic reaches the development server **as long as the device is online and connected**, and its
connection guide says the destination must still run the actual service:
[Serve examples](https://tailscale.com/docs/reference/examples/serve),
[connecting devices](https://tailscale.com/docs/how-to/connect-to-devices).

The notification path has different constraints. On iOS/iPadOS, standards-based Web Push works for
Home Screen web apps, requires user-initiated permission, uses service workers, and is delivered
through Apple Push Notification service. The sender must be able to reach `*.push.apple.com`:
[WebKit Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Consequences:

- A Tailscale-served PWA can be a private interactive surface, but tailnet reachability alone cannot
  wake the user with an exception.
- “No project cloud” does not mean “no third-party notification infrastructure”; APNs/browser push
  services remain in the delivery path unless the product accepts foreground/poll-only behavior.
- A sleeping laptop cannot host an available portal or continue its local runtimes. If runtimes
  execute on an always-on workstation/VPS, the portal or an observer must also be always-on there.
- Portal unavailable, runtime unavailable, notification unavailable, and client offline are four
  distinct states. The UI and audit must not collapse them into “agent quiet.”

Make placement a declared profile:

| Profile | Placement | Promise |
| --- | --- | --- |
| Local development | portal and runtimes on the active workstation | no work/alerts while the host sleeps; loopback UI |
| Private always-on | portal near runtimes on a home server/VPS; clients over Tailscale | unattended observation; Web Push or optional channel adapter |
| Split placement | always-on portal gateway with authenticated remote runtime adapters | tolerates client/workstation churn; larger identity/threat surface |
| Managed relay, later | optional encrypted notification/sync service | convenience and team features; explicit cloud/privacy tradeoff |

Notification delivery should be an adapter with receipts, expiry, privacy class, and capabilities—not
an incidental UI feature. Push payloads contain only an opaque attention ID and coarse severity;
details are fetched after authenticated connection. The product promise must name which dependencies
remain: host power, internet, tailnet control plane, APNs/FCM/browser push, and any relay.

## 2. The product measures interruption, not whether the right work was chosen

The dossier has an `Objective` entity, but the wedge and benchmark primarily optimize exception
detection and safe resume. That can make the portal excellent at accelerating low-priority,
duplicated, stale, or strategically wrong work.

The missing job is **delegation portfolio alignment**:

- Which commitment authorized this work?
- Which system is authoritative for its priority and deadline?
- What is explicitly out of scope?
- Who benefits, who may be affected, and what is the acceptable outcome?
- Is another runtime already doing equivalent work?
- Has the objective been cancelled or superseded while the run continued?

Do not turn the portal into another task manager. Add read-only commitment connectors to the user's
existing systems of record—task manager, calendar, issue tracker, CRM, or assistant-native standing
intent. A portal objective is either source-backed or explicitly portal-local.

Minimum objective contract:

```text
objective_id
source_system / native_id / native_revision
authority                    # who may change priority/scope
stakeholders / affected_parties
priority / deadline / review_at
desired_outcome / acceptance_evidence
non_goals / forbidden_effects
budget / expiry / stop_conditions
supersedes / depends_on / duplicates
freshness / coverage
```

Add guardrail metrics:

- percentage of active runs linked to a current objective;
- priority-weighted lateness and neglected high-priority commitments;
- duplicate/conflicting runs detected;
- work completed after cancellation or supersession;
- verified outcome value per attention minute—not resumptions alone.

The portal should interrupt on **objective conflict or drift**, not continually ask users to curate a
portfolio.

## 3. One operator does not mean one principal

Even a personal assistant reads messages written by other people, schedules shared calendars,
modifies team repositories, contacts merchants, and may make decisions affecting family, clients,
employees, or customers. The original single-user architecture models a human principal and
delegation, but not affected people, joint authority, ownership conflicts, or the right to contest.

Add distinct roles:

```text
operator             # person using the portal
data_subject          # person described by data
resource_owner        # controls account/file/calendar/funds
stakeholder           # affected by objective or effect
authorizer            # may approve this exact effect
delegatee             # agent/runtime receiving authority
verifier              # independently establishes outcome
contestant            # disputes a claim, decision, or effect
```

An approval is valid only if the operator is the appropriate authorizer for the resource/effect. A
shared-calendar write or externally sent message cannot inherit authority merely from portal
ownership. The UI should expose the acting identity/account and affected audience before approval.

This also has legal consequences once the project is hosted, used at work, or processes other
people's data. As of this review, the EU AI Act became broadly applicable on 2 August 2026, with
transparency rules and phased high-risk dates; applicability depends on the product's role and use:
[European Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai),
[AI Act text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=en). GDPR Article 22 addresses
solely automated decisions with legal or similarly significant effects, while the broader GDPR
still imposes purpose, minimization, transparency, rights, and security duties:
[GDPR text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).

Engineering requirements before a hosted/team/consequential version:

- document when the project, host, integration provider, and user act as controller or processor;
- record purpose, scope, retention, recipient, and affected-person category for sensitive sources;
- support access, correction, deletion, restriction, export, and contest workflows where applicable;
- label AI interaction and generated content when required;
- never claim that a human click automatically satisfies meaningful human oversight;
- conduct jurisdiction/use-case review for employment, credit, health, education, insurance,
  migration, public services, and other consequential domains.

This is product-risk guidance, not legal advice. Personal/local use, a hosted service, and workplace
deployment can have materially different obligations.

## 4. Add verifier adapters, not just runtime adapters

The dossier correctly separates accepted, committed, claimed complete, and externally verified
states, but it does not fully define who performs external verification.

A source runtime can prove that it attempted an API call. It cannot by itself prove that:

- the email reached the intended recipient rather than only entering a provider queue;
- a calendar event has the expected participants and timezone after synchronization;
- a deployment is healthy after rollout;
- a payment settled for the intended amount and merchant;
- a file change satisfies the user's acceptance criteria;
- an apparent compensating action restored the external world.

Introduce four edge roles rather than treating everything as a runtime adapter:

```text
runtime adapter       observes native execution and forwards gated source commands
commitment connector  reads objectives/priorities from systems of record
verifier adapter      independently reads external postconditions and reconciliation state
delivery adapter      brings an exception to a person and records delivery/interaction
```

Effect state should be a reconciliation ladder:

```text
intended
  → requested
  → accepted_by_source
  → committed_by_source
  → externally_observed
  → reconciled_to_postcondition
  → human_verified (when required)

orthogonal outcomes: unknown | disputed | reversed | compensation_requested | compensated
```

Verification rules are effect-specific, versioned, and source-labelled. The verifier should be
independent where practical and read-only by default. An absence of verification is `unknown`, not
failure or success.

## 5. The best attention layer may not be another place to visit

The qualitative evidence records Telegram, Slack, Discord, ntfy, tmux/SSH, and custom relays as
common workarounds, but the proposed experiment does not test the strongest product alternative:

> Keep the portal as history and deep inspection; deliver most routine control through a menu-bar,
> system-tray, OS notification, email digest, or an existing messaging surface.

Add a baseline:

- **B4 ambient control:** prioritized exception cards delivered in an existing channel with secure
  deep links, while the full portal is opened only for context/audit.

Compare B4 against the full portal on safe-resume time, wrong decisions, context switches, setup,
notification fatigue, privacy, and retention. If B4 wins, the open-source asset should be an
attention protocol/gateway with several thin surfaces—not a dashboard-centric app.

For security, messaging/notification channels are delivery surfaces, not proof of human identity or
approval authority. Sensitive decisions still move to an authenticated surface bound to the exact
request.

## 6. The local daemon needs an operational lifecycle

The dossier has good runtime chaos tests and supply-chain recommendations, but it does not yet define
the user-facing lifecycle of a privileged service holding an audit graph and source handles.

Before implementation, specify:

- install, service registration, least-privilege account, data directories, firewall rules;
- schema migration with preflight, backup, rollback, and forward-only audit compatibility;
- database and artifact encryption, which fields remain visible, and where keys live;
- OS-native secret custody rather than secrets beside the database—for example
  [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services/), Windows
  protected credentials, and the Linux Secret Service or an explicit headless alternative;
- key rotation, device loss, forgotten recovery credential, and unrecoverable-key behavior;
- atomic backup/restore and verification of tombstones, indexes, artifacts, adapter config, and
  audit continuity;
- safe diagnostic bundles that exclude content and secrets by construction;
- complete uninstall/revoke/delete behavior;
- adapter/runtime compatibility pinning and an emergency disable path;
- update provenance, staged rollout, rollback, and protection against freeze/rollback/mix-and-match
  attacks. [The Update Framework](https://theupdateframework.io/spec/) is a relevant design standard.

An encrypted store without a key-custody and recovery model is not yet an architecture. A signed
release without secure update metadata and rollback policy is not yet a safe updater.

## 7. Generic approvals are insufficient for purchases and other mandates

The architecture includes `financial.commit`, but the broader vision will eventually encounter
domain protocols with stronger authorization evidence.

The current [Agentic Payment Protocol v0.2](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)
defines a Trusted Surface, signed checkout/payment mandates, receipts, and separate human-present
and human-not-present flows. It binds authorization to the checkout and treats verification as
deterministic code. Visa's
[Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/)
also introduces agent, consumer/device, and payment signatures, under its own terms.

This does not belong in the first wedge. It does change the long-term schema:

- preserve domain-native signed mandate and receipt artifacts;
- distinguish intent, checkout terms, credential authorization, settlement, delivery, refund, and
  dispute;
- do not translate a payment mandate into a generic Boolean approval;
- never store underlying payment credentials in the portal;
- treat the portal as a candidate display/verification surface, not merchant, wallet, or payment
  processor;
- keep financial, medical, legal, employment, and physical-world effect adapters disabled until
  their specific authority, liability, and verification models exist.

## 8. The largest remaining gap is evidence, not literature

The dossier acknowledges this, but it is worth elevating: no original interview, diary study,
instrumented baseline, deposit, or real adapter conformance result exists yet. The current target
user, ten-exceptions-per-week threshold, 30% improvement target, and willingness to install a local
daemon are hypotheses.

Do not commission another broad agent landscape. The next research work is direct observation:

1. instrument current practice for 12–20 operators using at least two runtimes;
2. measure actual exception frequency, missed work, app switches, and safe-resume time;
3. compare native tools, raw dashboard, exception relay, full ledger, and B4 ambient control;
4. probe runtime lifecycle APIs and build one read-only adapter plus one independent verifier;
5. test all three placement states: active workstation, always-on private node, and split placement;
6. run a privacy/legal role-mapping workshop on realistic email/calendar/team scenarios;
7. freeze go/no-go gates before seeing the results.

## Revised minimal architecture

```text
Ambient clients / portal detail UI
        │
        ▼
Host-local attention gateway
  ├─ attention and source-labelled audit projection
  ├─ delivery outbox and channel adapters
  ├─ objective/commitment correlation
  ├─ effect reconciliation and verifier results
  └─ no execution credentials in the read-only proof
        │
        ├─ runtime adapters
        ├─ commitment connectors
        ├─ verifier adapters
        └─ delivery adapters

Placement profile and dependency health are explicit product state.
```

This is a better foundation for the original philosophy: enough insight and authority to
orchestrate, with the smallest possible demand on the user's attention.
