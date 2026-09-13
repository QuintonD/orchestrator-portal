// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PhonePilot } from './pilot.mjs';
import { assertPrivate, writePrivate } from './security.mjs';
import { Fault, identifier, number, object, requireThat, captureRecovery, MUTATIONS } from './validation.mjs';

const states = ['running', 'action_requested', 'dispatch_acknowledged', 'rejected', 'outcome_unknown', 'handoff_required', 'awaiting_verification', 'failed'];
const reasons = ['owner_decision', 'protected_surface', 'verification_required', 'cancelled', 'budget_exhausted', 'reconciliation_required'];
function immutable(value) { return Object.freeze(structuredClone(value)); }
function validateCheckpoint(value) {
  object(value, ['version', 'id', 'taskId', 'state', 'sequence', 'updatedAt', 'actions', 'model', 'handoff'], ['version', 'id', 'taskId', 'state', 'sequence', 'updatedAt', 'actions', 'model']);
  requireThat(value.version === 1 && states.includes(value.state), 'checkpoint_invalid'); identifier(value.id); identifier(value.taskId); number(value.sequence, 0, 10_000);
  requireThat(Number.isFinite(Date.parse(value.updatedAt)) && Array.isArray(value.actions) && value.actions.length <= 100, 'checkpoint_invalid');
  for (const action of value.actions) {
    object(action, ['requestId', 'method', 'status']); identifier(action.requestId);
    requireThat(MUTATIONS.has(action.method) && action.method !== 'stop' && ['pending', 'completed', 'rejected', 'unknown'].includes(action.status), 'checkpoint_invalid');
  }
  object(value.model, ['calls', 'reservedTokens', 'reservedCostMicros']);
  for (const count of Object.values(value.model)) number(count, 0, Number.MAX_SAFE_INTEGER);
  if (value.handoff !== undefined) requireThat(reasons.includes(value.handoff), 'checkpoint_invalid');
  return value;
}
export function readTaskCheckpoint(path) {
  const file = resolve(path); assertPrivate(file); requireThat(statSync(file).size <= 64 * 1024, 'checkpoint_invalid');
  try { return immutable(validateCheckpoint(JSON.parse(readFileSync(file, 'utf8')))); }
  catch { throw new Fault('checkpoint_invalid', 409); }
}

/**
 * Runs inside a source runtime. This is a library, not a sandbox or a model host.
 * Checkpoints never contain observations, model prompts, action parameters or credentials.
 * Existing checkpoints are inspection-only: a new run needs fresh authority and a new file.
 */
