import { z } from "zod";
export * from "./assistant-catalog.js";
import type { AssistantMode, ReportPresentation } from "./assistant-catalog.js";

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  now: z.string(),
});

export const capabilitySchema = z.enum([
  "message.send",
  "message.stream",
  "work.read",
  "work.cancel",
  "schedule.read",
  "knowledge.search",
  "knowledge.read",
  "usage.read",
  "health.read",
]);
export type Capability = z.infer<typeof capabilitySchema>;

export const connectorKindSchema = z.enum([
  "demo",
  "openclaw-cli",
  "generic-webhook",
  "markdown-directory",
  "obsidian-vault",
  "notion",
  "hermes-api",
  "gbrain-cli",
  "t3-workspace",
]);
export type ConnectorKind = z.infer<typeof connectorKindSchema>;

export const connectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: connectorKindSchema,
  status: z.enum(["connected", "degraded", "disconnected", "syncing"]),
  capabilities: z.array(capabilitySchema),
  lastSyncAt: z.string().nullable(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
});
export type Connector = z.infer<typeof connectorSchema>;

export const receiptStateSchema = z.enum([
  "claimed",
  "accepted",
  "committed",
  "observed",
  "verified",
  "failed",
  "unknown",
]);
export type ReceiptState = z.infer<typeof receiptStateSchema>;

export const messageSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  body: z.string(),
  state: receiptStateSchema,
  createdAt: z.string(),
  correlationId: z.string().nullable(),
});
export type Message = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  connectorId: z.string().min(1),
  body: z.string().trim().min(1).max(20_000),
  sessionKey: z.string().trim().max(240).optional(),
});

export const createConnectorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: connectorKindSchema.exclude(["demo"]),
  config: z.record(z.string(), z.unknown()),
});

export const portalEventSchema = z.object({
  id: z.string().optional(),
  source: z.string().min(1).max(100),
  kind: z.string().min(1).max(100),
  title: z.string().min(1).max(240),
  summary: z.string().max(4_000).default(""),
  status: z.string().max(60).default("observed"),
  occurredAt: z.iso.datetime().optional(),
  projectId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type PortalEventInput = z.infer<typeof portalEventSchema>;

export const setupSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(256),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export const dashboardLayoutSchema = z.object({
  widgets: z.array(
    z.object({
      id: z.string(),
      visible: z.boolean(),
      size: z.enum(["compact", "wide", "tall"]),
    }),
  ).min(1).max(24),
});
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

export const attentionSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string(),
  detail: z.string(),
  source: z.string(),
  createdAt: z.string(),
  dueAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});
export type AttentionItem = z.infer<typeof attentionSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["on-track", "at-risk", "blocked", "complete"]),
  health: z.number().min(0).max(100),
  progress: z.number().min(0).max(100),
  dueAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const recurringTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  schedule: z.string(),
  nextRunAt: z.string().nullable(),
  lastState: z.enum(["succeeded", "running", "failed", "never"]),
  connectorId: z.string(),
});
export type RecurringTask = z.infer<typeof recurringTaskSchema>;

export const insightPointSchema = z.object({
  date: z.string(),
  tokens: z.number(),
  cost: z.number(),
  completed: z.number(),
  failed: z.number(),
  latencyMs: z.number(),
});
export type InsightPoint = z.infer<typeof insightPointSchema>;

export const assistantProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(10).max(2000),
  connectorId: z.string().min(1),
  cadence: z.enum(["manual", "daily", "weekly"]),
  providerPolicy: z.enum(["subscription", "local", "metered"]),
  spendingLimit: z.number().min(0).max(1000).default(0),
  scope: z.array(z.string().min(1)).max(20).default([]),
  criteria: z.string().trim().min(5).max(1000),
  runtimePolicyConfirmed: z.boolean(),
}).strict();
export type AssistantProfileInput = z.infer<typeof assistantProfileSchema>;
export type AssistantProfile = AssistantProfileInput & {
  id: string; state: "ready" | "paused" | "running" | "unknown";
  lastRunAt: string | null; nextExpectedAt: string | null; createdAt: string;
  templateId?: string; templateVersion?: number; mode?: AssistantMode; icon?: number; autoReview?: boolean;
};
export const councilRequestSchema = z.object({
  question: z.string().trim().min(10).max(4000),
  assistantIds: z.array(z.string()).min(2).max(3).refine((ids) => new Set(ids).size === ids.length, "Choose distinct assistants"),
  shareContext: z.literal(true),
}).strict();
export interface Report {
  id: string; assistantId: string; title: string; body: string;
  state: ReceiptState; criteria: string; createdAt: string;
  review: "unreviewed" | "useful" | "needs-work" | "disputed";
  correction: string; source: string;
  presentation?: ReportPresentation; revisionOf?: string; templateId?: string; supersededBy?: string; mode?: AssistantMode;
}
export interface Council {
  id: string; question: string; state: string; createdAt: string;
  contributions: Array<{ assistantId: string; name: string; body: string; state: ReceiptState }>;
  synthesis: string;
}
export const watchInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  query: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
}).strict();
export type Watch = z.infer<typeof watchInputSchema> & { id: string };
export * from "./personal.js";
