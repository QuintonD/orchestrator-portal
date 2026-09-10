import { demoAssessment, presentationText } from "./demo-scenario.js";
import { compatibleApi } from "./compatible-api.js";
import { boundedText } from "./source-http.js";
export { boundedText } from "./source-http.js";
import type { AssistantProfile, DecisionPacket } from "@orchestrator/contracts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import type { RuntimeAdapter, SendResult, SyncResult } from "@orchestrator/adapter-sdk";
import type { PortalEventInput } from "@orchestrator/contracts";

const execFileAsync = promisify(execFile);
const openclawBinary = process.platform === "win32" ? "openclaw.cmd" : "openclaw";

function parseJsonOutput(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* Some CLI versions print a banner before JSON. */ }
  const candidates = [trimmed.indexOf("{"), trimmed.indexOf("[")].filter((index) => index >= 0).sort((a, b) => a - b);
  for (const start of candidates) {
    try { return JSON.parse(trimmed.slice(start)); } catch { /* Try the next opening token. */ }
  }
  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractReply(value: unknown): string | undefined {
  if (typeof value === "string") return stringValue(value);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["reply", "response", "text", "message", "output"]) {
    const direct = stringValue(record[key]);
    if (direct) return direct;
  }
  if (Array.isArray(record.payloads)) {
    const parts = record.payloads.map(extractReply).filter((item): item is string => Boolean(item));
    if (parts.length) return parts.join("\n\n");
  }
  if (record.result) return extractReply(record.result);
  return undefined;
}

export function openClawTurnResult(output: unknown): SendResult {
  const reply = extractReply(output);
  const failed = (value: unknown, depth = 0): boolean => {
    if (!value || typeof value !== "object") return false;
    if (depth > 20) return true;
    const record = value as Record<string, unknown>;
    return !!record.error || [record.status, record.state].some((state) => typeof state === "string" && ["error", "failed", "aborted", "cancelled", "canceled", "timeout", "timed-out"].includes(state.toLowerCase())) || failed(record.result, depth + 1);
  };
  return { state: reply && !failed(output) ? "claimed" : "unknown", ...(reply ? { reply } : {}), metadata: { transport: "openclaw-cli" } };
}