export class SourcePhoneTask {
  #pilot; #file; #checkpoint; #controller = new AbortController(); #signal; #onEvent; #busy = false; #started = performance.now(); #limits; #failed = false;
  constructor({ pilot, checkpointFile, id = randomUUID(), onEvent = () => {}, budget = {} }) {
    requireThat(pilot instanceof PhonePilot && pilot.task, 'task_required'); identifier(id);
    requireThat(typeof checkpointFile === 'string' && typeof onEvent === 'function');
    object(budget, ['timeoutMs', 'maxModelCalls', 'maxModelTokens', 'maxModelCostMicros'], []);
    this.#limits = { timeoutMs: 300_000, maxModelCalls: 20, maxModelTokens: 50_000, maxModelCostMicros: 1_000_000, ...budget };
    number(this.#limits.timeoutMs, 1, 3_600_000); number(this.#limits.maxModelCalls, 0, 1000); number(this.#limits.maxModelTokens, 0, 10_000_000); number(this.#limits.maxModelCostMicros, 0, 1_000_000_000);
    this.#file = resolve(checkpointFile); assertPrivate(dirname(this.#file));
    requireThat(!existsSync(this.#file), 'task_reconciliation_required', 409);
    this.#pilot = pilot; this.#onEvent = onEvent;
    this.#started = performance.now(); this.#signal = AbortSignal.any([this.#controller.signal, AbortSignal.timeout(this.#limits.timeoutMs)]);
    this.#checkpoint = { version: 1, id, taskId: pilot.task.id, state: 'running', sequence: 0, updatedAt: new Date().toISOString(), actions: [], model: { calls: 0, reservedTokens: 0, reservedCostMicros: 0 } };
    writePrivate(this.#file, JSON.stringify(this.#checkpoint), { exclusive: true });
  }
  get checkpoint() { return immutable(this.#checkpoint); }
  get signal() { return this.#signal; }
  #check() {
    requireThat(!this.#failed, 'task_closed', 409);
    requireThat(!this.#controller.signal.aborted, 'request_cancelled', 409);
    requireThat(performance.now() - this.#started < this.#limits.timeoutMs, 'task_time_budget_exhausted', 408);
  }
  #record(state, fields = {}) {
    this.#checkpoint = { ...this.#checkpoint, ...fields, state, sequence: this.#checkpoint.sequence + 1, updatedAt: new Date().toISOString() };
    validateCheckpoint(this.#checkpoint);
    try { writePrivate(this.#file, JSON.stringify(this.#checkpoint)); }
    catch { this.#failed = true; throw new Fault('checkpoint_unavailable', 503); }
    // UI listeners are advisory; their failures cannot change recorded dispatch history.
    try { void Promise.resolve(this.#onEvent(immutable({ type: state, taskId: this.#checkpoint.taskId, sequence: this.#checkpoint.sequence, evidence: 'source_reported', ...fields }))).catch(() => {}); } catch { /* The checkpoint remains authoritative for this helper. */ }
  }
  async #exclusive(operation, read = false) {
    this.#check(); requireThat(!this.#busy, 'task_busy', 409); this.#busy = true;
    let result;
    try { result = await operation(); if (!this.#failed) this.#check(); return result; }
    catch (error) {
      if (read && result && error instanceof Fault) {
        const recovery = result.captureRecovery ?? result.observation?.captureRecovery;
        if (recovery) error.details = { captureRecovery: captureRecovery(recovery) };
        if (result.recoveries?.length) error.recoveries = Object.freeze(result.recoveries.slice(0, 30).map((item) => Object.freeze({ observation: item.observation, code: item.code, ...(item.captureRecovery ? { captureRecovery: Object.freeze(captureRecovery(item.captureRecovery)) } : {}) })));
      }
      throw error;
    } finally { this.#busy = false; }
  }
  observe(options = {}) { return this.#exclusive(() => this.#pilot.observe({ ...options, signal: this.signal }), true); }
  waitFor(selector, options = {}) { return this.#exclusive(() => this.#pilot.waitFor(selector, { ...options, signal: this.signal }), true); }
  act(method, params) {
    requireThat(MUTATIONS.has(method) && method !== 'stop', 'invalid_action');
    return this.#exclusive(async () => {
      const requestId = randomUUID();
      const action = { requestId, method, status: 'pending' };
      requireThat(this.#checkpoint.actions.length < 100, 'task_action_budget_exhausted', 409);
      this.#record('action_requested', { actions: [...this.#checkpoint.actions, action] });
      let receipt;
      try { receipt = await this.#pilot.act(method, params, { signal: this.signal, requestId }); }
      catch (error) {
        const unknown = this.#pilot.uncertain;
        action.status = unknown ? 'unknown' : 'rejected';
        this.#record(unknown ? 'outcome_unknown' : 'rejected', { actions: [...this.#checkpoint.actions.slice(0, -1), action] });
        if (unknown) this.#failed = true;
        throw error;
      }
      action.status = receipt.status;
      this.#record(receipt.status === 'completed' ? 'dispatch_acknowledged' : receipt.status === 'unknown' ? 'outcome_unknown' : 'rejected', { actions: [...this.#checkpoint.actions.slice(0, -1), action] });
      if (receipt.status === 'unknown') this.#failed = true;
      return receipt;
    });
  }
  /** Reserve worst-case model usage before calling the source's provider. No automatic retry or refunds. */
  model({ maxTokens, maxCostMicros = 0 }, invoke) {
    number(maxTokens, 1, 1_000_000); number(maxCostMicros, 0, 1_000_000_000); requireThat(typeof invoke === 'function');
    return this.#exclusive(async () => {
      const used = this.#checkpoint.model;
      requireThat(used.calls < this.#limits.maxModelCalls && used.reservedTokens + maxTokens <= this.#limits.maxModelTokens && used.reservedCostMicros + maxCostMicros <= this.#limits.maxModelCostMicros, 'task_model_budget_exhausted', 409);
      this.#record('running', { model: { calls: used.calls + 1, reservedTokens: used.reservedTokens + maxTokens, reservedCostMicros: used.reservedCostMicros + maxCostMicros } });
      this.#check(); const signal = this.signal;
      let abort;
      try {
        return await Promise.race([Promise.resolve().then(() => { this.#check(); return invoke({ signal, maxTokens, maxCostMicros }); }), new Promise((_, reject) => {
          abort = () => reject(new Fault(this.#controller.signal.aborted ? 'request_cancelled' : 'task_time_budget_exhausted', 408)); signal.addEventListener('abort', abort, { once: true });
        })]);
      } finally { signal.removeEventListener('abort', abort); }
    });
  }
  handoff(reason = 'owner_decision') {
    requireThat(!this.#busy, 'task_busy', 409); requireThat(reasons.includes(reason), 'invalid_handoff'); this.#record('handoff_required', { handoff: reason }); this.#failed = true;
    return this.checkpoint;
  }
  /** A source cannot turn its own success assertion or a dispatch receipt into independent verification. */
  finish() {
    this.#check(); requireThat(!this.#busy && !this.#pilot.uncertain, 'task_reconciliation_required', 409);
    this.#record('awaiting_verification', { handoff: 'verification_required' }); this.#failed = true;
    return immutable({ taskId: this.#checkpoint.taskId, status: 'awaiting_verification', evidence: 'source_reported', independentlyVerified: false });
  }
  async cancel() {
    this.#controller.abort();
    let checkpointPersisted = true;
    try { if (!this.#failed) this.#record('handoff_required', { handoff: 'cancelled' }); } catch { checkpointPersisted = false; }
    this.#failed = true; return { stop: await this.#pilot.stop(), checkpointPersisted };
  }
}

/** Inspection never resends checkpointed actions or creates replacement authority. */
export async function inspectTaskCheckpoint({ pilot, checkpointFile }) {
  requireThat(pilot instanceof PhonePilot); const checkpoint = readTaskCheckpoint(checkpointFile); const actions = [];
  for (const action of checkpoint.actions) {
    try { actions.push({ requestId: action.requestId, status: (await pilot.actionStatus(action.requestId)).receipt.status }); }
    catch { actions.push({ requestId: action.requestId, status: 'unconfirmed' }); }
  }
  return immutable({ taskId: checkpoint.taskId, actions, reconciliation: 'status_only', resumeAllowed: false, independentlyVerified: false });
}
