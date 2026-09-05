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
  if (typeof value === "string") return value;
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
  async sendMessage(_context, body): Promise<SendResult> {
    await new Promise((resolve) => setTimeout(resolve, 480));
    const lower = body.toLowerCase();
    const reply = lower.includes("focus") || lower.includes("priority")
      ? "The launch positioning is the only decision blocking other work. I recommend choosing the clearer, outcome-led option; I can then publish the supporting updates and handle the follow-ups."
      : lower.includes("status") || lower.includes("today")
        ? "Today is healthy overall: 8 tasks completed, 2 running, and one decision needs you. Inbox triage is current and no security issues are open."
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
    return {
      state: output ? "claimed" : "unknown",
      reply: extractReply(output) ?? "OpenClaw completed the turn, but this version did not return a displayable text reply.",
      metadata: { transport: "openclaw-cli" },
    };
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

export async function boundedText(response: Response, maximum = 1024 * 1024): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error("Source response exceeds the 1 MiB limit"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

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
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string") return { state: "unknown" };
    return { state: "claimed", reply };
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
  [gbrain.manifest.id, gbrain],
  [t3.manifest.id, t3],
]);

export function publicAdapterCatalog() {
  return [...runtimeAdapters.values()].filter((adapter) => adapter.manifest.id !== "demo").map((adapter) => adapter.manifest);
}