export async function runOpenClaw(args: string[], timeout = 30_000): Promise<unknown> {
  // Execute the JS entry directly on Windows: cmd wrappers interpolate message text.
  const entry = process.env.ORCHESTRATOR_OPENCLAW_ENTRY ?? (process.env.PATH ?? "").split(path.delimiter).map((directory) => path.join(directory, "node_modules", "openclaw", "openclaw.mjs")).find(existsSync);
  if (process.platform === "win32" && !entry) throw new Error("OpenClaw entry not found. Set ORCHESTRATOR_OPENCLAW_ENTRY to openclaw.mjs.");
  const { stdout } = await execFileAsync(process.platform === "win32" ? process.execPath : openclawBinary, process.platform === "win32" ? [entry!, ...args] : args, {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return parseJsonOutput(stdout);
}

const demo: RuntimeAdapter = {
  manifest: {
    id: "demo",
    displayName: "Demo assistant",
    version: "1.0.0",
    capabilities: ["message.send", "work.read", "schedule.read", "knowledge.search", "usage.read", "health.read"],
  },
  async sendMessage(context, body): Promise<SendResult> {
    await new Promise((resolve) => setTimeout(resolve, 480));
    if (body.startsWith("Portal personal brief v1.")) {
      const selected = body.split("Selected context:\n")[1] ?? "null";
      let reply = "The selected context is too large for this synthetic fixture. A live assistant would need a smaller selection.";
      try {
        const context = JSON.parse(selected);
        if (context?.summary) {
          const m = context.summary;
          reply = `Your recorded month\n${m.month}: income ${(m.income / 100).toFixed(2)} ${m.currency}, net spending ${(m.spent / 100).toFixed(2)} ${m.currency}. Transfers are excluded. This does not establish your bank balance.\n\nNext step\nConfirm statement coverage and set a budget baseline from a full prior month. ${context.settings.risk === "unset" ? "Your investment risk preference is still undecided; explore your horizon and capacity for losses before choosing allocation targets." : "Review whether your stated investment horizon and comfort with losses still match your circumstances."}\n\nLimits\nImported values only. No suitability assessment, live quotes or trade recommendation.`;
        } else if (Array.isArray(context) && body.includes("non-clinical reflection")) {
          const g = context[0];
          reply = g ? `What matters\n${g.title}: ${g.why}\n\nYour records\n${g.checkins.reduce((s: number, c: { value: number }) => s + c.value, 0)} ${g.unit} across the shared check-ins; your weekly intention is ${g.weekly}. This selection may not include your full history.\n\nOne experiment\nReserve one short session for the next step and record what made it easier or harder.\n\nReflection\nWhat would you change about the environment around this goal, rather than asking more of your willpower?` : "Choose one personally meaningful goal first. Define a small measure and a weekly intention; a first check-in gives us something concrete to reflect on.";
        } else if (Array.isArray(context)) {
          reply = `Agenda snapshot\n${context.slice(0, 5).map((c: { title: string; date: string; time: string | null }) => `${c.date} ${c.time ?? "All day"}: ${c.title}`).join("\n") || "No open commitments were shared."}\n\nPrepare ahead\nChoose the nearest commitment and write down the outcome you need from it.\n\nFollow-up draft\n${context[0] ? `About ${context[0].title}: could you confirm the next step and any preparation needed?` : "Add the relevant commitment and recipient context before drafting a follow-up."}\n\nThis draft has no recipient and has not been sent. No live calendar was checked.`;
        }
      } catch { /* Explicitly bounded synthetic response, never arbitrary execution. */ }
      return { state: "claimed", reply: `Simulation · no external work performed\n\n${reply}`, remoteId: crypto.randomUUID() };
    }
    if (body.startsWith("Portal project draft v1.")) {
      const input = JSON.parse(body.slice(body.indexOf("\n") + 1)) as { title: string; objective: string; criteria: string; task: string; priorDrafts: unknown[] };
      const stage = input.priorDrafts.length;
      const artifact = stage === 0
        ? `Working plan\n1. Confirm the target audience and the smallest observable result.\n2. Prepare one representative artifact and test it against the criteria.\n3. Compare the result with the baseline and record remaining gaps.\n\nHypothesis: ${input.objective}\n\nAcceptance checks: ${input.criteria}\n\nDependency: access to representative evidence. No evidence collection has been performed.`
        : stage === 1
          ? `Draft evaluation worksheet: ${input.title}\n\nParticipant task: Explain the proposed outcome in your own words.\nBaseline: Record time and interruptions using the current process.\nTrial: Repeat an equivalent task using the proposed workflow.\nMeasures: Completion time, correctness, interventions and confidence.\nInterview: What was unclear? What did you have to do manually? What would make you return?\nDecision rule: Compare observed results with the stated acceptance criteria before expanding scope.\n\nThis is a synthetic research artifact for the demo. A live runtime should tailor its deliverable to your objective.`
          : `Review of the synthetic draft\nCovered: a comparison baseline, observable measures and an interview guide.\nMissing: recruited participants, actual measurements and independent review.\nCorrection: record task equivalence and counterbalance trial order before drawing conclusions.\nAcceptance status: ready for operator inspection, not validated in the field.\n\nCriteria to inspect: ${input.criteria}`;
      return { state: "claimed", reply: `Simulation · no external work performed\n\n${artifact}`, remoteId: crypto.randomUUID() };
    }
    if (context.config.profile && context.config.packet) {
      const presentation = demoAssessment(context.config.profile as AssistantProfile, body, context.config.packet as DecisionPacket);
      const report = /^(Portal briefing|Revise your report|Council)/.test(body);
      return { state: "claimed", reply: report ? presentationText(presentation) : `${presentation.summary}\n\n${presentation.recommendation}\n\nEvidence: launch audience brief and copy review. Simulation; no external action.`, ...(report ? { metadata: { presentation } } : {}) };
    }
    const lower = body.toLowerCase();
    const reply = lower.startsWith("portal briefing request v1")
      ? "Needs you\nChoose the Studio launch positioning. This is the sample workspace's open decision.\n\nWork to follow\nStudio launch is 54% complete. Review the launch copy before the publishing window.\n\nSources\nStudio launch project · Launch copy attention item · synthetic fixtures.\n\nLimits\nThis is a prepared demo brief. No live sources were checked and no source work was changed."
      : lower.startsWith("revise your report")
        ? "Revised demo brief\nThe launch decision remains open. The sample project shows 54% progress; that does not establish readiness to publish.\n\nFollow-up received\n" + body.split("Operator correction:\n").at(-1)!.slice(0, 4000) + "\n\nThis simulation records your follow-up and returns a separate revision. An actual runtime would investigate it against authorized sources."
        : lower.includes("focus") || lower.includes("priority")
      ? "The launch positioning is the only decision blocking other work. I recommend choosing the clearer, outcome-led option; Review both options in Attention to record a simulated choice. No publication or follow-up will be performed."
      : lower.includes("status") || lower.includes("today")
        ? "The sample workspace has three projects and a launch positioning decision. These are synthetic records, not a live health assessment."
        : "Understood. I’ve accepted that request and will keep the work visible here. I’ll bring you back only if a decision, risk, or verification gap needs your attention.";
    return { state: "claimed", reply: `Demo response · no external work performed.\n\n${reply}`, remoteId: crypto.randomUUID() };
  },
  async sync(): Promise<SyncResult> {
    return { status: "connected", latencyMs: 184, events: [] };
  },
};

const openclaw: RuntimeAdapter = {
  manifest: {
    id: "openclaw-cli",
    displayName: "OpenClaw CLI",
    version: "1.0.0",
    capabilities: ["message.send", "work.read", "schedule.read", "usage.read", "health.read"],
  },
  async sendMessage(context, body, sessionKey): Promise<SendResult> {
    const agentId = stringValue(context.config.agentId) ?? "main";
    const args = ["agent", "--agent", agentId, "--message", body, "--json"];
    const configuredSession = sessionKey ?? stringValue(context.config.sessionKey);
    if (configuredSession) args.push("--session-key", configuredSession);
    const output = await runOpenClaw(args, 610_000);
    return openClawTurnResult(output);
  },
  async sync(context): Promise<SyncResult> {
    const startedAt = performance.now();
    const [tasksResult, cronResult, sessionsResult] = await Promise.allSettled([
      runOpenClaw(["tasks", "list", "--json"], 15_000),
      runOpenClaw(["cron", "list", "--all", "--json"], 30_000),
      runOpenClaw(["sessions", "--all-agents", "--active", "1440", "--json"], 20_000),
    ]);
    if (tasksResult.status === "rejected" && cronResult.status === "rejected") throw tasksResult.reason;
    const rawTasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
    const taskList = Array.isArray(rawTasks) ? rawTasks : ((rawTasks as { tasks?: unknown[] } | null)?.tasks ?? []);
    const events: PortalEventInput[] = taskList.slice(0, 100).flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const task = entry as Record<string, unknown>;
      const status = stringValue(task.status) ?? "observed";
      return [{
        id: `openclaw:${context.connectorId}:${contextId(task.id, index)}:${String(task.updatedAt ?? task.status ?? "snapshot")}`,
        source: "OpenClaw",
        kind: `work.${status}`,
        title: stringValue(task.title) ?? stringValue(task.name) ?? `Background task ${index + 1}`,
        summary: stringValue(task.summary) ?? stringValue(task.error) ?? "Reported by OpenClaw.",
        status,
        occurredAt: stringValue(task.updatedAt) ?? stringValue(task.createdAt) ?? new Date().toISOString(),
        metadata: { remoteId: task.id, runtime: task.runtime },
      }];
    });
    const rawSessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
    const sessionList = Array.isArray(rawSessions) ? rawSessions : ((rawSessions as { sessions?: unknown[] } | null)?.sessions ?? []);
    const tokens = sessionList.reduce((total, entry) => {
      if (!entry || typeof entry !== "object") return total;
      const session = entry as Record<string, unknown>;
      const usage = session.usage && typeof session.usage === "object" ? session.usage as Record<string, unknown> : {};
      const reported = Number(session.totalTokens ?? usage.totalTokens ?? 0);
      const components = Number(session.inputTokens ?? usage.inputTokens ?? 0) + Number(session.outputTokens ?? usage.outputTokens ?? 0);
      return total + (Number.isFinite(reported) && reported > 0 ? reported : Number.isFinite(components) ? components : 0);
    }, 0);
    if (tokens > 0) events.push({
      source: "OpenClaw",
      kind: "usage.daily",
      title: "OpenClaw daily usage",
      summary: "Aggregate usage reported by sessions active in the last 24 hours.",
      status: "observed",
      occurredAt: new Date().toISOString(),
      metadata: { tokens: Math.round(tokens), cost: 0, completed: taskList.filter((entry) => (entry as Record<string, unknown> | null)?.status === "succeeded").length, failed: taskList.filter((entry) => (entry as Record<string, unknown> | null)?.status === "failed").length },
    });
    const rawCron = cronResult.status === "fulfilled" ? cronResult.value : [];
    const cronList = Array.isArray(rawCron) ? rawCron : ((rawCron as { jobs?: unknown[] } | null)?.jobs ?? []);
    const recurringTasks = cronList.slice(0, 100).flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const job = entry as Record<string, unknown>;
      const lastState = stringValue(job.lastState) ?? stringValue((job.state as Record<string, unknown> | undefined)?.status) ?? "never";
      const nextRunAt = stringValue(job.nextRunAt);
      return [{
        remoteId: stringValue(job.id) ?? `cron-${index}`,
        title: stringValue(job.name) ?? `Scheduled task ${index + 1}`,
        schedule: stringValue(job.schedule) ?? stringValue(job.cron) ?? "Managed by OpenClaw",
        ...(nextRunAt ? { nextRunAt } : {}),
        lastState: (["succeeded", "running", "failed", "never"].includes(lastState) ? lastState : "never") as "succeeded" | "running" | "failed" | "never",
      }];
    });
    return {
      status: tasksResult.status === "fulfilled" && cronResult.status === "fulfilled" && sessionsResult.status === "fulfilled" ? "connected" : "degraded",
      latencyMs: Math.round(performance.now() - startedAt),
      events,
      recurringTasks,
    };
  },
};

