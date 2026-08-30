# Competitive landscape

Snapshot: 28 August 2026. Repository activity and adoption figures change quickly; stars are treated
as directional signals, not quality evidence. “Open source” also varies materially: some products
are permissive, some copyleft, and some source-available or fair-code.

## Market structure

The space is best understood as overlapping layers rather than one product category.

| Layer | Representative products | What they own |
|---|---|---|
| Assistant runtimes and gateways | OpenClaw, Hermes, Letta, OpenHands, LangGraph, n8n | Reasoning, tools, memory, execution, schedules, workers |
| Operator/control surfaces | T3 Code, OpenHands Agent Canvas, LibreChat, Magentic-UI, AgentGUI, Agent Cockpit | Starting, observing, steering, approving, reviewing work |
| Observability and governance | Langfuse, AgentOps, Flightdeck, HumanLayer/ACP, Airlock, AgentGate | Traces, cost, policy, approvals, replay, fleets |
| Work and attention systems | Plane, Vikunja, Super Productivity, Tasker, Home Assistant | Intake, triage, Today views, state, notifications, automations |

Closed platforms increasingly span every layer—ChatGPT Work, Claude Cowork, Microsoft Copilot
Cowork/Agent 365, Google Gemini Enterprise, Perplexity Computer, Manus, Lindy, Relevance AI,
Gumloop, and Salesforce Agentforce. They have distribution, first-party credentials, integrated
models, compliance, and execution sandboxes. An open project should not compete by claiming a
smarter agent. It should compete through neutrality, ownership, portability, private deployment,
and better attention economics.

## Direct and adjacent open products

