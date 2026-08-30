# User evidence and validation plan

## Evidence quality

This is a qualitative scan, not a prevalence study. GitHub issues, community forums, and Reddit
posts are self-selected reports; numerical claims in them are operator-reported and not
independently verified. Commercial pricing pages show supplier positioning, not conversion or
willingness to pay. The evidence is useful for finding recurring jobs, failure modes, vocabulary,
and experiments—not for estimating a market size.

## Recurring operator pains

The most consistent pattern is not “I need another chatbot.” It is loss of control around work that
is concurrent, unattended, remote, expensive, or difficult to resume.

| Pain | Recurrence in the scan | Consequence | Examples |
| --- | --- | --- | --- |
| Fleet visibility and triage | very high | users inspect terminals/tabs to discover what is stuck, idle, waiting, or done | [T3 #6402](https://github.com/pingdotgg/t3code/issues/6402), [T3 #4962](https://github.com/pingdotgg/t3code/issues/4962), [Agent Cockpit](https://github.com/agent-cockpit/agent-cockpit) |
| Mobile and remote reliability | very high | missed approvals and work that cannot be steered while away | [Claude Code #62553](https://github.com/anthropics/claude-code/issues/62553), [T3 #4231](https://github.com/pingdotgg/t3code/issues/4231) |
| Session, memory, and context continuity | very high | lost decisions, duplicate work, and long recovery | [T3 #3604](https://github.com/pingdotgg/t3code/issues/3604), [Claude Code #34661](https://github.com/anthropics/claude-code/issues/34661), [OpenClaw #95042](https://github.com/openclaw/openclaw/issues/95042) |
| Approval fatigue and broken approval state | very high | broad unsafe allowlists or blocked work | [OpenClaw #52850](https://github.com/openclaw/openclaw/issues/52850), [OpenClaw #55251](https://github.com/openclaw/openclaw/issues/55251) |
| Silent failure or misleading success | very high | unattended work appears healthy until a person investigates | [OpenClaw #8414](https://github.com/openclaw/openclaw/issues/8414), [T3 #911](https://github.com/pingdotgg/t3code/issues/911), [n8n #28096](https://github.com/n8n-io/n8n/issues/28096) |
| Setup, networking, and self-hosting | very high | operators abandon local/private deployments or pay for setup | [OpenHands #13109](https://github.com/OpenHands/OpenHands/issues/13109), [OpenHands self-hosting](https://github.com/OpenHands/OpenHands/blob/main/docs/SELF_HOSTING.md) |
| Infinite loops and runaway spend | high | surprise bills and resource exhaustion | [n8n #13525](https://github.com/n8n-io/n8n/issues/13525), [OpenClaw #90583](https://github.com/openclaw/openclaw/issues/90583) |
| Notification overload or silence | high | important exceptions disappear among duplicate or low-value events | [OpenClaw #52850](https://github.com/openclaw/openclaw/issues/52850), [T3 #390](https://github.com/pingdotgg/t3code/issues/390) |
| Security, credential, and prompt-injection exposure | high | useful autonomy and acceptable blast radius appear mutually exclusive | [OpenClaw #29442](https://github.com/openclaw/openclaw/issues/29442), [OpenClaw #29363](https://github.com/openclaw/openclaw/issues/29363) |

Particularly concrete reports include a 100%-reproducible approval storm in one OpenClaw setup,
heartbeat failures continuing silently for more than a day, an n8n agent loop reportedly occurring
in roughly half of runs, a Claude Code recovery failure costing more than two hours, and large
cache/heartbeat-driven token surprises. These are severe anecdotes, not population estimates.

## Initial archetypes

### Primary: multi-runtime technical operator

A solo founder, developer, maintainer, or technical operator who actively runs two or more agent
runtimes and sometimes leaves them unattended. They already use terminals, worktrees, web UIs,
Tailscale/SSH, messaging relays, cron, or bespoke scripts. Their urgent job is:

> When several assistants are acting for me, show me the few moments that need judgment, let me
> respond safely from wherever I am, and preserve enough evidence to recover when reality diverges
> from the agent's story.

This user is narrow enough to recruit and technically able to tolerate an early local-first build.

### Secondary archetypes

- Always-on personal-assistant owners coordinating email, calendar, CRM, and web automations.
- n8n/workflow builders introducing AI into consequential operations.
- Self-hosters and local-model users optimizing for sovereignty and predictable cost.
- Small engineering teams delegating issues, tests, review, and maintenance.
- Mobile/AFK operators who primarily need safe exception response rather than full authoring.

These should inform research but should not all shape the first product.

## Existing workarounds

Operators currently combine:

- tmux with SSH, Termius, Tailscale, or a browser terminal;
- Telegram, Slack, Discord, ntfy, or custom push relays;
- Git worktrees or disposable clones for parallel coding agents;
- per-command approval, broad allowlists, plan mode, or unsafe “always allow” modes;
- explicit cron jobs instead of noisy heartbeats, sometimes routed to cheaper models;
- manual restarts, stale-row deletion, transcript recovery, upgrades, and downgrades;
- private Git repositories and file backups for state and memory;
- managed VPS/setup services to avoid Docker, TLS, gateway, and update maintenance.

The product must outperform this bundle, not merely outperform an empty screen.

## Mobile job

A credible phone surface is an exception console, not a shrunken desktop:

- push only for approval, blocked input, failure, completion, or a threshold breach;
- group duplicate events by root cause;
- show risk, age, full tool/command parameters, working directory, affected resources, request hash,
  expiry, and what happens on timeout;
- approve, deny, answer, steer, inspect a diff/artifact, and request cancellation;
- reconnect across sleep and network changes without silently starting a new session;
- show child/background work as active until the source runtime confirms termination;
- support quiet hours, digesting, severity rules, and a durable decision trail.

## Falsifiable first hypothesis

> For one trusted operator running two compatible local agent runtimes, a metadata-minimized
> exception relay reduces median time-to-resume and cross-runtime context switching by at least 30%
> without storing provider credentials, executing commands, or pretending to enforce policies the
> source runtime does not support.

This is deliberately narrower than “portal to every AI brain.” If it fails, a universal portal is
unlikely to rescue the idea.

## Pre-build experiments

1. **Two-week observation.** Observe real work across at least two runtimes. Record meaningful
   exceptions, approval misses, duplicate prompts, application switches, resume delays, false
   completion, and actual recovery work. Do not build a UI first.
2. **Protocol probes.** For each candidate runtime exercise start, progress, request input, approve,
   reject, resume, cancel, crash, reconnect, duplicate event, stale request, and version mismatch.
3. **Throwaway metadata adapters.** Emit only the proposed envelope and measure what is lossless,
   approximate, or impossible. Require exact runtime/session/request IDs and canonical hashes.
4. **Authority test.** Determine whether an approval can be safely forwarded without the portal
   storing runtime credentials or becoming the execution gateway.
5. **Native-versus-portal study.** Compare clicks, app switches, time-to-notice, time-to-decision,
   wrong decisions, stale items, and abandonment against native runtime UIs.
6. **Policy mapping.** Map 20 representative policies—filesystem, shell, network, secrets,
   destructive operations, external writes, model, spend—onto each runtime as exact,
   approximate, or impossible.
7. **Crash and delivery test.** Kill the portal at every transition; duplicate, reorder, and delay
   adapter events; verify no false terminal state, replayed decision, or lost outbox record.
8. **Hostile input test.** Exercise malicious MCP metadata/results, indirect prompt injection,
   changed tool manifests, stolen pairing links, replayed approvals, and command/cwd mutation.
9. **Data-minimization test.** Compare metadata-only, redacted, and opt-in encrypted detail. Ask
   whether the history still supports a correct decision and useful recovery.
10. **Maintainer interviews.** Establish which integration surfaces are supported contracts rather
    than reverse-engineered accidents.

## Go/no-go thresholds

Kill or radically narrow the portal if any condition holds:

- target operators encounter fewer than about ten meaningful cross-runtime exceptions/resumes per
  week or overwhelmingly use one runtime;
- the relay does not reduce time-to-resume or context switching by at least 25–30%;
- more than 5% of approval requests lack an exact runtime/session/request identity, or any approval
  can be replayed against changed arguments;
- a red-team exercise produces approval bypass, stale-plan execution, credential leakage,
  cross-session access, or device-identity confusion;
- the majority of common policies cannot be mapped exactly and the UI cannot make degradation
  obvious;
- more than 10% of tested event sequences become lost, duplicated, wrongly ordered, or
  unrecoverable under crash/network fault;
- the portal must proxy every tool call, store provider credentials, or execute commands to deliver
  its core value;
- users continue to prefer native approval surfaces after a fair comparison;
- adapter maintenance breaks repeatedly under ordinary runtime upgrades;
- data minimization makes the ledger too incomplete to decide or recover safely.

Thresholds are proposed decision rules, not researched industry norms. They should be frozen before
the experiment to prevent rationalizing a weak result.

## Recruitment

Recruit 24–30 participants, four or five in each cell:

- multi-agent coding power users;
- always-on personal-assistant/OpenClaw operators;
- n8n or similar automation builders;
- self-hosted/VPS/local-model users;
- mobile/remote operators;
- security-conscious maintainers or small engineering teams.

Recruit through opt-in outreach to public issue contributors and through project communities. Ask
maintainers to forward invitations rather than scraping private identities. Include frustrated
non-builders, not only wrapper authors and promoters.

Run a screener, a compensated 45-minute contextual interview with live workflow walkthrough, a
seven-day interruption diary or redacted event-log study, and then a concierge test with three
parallel tasks, an AFK approval, a backend restart, and phone/desktop recovery.

## Interview guide

1. Tell me about the last autonomous task you ran, from kickoff through completion or failure.
2. How many agents, projects, providers, and machines do you use concurrently?
3. How do you know what is working, idle, blocked, failed, or finished?
4. Describe the last input request or approval you missed. What happened?
5. What must you see before approving an action?
6. Which approvals would you batch, pre-authorize, or never delegate?
7. When did a resume, compaction, upgrade, or restart last lose important context?
8. What was the practical consequence and recovery time?
9. Describe the last loop, zombie process, or surprise model/API bill.
10. What limits, kill switches, and alerts do you trust today?
11. Walk through remote setup. Where did networking, TLS, Docker, credentials, or pairing fail?
12. Which data or permissions would you never expose to an agent or portal?
13. Which events deserve an immediate push, a digest, or no notification?
14. What have you already built, installed, or paid for to manage this work?
15. For what concrete outcome would you place a deposit or pay monthly?

## Measurements that matter

- low-value human attention minutes per externally verified outcome;
- median and tail time-to-notice and time-to-resume;
- app/context switches per resolved exception;
- incorrect, stale, duplicate, or later-regretted decisions;
- recovery time after portal, runtime, host, or network failure;
- externally verified outcomes versus agent-claimed completions;
- unplanned spend and prevented budget overruns;
- percentage of work completed without intervention, segmented by risk;
- user trust calibration: when confidence, scrutiny, and delegation match observed reliability.

Do not optimize raw agent count, token volume, event volume, hours “saved,” number of approvals, or
dashboard engagement. Those can all increase while the user's outcomes and attention get worse.