const genericWebhook: RuntimeAdapter = {
  manifest: {
    id: "generic-webhook",
    displayName: "Generic webhook",
    version: "1.0.0",
    capabilities: ["message.send", "health.read"],
  },
  async sendMessage(context, body, sessionKey): Promise<SendResult> {
    const endpoint = stringValue(context.config.endpoint);
    if (!endpoint) throw new Error("Webhook endpoint is not configured");
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Webhook endpoint must be an HTTP(S) URL without embedded credentials");
    const token = stringValue(context.config.token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: body, sessionKey, source: "orchestrator-portal" }),
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      const text = await boundedText(response);
      const data = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text;
      const reply = extractReply(data);
      return { state: reply ? "claimed" : "accepted", ...(reply ? { reply } : {}), metadata: { httpStatus: response.status } };
    } finally {
      clearTimeout(timeout);
    }
  },
  async sync(context): Promise<SyncResult> {
    const endpoint = stringValue(context.config.healthEndpoint) ?? stringValue(context.config.endpoint);
    if (!endpoint) throw new Error("Webhook endpoint is not configured");
    const url = new URL(endpoint);
    const startedAt = performance.now();
    const response = await fetch(url, { method: stringValue(context.config.healthEndpoint) ? "GET" : "OPTIONS", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok && response.status !== 405) throw new Error(`Health check returned HTTP ${response.status}`);
    return { status: "connected", latencyMs: Math.round(performance.now() - startedAt), events: [] };
  },
};

