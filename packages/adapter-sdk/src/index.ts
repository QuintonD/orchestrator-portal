import type { Capability, PortalEventInput, ReceiptState } from "@orchestrator/contracts";

export interface AdapterManifest {
  id: string;
  displayName: string;
  version: string;
  capabilities: Capability[];
}

export interface AdapterContext {
  connectorId: string;
  config: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SendResult {
  state: ReceiptState;
  reply?: string;
  remoteId?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  status: "connected" | "degraded";
  latencyMs: number;
  events: PortalEventInput[];
  recurringTasks?: Array<{
    remoteId: string;
    title: string;
    schedule: string;
    nextRunAt?: string;
    lastState: "succeeded" | "running" | "failed" | "never";
  }>;
}

export interface RuntimeAdapter {
  manifest: AdapterManifest;
  sendMessage?(context: AdapterContext, body: string, sessionKey?: string): Promise<SendResult>;
  sync(context: AdapterContext): Promise<SyncResult>;
}

export interface KnowledgeHit {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  score: number;
  uri?: string;
  updatedAt?: string;
}

export interface KnowledgeProvider {
  manifest: AdapterManifest;
  search(context: AdapterContext, query: string, limit: number): Promise<KnowledgeHit[]>;
}

export interface VerifierAdapter {
  manifest: AdapterManifest;
  verify(context: AdapterContext, event: PortalEventInput): Promise<{
    state: "verified" | "failed" | "unknown";
    evidence?: Record<string, unknown>;
  }>;
}