| Project | Product and architecture | Useful interaction patterns | License / caveat | Relevance and gap |
|---|---|---|---|---|
| [T3 Code](https://github.com/pingdotgg/t3code) | Web, Electron, iOS, and Android control surface over local Codex, Claude Code, Cursor, Grok Build, and OpenCode providers. A host server owns provider processes, workspaces, Git, terminal, orchestration, and state. | Permission modes, approvals, thread pin/snooze/settle, multi-agent phase/fleet view, diffs, checkpoints, pairing, remote environments. | MIT. Fast-moving and still early; provider integration APIs can change. | Best architectural and mobile/remote reference for a neutral local control surface. Coding and repository concepts dominate its domain model. |
| [OpenClaw](https://github.com/openclaw/openclaw) | Always-on personal-assistant gateway with channels, sessions, skills, tools, browser/device actions, scheduled automation, task ledger, Control UI, desktop/mobile surfaces, and local state. | Durable background tasks; execution state separate from delivery state; `done_only`, `state_changes`, and `silent` notifications; approval queues; task audit/maintenance; agent-built dashboards. | MIT. Very large trusted-computing and plugin surface; official security guidance warns against public Control UI exposure. | Closest complete open personal-assistant platform and essential first adapter. It owns the runtime, whereas this portal should span runtimes. |
| [OpenHands](https://github.com/OpenHands/OpenHands) | Agent Server and local GUI/Agent Canvas; event-driven coding agents; separate automation paths for schedules and webhooks; local, cloud, and scaled deployments. | Stateless agent steps over event history, `WAITING_FOR_CONFIRMATION`, action/observation events, interruptibility, multiple agent servers. | MIT core; inspect cloud/enterprise components separately. | Excellent reference for an agent-server/event-stream boundary. Coding-centric and not a polished personal attention inbox. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Persistent personal agent with memory, user model, skills, subagents, cron, messaging channels, and local/container/SSH/cloud execution backends. | Dangerous-command approval, fail-closed timeouts, deny rules, execution isolation, cross-session controls. | MIT. | Strong runtime and placement model. Operator UI is secondary and the broad feature surface can produce security and approval burden. |
| [Letta](https://github.com/letta-ai/letta) / [Letta Code](https://github.com/letta-ai/letta-code) | Stateful agents with persistent identity, memory, skills, hooks, subagents, permissions, crons, and multiple clients. | Memory/identity continuity, versioned context, long-lived agents, remote environments. | Apache-2.0 for the inspected open repositories; some hosted features naturally require service access. | Best conceptual reference for durable agent identity and memory. Complex and not centered on a personal work queue. |
| [LangGraph](https://github.com/langchain-ai/langgraph) + [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) | Low-level stateful orchestration with durable execution, interrupts, checkpoints, memory, and time travel; a Next.js client scaffold. | Inspect/modify state, resume, interrupt, fork from checkpoints, stream artifacts and messages. | MIT. Hosting and LangSmith integrations may add separate service assumptions. | Excellent run/checkpoint semantics. Framework-specific and the default UI remains chat-first. |
| [LibreChat](https://github.com/danny-avila/LibreChat) | Mature multi-provider, self-hosted chat with agents, MCP, artifacts, memory, subagents, background work, and administration. | Interrupt and steer, queued follow-ups, reclaim/edit pending steering, question forms, tool approvals, activity groups, phase summaries, resumable streams. | MIT. | One of the best polished run-interaction references. Conversation remains the primary mental model. |
| [Open WebUI](https://github.com/open-webui/open-webui) | Large offline/self-hosted surface for models, chat, agents, notes, channels, memory, RBAC, plugins, MCP/OpenAPI tools, and workflows. | Persistent chat/memory, queued messages, plugin actions, broad setup UX. | Recent versions add branding/fair-use restrictions; review the exact version and [license policy](https://docs.openwebui.com/license/) before reuse. | Broad feature and plugin reference, but too chat-centric and operationally broad to use uncritically as a base. |
| [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) | Local/Docker workspaces with documents, RAG, agents, skills, MCP, memory, no-code builder, and scheduled tasks. | Simple onboarding, workspace separation, automatic/user memories, scheduled work. | MIT. | Strong all-in-one simplicity reference. Global activity, approval, and long-run control are comparatively weak. |
| [Khoj](https://github.com/khoj-ai/khoj) | Personal second brain spanning documents, research, custom agents, browser/editor clients, messaging, newsletters, and notifications. | Proactive research, personal knowledge, smart notifications and digests. | AGPL-3.0. | Important proactive/digest model. More answer-and-notify than durable do-and-report execution. Keep integration at an adapter/API boundary unless adopting AGPL deliberately. |
| [Magentic-UI](https://github.com/microsoft/magentic-ui) | Microsoft Research prototype for browser/file agents and human-agent collaboration. | Plan review, co-tasking and takeover, action guards, verification, memory, multi-tasking. | MIT. Experimental. | Strongest explicit low-cost human-involvement model; not an always-on personal control plane. |
| [AgentGUI](https://github.com/eth-medical-ai-lab/agent-gui) | Local interface for long-running agents with trajectory, console, artifacts, teams, and automated drift audits. | Run breakdown, time/tool visualization, task-definition steering, subagent view, audit manager. | MIT. New research prototype. | Direct evidence that legible trajectory views can reduce lookup time and workload. Still agent/fleet oriented rather than commitment oriented. |
| [Agent Cockpit](https://github.com/agent-cockpit/agent-cockpit) | Local Node/SQLite/WebSocket control room for Claude Code and Codex; append-only events, unified approvals, diffs, memory, replay, chat, and history. | One approval inbox, normalized provider events, timeline/replay, risk display, local-first history. | Verify current repository license before any code reuse. Product is young. | Very close architectural analogue but coding-specific; useful for a smaller alternative to T3's much larger codebase. |
| [Flightdeck](https://github.com/flightdeckhq/flightdeck) | Self-hosted observability/control plane instrumented through a sensor or Claude Code plugin. | Fleet feed, per-agent timeline, token budgets, live directives, MCP allow/block policy. | Verify current repository license and component boundaries. | Strong example of observability becoming control, but developer/production-agent oriented rather than personal-work oriented. |
| [CoWork OS](https://github.com/CoWork-OS/CoWork-OS) | Ambitious local-first “everything app” for code, mail, research, documents, automation, Mission Control, Inbox, memory, and agent daemon. | Mission Control, ask inbox, approvals, task timeline, cost/iteration limits, Tailscale/SSH deployment. | MIT at the research snapshot; early project with a small community and an unusually broad claimed surface. | Most on-the-nose full-product comparison. Its strategy is to own the runtime and application suite; the proposed portal deliberately does not. |
| [n8n](https://github.com/n8n-io/n8n) | Visual workflow engine with triggers, schedules, webhooks, code, agents, tools, integrations, and human-approval nodes. | Practical trigger/schedule/retry/branch patterns; workflow-level approval gates. | Sustainable Use / enterprise licensing; source-available rather than conventional permissive open source. | Excellent integration substrate or adapter target, but not a code base to fold into a permissive core. Visual workflow authoring also creates overhead the portal is meant to reduce. |
| [Home Assistant](https://github.com/home-assistant/core) | Mature local event bus, integration platform, automations, device state, mobile clients, dashboards, and private voice/intent surface. | Entity state, cards, actionable notifications, local trust, service permissions, integration quality tiers. | Apache-2.0. | Gold-standard analogy for a local integration hub and calm state/control UI. Its domain is the home rather than delegated knowledge work. |
| [Langfuse](https://github.com/langfuse/langfuse) | Self-hosted trace, session, prompt, evaluation, dataset, cost, and playground platform. | Trace/session timelines, prompt versions, evaluations, cost attribution. | MIT with separately marked enterprise directories/features; review component boundaries. | Best schema/diagnostics reference. It is an engineering observability system, not an end-user control surface. |
| [AgentOps](https://github.com/AgentOps-AI/agentops) | Python SDK plus dashboard for session replay, execution graphs, tools, costs, and failures. | Replay, execution graphs, cost/failure summaries. | MIT. | Useful observability reference; not an approval or work control plane. |
| [Plane](https://github.com/makeplane/plane) | Modern issue/work system with Inbox, projects, cycles, views, pages, analytics, APIs, and webhooks. | Global inbox, deduplicated/stacked notifications, triage, filters, keyboard-first navigation. | AGPL-3.0 for the open edition; some governance features may be commercial. | Strong “work as durable object” and triage reference. Avoid copying code into a permissive core without accepting AGPL. |
| [Super Productivity](https://github.com/johannesjo/super-productivity) | Mature local-first task/timeboxing application with projects, tags, integrations, sync options, and no-account use. | Quick capture, Today planning, timeboxing, private local operation, external issue ingestion. | MIT. | Excellent reference for the personal planning and Today layer, although it has no agent runtime. |
| [Vikunja](https://github.com/go-vikunja/vikunja) | Self-hosted task manager with inbox, lists, Kanban, filters, recurring tasks, and API. | Simple personal inbox and flexible task projections. | Primarily AGPL; inspect clients separately. | Useful IA reference, not a permissive component source. |

## Closed and hosted comparables

| Product | Strength | Strategic implication |
|---|---|---|
| OpenAI ChatGPT Work / workspace agents | Distribution, broad agent capability, apps, schedules, enterprise controls, Codex heritage | The portal cannot win on model quality; it can win on cross-runtime visibility, local ownership, and portable policies/history. |
| Anthropic Claude Cowork / Claude Code | High-quality execution, local files, plugins/skills/connectors, subagents, OTel, spend and tool controls | A likely important adapter source and a powerful incumbent experience. Neutrality and consolidated attention remain differentiated. |
| Microsoft Copilot Cowork / Agent 365 | Microsoft Graph, M365 context, schedules/events, approvals, task views, Entra/Purview governance, procurement | Strongest enterprise control-plane competitor and validation that agent governance is its own paid category. |
| Google Gemini agents / Enterprise | Search, Workspace data, browser/mobile/desktop computer use, Agent Gallery, A2A/MCP | Another vertically integrated ecosystem; reinforces the need for neutral state and export. |
| Perplexity Computer | Generalist background worker with web, files, connectors, subagents, memory, schedules, and monitoring | Strong direct user proposition; remains proprietary and credit/service bound. |
| Manus | Broad autonomous cloud execution with projects, files, skills, webhooks, and computer use | High capability and polished results, but weak portability and neutral governance. |
| Lindy / Relevance AI / Gumloop | No-code/business-agent creation, many integrations, schedules, approvals, escalations | Effective for SMB workflows but require the user to inhabit a vendor runtime and often design workflows. |
| Salesforce Agentforce | CRM-native agents, control center, policy, testing, marketplace, MCP/A2A | Strong vertical/enterprise competition, little relevance to a local individual-first product except as future adapter/protocol validation. |

Current demand evidence supports the direction but should not be over-read:

- [Microsoft's 2026 Work Trend Index](https://www.microsoft.com/en-us/worklab/work-trend-index/agents-human-agency-and-the-opportunity-for-every-organization)
  reports a growing segment using multi-step and multi-agent workflows while many users lack the
  surrounding systems to use that agency effectively.
- [Anthropic's autonomy research](https://www.anthropic.com/research/measuring-agent-autonomy)
  found experienced users approve more broadly but also interrupt more, suggesting a shift from
  inspecting every action to exception-based supervision.
- The [2025 AI Agent Index](https://aiagentindex.mit.edu/data/2025-AI-Agent-Index.pdf) found that
  meaningful execution monitoring and mid-run intervention were uncommon among deployed agents.
- [“Why Johnny Can't Use Agents”](https://arxiv.org/abs/2509.14528) found users impressed by
  Operator and Manus yet hindered by mismatched mental models and weak collaborative awareness.

## What the market does not yet solve cleanly

1. **One personal attention inbox across runtimes.** Approvals, questions, failures, schedules,
   delivery problems, messages, and artifacts are still split by application.
2. **Durable approval objects.** Many products use modal prompts without policy scope, expiry,
   argument binding, audit history, or rollback.
3. **Cross-runtime work identity.** The same objective can span email, research, code, calendar, and
   automation but becomes several unrelated chats or runs.
4. **Remote local-first operation.** Private-network access, device pairing, and gateway-owned state
   are not standard outside products such as T3 Code and OpenClaw.
5. **Attention compression with evidence.** Observability systems show more detail; task systems hide
   execution detail. Few products decide which five of five hundred events deserve the user.
6. **Truthful always-on semantics.** Crash recovery, delivery acknowledgement, stale approvals,
   replay, duplicate side effects, and unknown/lost state are frequently under-specified.
7. **Portable memory, policy, and history.** Incumbent systems make accumulated preferences and
   schedules a switching barrier.
8. **Permissive composability.** Several attractive adjacent projects are AGPL, fair-code, or have
   enterprise/branding carve-outs.

## Patterns worth combining

### The work ledger

Borrow from OpenHands, LangGraph, OpenClaw, Langfuse, and AgentOps:

```text
Work item → run → event stream → request / artifact / observation → outcome
```

Derive task status, live activity, replay, approvals, cost, artifact history, and digests from the
same durable stream. Do not make chat messages the source of truth.

### Durable approvals

Borrow from OpenClaw, Hermes, T3 Code, and policy gateways. Store exact action, normalized arguments,
target, requesting run, capability, impact, evidence, expiry, decision scope, user identity, receipt,
and rollback status. Support allow once, allow for this work item, and standing policy only where the
scope can be expressed exactly.

### Mid-run steering

Borrow from LibreChat and Magentic-UI: interrupt now, apply after safe checkpoint, add constraint,
change task definition, queue follow-up, reclaim/edit pending input, take over, and resume.

### Identity separate from placement

Borrow from OpenClaw, Letta, Hermes, and T3 Code: durable state belongs to a gateway/environment;
execution may happen on a laptop, home server, container, SSH machine, or temporary worker. The user
sees one work history regardless of placement.

### A real operator inbox

Borrow from Plane, Super Productivity, OpenClaw tasks, and Home Assistant notifications. “Read” and
“resolved” are different. Group by root cause, provide safe deferral, and sort deterministically by
consequence, deadline, blocking duration, and risk.

### Explicit memory boundaries

Separate durable preferences, temporary task context, source material, artifacts, permissions, and
execution state. A vector store or transcript is not a sufficient lifecycle or deletion model.

## Ranked inspection shortlist

1. T3 Code — code-level spike for host/client boundary, auth, remote environments, Tailscale,
   event sourcing, snooze/settle, and multi-agent UI.
2. OpenClaw — first real adapter and the benchmark for personal tasks, approvals, channels,
   dashboards, and always-on recovery.
3. OpenHands — event/action/observation model and Agent Server integration.
4. LibreChat — polished interrupt/steer/queue/activity interactions.
5. Magentic-UI and AgentGUI — human-centered oversight and trajectory comprehension.
6. LangGraph — interrupts, checkpoints, state modification, and time travel.
7. Agent Cockpit — compact provider-normalization and approval-inbox reference.
8. Langfuse and AgentOps — trace, replay, cost, and evaluation schemas.
9. Home Assistant — integration registry, local event state, cards, notifications, and governance.
10. Plane and Super Productivity — attention inbox, Today, filters, command navigation, and local
    personal planning.
11. CoWork OS — closest broad product concept; study its choices while avoiding its scope.
12. n8n — triggers, schedules, and approval workflows as an adapter target, not a permissive base.

## Competitive conclusion

The defensible open-source thesis is not “one more AI OS.” It is:

> A portable personal control plane that connects the assistants users already chose, normalizes
> their work without erasing native behavior, and converts a flood of activity into a small,
> evidence-backed queue of human decisions.

OpenClaw is the largest strategic threat and the best launch partner. If the portal only works with
OpenClaw, it is a redundant dashboard. If it works equally well across OpenClaw, T3/Codex/Claude,
n8n, and generic event sources—while giving the user portable policy, attention, and audit state—it
creates a distinct category.
