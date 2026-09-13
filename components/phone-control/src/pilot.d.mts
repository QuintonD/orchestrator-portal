// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
export interface Bounds { left: number; top: number; right: number; bottom: number }
export type NodeAction = 'click' | 'longClick' | 'scrollForward' | 'scrollBackward' | 'setText';
export interface PhoneNode {
  id: string; bounds: Bounds; editable: boolean; clickable: boolean;
  text?: string; description?: string; resourceId?: string; className?: string; stateDescription?: string; hintText?: string;
  enabled?: boolean; scrollable?: boolean; checkable?: boolean; selected?: boolean; checkedState?: 'unchecked' | 'checked' | 'mixed'; actions?: NodeAction[];
}
export type Selector = Partial<Omit<PhoneNode, 'id' | 'bounds' | 'actions'>> & { action?: NodeAction };
export interface Observation {
  observationId: string; packageName: string; windowId: number | string; width: number; height: number; capturedAt: string; nodes: PhoneNode[];
  touchBounds?: Bounds; screenshot?: { mimeType: 'image/png'; base64: string };
}
export interface ActionParameters {
  'app.launch': { packageName: string }; tap: { x: number; y: number };
  longPress: { x: number; y: number; durationMs: number }; swipe: { points: { x: number; y: number }[]; durationMs: number };
  pinch: { centerX: number; centerY: number; scale: number; durationMs: number };
  'node.click': { nodeId: string }; 'node.scroll': { nodeId: string; direction: 'forward' | 'backward' };
  type: { nodeId: string; text: string }; key: { key: 'back' | 'home' }; 'fixture.increment': Record<string, never>;
}
export type ActionMethod = keyof ActionParameters;
export type MutationReceipt = { id: string; status: 'completed'; result: { status: 'dispatched' | 'completed' | 'stopped' } }
  | { id: string; status: 'rejected' | 'unknown'; error?: { code: string; message: string } };
export interface TaskLease {
  id: string; deviceId: string; sessionId: string; status: 'active' | 'completed' | 'expired' | 'revoked' | 'interrupted'; expiresAt: string; maxActions: number; actionsUsed: number;
}
export interface PilotBudget { maxActions?: number; maxObservations?: number; timeoutMs?: number }
export interface ObserveOptions { includeScreenshot?: boolean; timeoutMs?: number; signal?: AbortSignal }
export interface WaitOptions { timeoutMs?: number; maxObservations?: number; intervalMs?: number; stableObservations?: number; maxTransientFailures?: number; signal?: AbortSignal }
export interface WaitResult { observation: Observation; node: PhoneNode; observations: number; recoveries: { observation: number; code: string }[]; elapsedMs: number }
export interface Reconciliation {
  receipt: { id: string; status: 'completed' | 'rejected' | 'unknown'; error?: { code: string; message: string } }; reconciliation: 'status_only'; resumeAllowed: false;
}
export function selectNode(observation: Observation, selector: Selector): PhoneNode;
export class PhonePilot {
  constructor(options: { port?: number; secret: string; deviceId: string; sessionId: string; taskId?: string; brokerPublicKey?: string; fetchImpl?: typeof fetch; budget?: PilotBudget });
  readonly uncertain: boolean; readonly observation: Observation | undefined; readonly task: Readonly<Partial<TaskLease> & { id: string }> | undefined;
  readonly usage: { actions: number; observations: number; elapsedMs: number; limits: Required<PilotBudget> };
  observe(options?: ObserveOptions): Promise<Observation>;
  waitFor(selector: Selector, options?: WaitOptions): Promise<WaitResult>;
  act<M extends ActionMethod>(method: M, params: ActionParameters[M], options?: { signal?: AbortSignal; requestId?: string }): Promise<MutationReceipt>;
  acquireTask(options?: { ttlSeconds?: number; maxActions?: number; label?: string }): Promise<TaskLease>;
  taskStatus(): Promise<TaskLease>;
  releaseTask(): Promise<unknown>;
  actionStatus(requestId: string): Promise<Reconciliation>;
  stop(): Promise<MutationReceipt>;
}