function contextId(value: unknown, fallback: number): string { return typeof value === "string" ? value : String(fallback); }

const hermes: RuntimeAdapter = {
  manifest: { id: "hermes-api", displayName: "Hermes API", version: "1.0.0", capabilities: ["message.send", "health.read"] },
  async sendMessage(context, body) {
    const base = String(context.config.endpoint).replace(/\/$/, "").replace(/\/v1$/, "");
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { "content-type": "application/json", ...(context.config.token ? { authorization: `Bearer ${context.config.token}` } : {}) },
      body: JSON.stringify({ model: stringValue(context.config.model) ?? "hermes-agent", stream: false, messages: [...(context.history ?? []), { role: "user", content: body }] }),
    });
    if (!response.ok) throw new Error(`Hermes returned HTTP ${response.status}`);
    const result = JSON.parse(await boundedText(response));
    const choice = Array.isArray(result?.choices) && result.choices.length === 1 ? result.choices[0] : undefined;
    const reply = choice?.message?.content;
    if (choice?.message?.role !== "assistant" || typeof reply !== "string" || !reply.trim() || choice?.message?.tool_calls?.length || choice?.message?.function_call) return { state: "unknown" };
    return { state: choice.finish_reason === "stop" ? "claimed" : "unknown", reply };
  },
  async sync(context) {
    const base = String(context.config.endpoint).replace(/\/$/, "").replace(/\/v1$/, "");
    const started = performance.now();
    const response = await fetch(`${base}/v1/models`, { headers: context.config.token ? { authorization: `Bearer ${context.config.token}` } : {}, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Hermes health returned HTTP ${response.status}`);
    const data = JSON.parse(await boundedText(response));
    if (!Array.isArray(data.data)) throw new Error("Hermes did not return a model catalog");
    return { status: "connected", latencyMs: Math.round(performance.now() - started), events: [] };
  },
};

const gbrain: RuntimeAdapter = {
  manifest: { id: "gbrain-cli", displayName: "gbrain knowledge", version: "1.0.0", capabilities: ["knowledge.search", "health.read"] },
  async sync() {
    const started = performance.now();
    await execFileAsync(process.platform === "win32" ? "gbrain.exe" : "gbrain", ["--version"], { timeout: 10000, maxBuffer: 65536, windowsHide: true });
    return { status: "connected", latencyMs: Math.round(performance.now() - started), events: [] };
  },
};

export async function searchGbrain(query: string) {
  if (query.trimStart().startsWith("-")) throw new Error("Search must start with a word, not a CLI option");
  const { stdout } = await execFileAsync(process.platform === "win32" ? "gbrain.exe" : "gbrain", ["search", query, "--json"], { timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
  const output = parseJsonOutput(stdout);
  const rows = Array.isArray(output) ? output : (output as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(rows)) throw new Error("Unsupported gbrain search response");
  return rows.slice(0, 20).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    return [{ id: String(row.slug ?? row.id ?? ""), title: String(row.title ?? row.slug ?? "Untitled"), excerpt: String(row.snippet ?? row.content ?? row.excerpt ?? ""), source: "gbrain", uri: `gbrain:${String(row.slug ?? row.id ?? "")}`, score: Number(row.score) || 0 }];
  });
}

const t3: RuntimeAdapter = {
  manifest: { id: "t3-workspace", displayName: "T3 Code workspace", version: "1.0.0", capabilities: ["health.read"] },
  async sync(context) {
    const started = performance.now();
    const response = await fetch(String(context.config.endpoint), { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Workspace returned HTTP ${response.status}`);
    await response.body?.cancel();
    return { status: "connected", latencyMs: Math.round(performance.now() - started), events: [] };
  },
};

export const runtimeAdapters = new Map<string, RuntimeAdapter>([
  [demo.manifest.id, demo],
  [openclaw.manifest.id, openclaw],
  [genericWebhook.manifest.id, genericWebhook],
  [hermes.manifest.id, hermes],
  [compatibleApi.manifest.id, compatibleApi],
  [gbrain.manifest.id, gbrain],
  [t3.manifest.id, t3],
]);

export function publicAdapterCatalog() {
  return [...runtimeAdapters.values()].filter((adapter) => adapter.manifest.id !== "demo").map((adapter) => adapter.manifest);
}
