// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import type { PhonePilot, ObserveOptions, Observation, Selector, WaitOptions, WaitResult, ActionMethod, ActionParameters, MutationReceipt } from './pilot.mjs';
export type TaskState = 'running' | 'action_requested' | 'dispatch_acknowledged' | 'rejected' | 'outcome_unknown' | 'handoff_required' | 'awaiting_verification' | 'failed';
export type HandoffReason = 'owner_decision' | 'protected_surface' | 'verification_required' | 'cancelled' | 'budget_exhausted' | 'reconciliation_required';
export interface TaskCheckpoint {
  version: 1; id: string; taskId: string; state: TaskState; sequence: number; updatedAt: string;
  actions: { requestId: string; method: ActionMethod; status: 'pending' | 'completed' | 'rejected' | 'unknown' }[];
  model: { calls: number; reservedTokens: number; reservedCostMicros: number }; handoff?: HandoffReason;
}
export interface SourceTaskBudget { timeoutMs?: number; maxModelCalls?: number; maxModelTokens?: number; maxModelCostMicros?: number }
export interface SourceTaskOutcome { taskId: string; status: 'awaiting_verification'; evidence: 'source_reported'; independentlyVerified: false }
export function readTaskCheckpoint(path: string): Readonly<TaskCheckpoint>;
export class SourcePhoneTask {
  constructor(options: { pilot: PhonePilot; checkpointFile: string; id?: string; onEvent?: (event: { type: TaskState; taskId: string; sequence: number; evidence: 'source_reported' }) => void; budget?: SourceTaskBudget });
  readonly checkpoint: Readonly<TaskCheckpoint>; readonly signal: AbortSignal;
  observe(options?: Omit<ObserveOptions, 'signal'>): Promise<Observation>;
  waitFor(selector: Selector, options?: Omit<WaitOptions, 'signal'>): Promise<WaitResult>;
  act<M extends ActionMethod>(method: M, params: ActionParameters[M]): Promise<MutationReceipt>;
  model<T>(reservation: { maxTokens: number; maxCostMicros?: number }, invoke: (options: { signal: AbortSignal; maxTokens: number; maxCostMicros: number }) => T | Promise<T>): Promise<T>;
  handoff(reason?: HandoffReason): Readonly<TaskCheckpoint>;
  finish(): Readonly<SourceTaskOutcome>;
  cancel(): Promise<{ stop: MutationReceipt; checkpointPersisted: boolean }>;
}
export function inspectTaskCheckpoint(options: { pilot: PhonePilot; checkpointFile: string }): Promise<Readonly<{ taskId: string; actions: { requestId: string; status: 'completed' | 'rejected' | 'unknown' | 'unconfirmed' }[]; reconciliation: 'status_only'; resumeAllowed: false; independentlyVerified: false }>>;
