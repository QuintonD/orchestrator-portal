// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { createClient, isDefiniteRejection } from './client.mjs';
import { Fault, identifier, packageName, number, object, requireThat, validateCall, MUTATIONS } from './validation.mjs';

const selectorFields = ['resourceId', 'className', 'text', 'description', 'hintText', 'stateDescription', 'enabled', 'editable', 'clickable', 'scrollable', 'checkable', 'checkedState', 'selected', 'action'];
const booleans = new Set(['enabled', 'editable', 'clickable', 'scrollable', 'checkable', 'selected']);
const actions = ['click', 'longClick', 'scrollForward', 'scrollBackward', 'setText'];
const transientReadErrors = new Set(['broker_unavailable', 'device_busy', 'screenshot_geometry_changed', 'screenshot_invalid_window', 'screenshot_invalid_display', 'screenshot_rate_limited', 'screenshot_timeout']);
const errorCodes = new Set(['outcome_unknown', 'unauthorized', 'session_expired', 'scope_forbidden', 'operation_forbidden', 'app_forbidden', 'device_busy', 'device_outcome_unknown', 'stale_observation', 'observation_expired', 'out_of_bounds', 'node_unavailable', 'node_not_editable', 'node_not_clickable', 'node_not_scrollable', 'consent_denied', 'consent_timeout', 'consent_unavailable', 'biometric_unavailable', 'device_locked', 'secure_window', 'blocked_app', 'stopped', 'deadline_expired', 'rate_limited', 'persistence_unavailable', 'screenshot_rate_limited', 'screenshot_secure_window', 'screenshot_invalid_window', 'screenshot_invalid_display', 'screenshot_access_denied', 'screenshot_geometry_changed', 'screenshot_too_large', 'screenshot_timeout', 'screenshot_internal_error', 'screenshot_unavailable']);
function projectedError(value, fallback) {
  const code = errorCodes.has(value?.code) ? value.code : fallback;
  return { code, message: code.replaceAll('_', ' ') };
}
function projectedView(value, includeScreenshot) {
  try {
    requireThat(value && !value.blockedReason); identifier(value.observationId); packageName(value.packageName);
    requireThat(Number.isInteger(value.windowId) || typeof value.windowId === 'string' && value.windowId.length <= 128);
    number(value.width, 1, 16384); number(value.height, 1, 16384);
    const captured = Date.parse(value.capturedAt);
    requireThat(Number.isFinite(captured) && captured <= Date.now() + 5000 && Date.now() - captured <= 30_000);
    const rectangle = (bounds) => {
      object(bounds, ['left', 'top', 'right', 'bottom']); number(bounds.left, 0, value.width); number(bounds.top, 0, value.height); number(bounds.right, bounds.left, value.width); number(bounds.bottom, bounds.top, value.height);
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    };
    requireThat(Array.isArray(value.nodes) && value.nodes.length <= 1000); const ids = new Set();
    const nodes = value.nodes.map((node) => {
      identifier(node.id); requireThat(!ids.has(node.id)); ids.add(node.id);
      requireThat(typeof node.editable === 'boolean' && typeof node.clickable === 'boolean');
      const result = { id: node.id, bounds: rectangle(node.bounds), editable: node.editable, clickable: node.clickable };
      for (const field of ['text', 'description', 'resourceId', 'className', 'stateDescription', 'hintText']) if (node[field] !== undefined) {
        requireThat(typeof node[field] === 'string' && node[field].length <= (['text', 'description'].includes(field) ? 16384 : 256)); result[field] = node[field];
      }
      for (const field of ['enabled', 'scrollable', 'checkable', 'selected']) if (node[field] !== undefined) { requireThat(typeof node[field] === 'boolean'); result[field] = node[field]; }
      if (node.checkedState !== undefined) { requireThat(['unchecked', 'checked', 'mixed'].includes(node.checkedState)); result.checkedState = node.checkedState; }
      if (node.actions !== undefined) { requireThat(Array.isArray(node.actions) && node.actions.length <= 5 && new Set(node.actions).size === node.actions.length && node.actions.every((action) => actions.includes(action))); result.actions = [...node.actions]; }
      return result;
    });
    const result = { observationId: value.observationId, packageName: value.packageName, windowId: value.windowId, width: value.width, height: value.height, capturedAt: new Date(captured).toISOString(), nodes };
    if (value.touchBounds !== undefined) {
      const bounds = rectangle(value.touchBounds); requireThat(Object.values(bounds).every((point) => point === 0) || bounds.right > bounds.left && bounds.bottom > bounds.top); result.touchBounds = bounds;
    }
    if (includeScreenshot && value.screenshot !== undefined) {
      const screenshot = value.screenshot; requireThat(screenshot?.mimeType === 'image/png' && typeof screenshot.base64 === 'string' && screenshot.base64.length <= 7 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/u.test(screenshot.base64));
      requireThat(Buffer.from(screenshot.base64, 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))); result.screenshot = { mimeType: 'image/png', base64: screenshot.base64 };
    }
    return result;
  } catch { throw new Fault('invalid_observation', 502); }
}
function validateSelector(selector) {
  object(selector, selectorFields, []);
  requireThat(Object.keys(selector).length > 0, 'selector_required');
  for (const [key, value] of Object.entries(selector)) {
    if (booleans.has(key)) requireThat(typeof value === 'boolean', 'invalid_selector');
    else if (key === 'action') requireThat(actions.includes(value), 'invalid_selector');
    else if (key === 'checkedState') requireThat(['unchecked', 'checked', 'mixed'].includes(value), 'invalid_selector');
    else requireThat(typeof value === 'string' && value.length > 0 && value.length <= 256, 'invalid_selector');
  }
}
function matches(node, selector) {
  return Object.entries(selector).every(([key, value]) => key === 'action' ? node.actions?.includes(value) === true : node[key] === value);
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
/** Exact conjunction only: no arbitrary predicates, regex, first-match guessing or screen instructions. */
export function selectNode(observation, selector) {
  validateSelector(selector);
  const view = projectedView(observation, false);
  const found = view.nodes.filter((node) => matches(node, selector));
  requireThat(found.length === 1, found.length ? 'selector_ambiguous' : 'selector_not_found', 409);
  return found[0];
}

/** Source-owned helper; the source runtime supplies decisions and independently verifies effects. */
export class PhonePilot {
  #port; #secret; #fetch; #deviceId; #sessionId; #publicKey; #task; #busy = false; #closed = false; #uncertain = false; #view; #stopPromise;
  #started = performance.now(); #actions = 0; #observations = 0; #limits; #stopController = new AbortController();
  constructor({ port = 4421, secret, deviceId, sessionId, taskId, brokerPublicKey, fetchImpl = fetch, budget = {} }) {
    number(port, 1024, 65535); identifier(deviceId); identifier(sessionId);
    requireThat(typeof secret === 'string' && secret.length >= 24 && secret.length <= 256 && !/\s/u.test(secret), 'token_required');
    object(budget, ['maxActions', 'maxObservations', 'timeoutMs'], []);
    const limits = { maxActions: 100, maxObservations: 100, timeoutMs: 300_000, ...budget };
    number(limits.maxActions, 1, 100); number(limits.maxObservations, 1, 1000); number(limits.timeoutMs, 1, 3_600_000);
    if (taskId !== undefined) { identifier(taskId); this.#task = freeze({ id: taskId }); }
    createClient({ port, secret, brokerPublicKey, fetchImpl });
    this.#publicKey = brokerPublicKey; this.#limits = limits;
    this.#port = port; this.#secret = secret; this.#fetch = fetchImpl; this.#deviceId = deviceId; this.#sessionId = sessionId;
  }
  get uncertain() { return this.#uncertain; }
  get observation() { return this.#view; }
  get task() { return this.#task; }
  get usage() { return freeze({ actions: this.#actions, observations: this.#observations, elapsedMs: Math.ceil(performance.now() - this.#started), limits: { ...this.#limits } }); }
  #remaining(signal) {
    requireThat(!this.#closed, 'session_closed', 409);
    requireThat(signal === undefined || signal instanceof AbortSignal, 'invalid_signal');
    requireThat(!signal?.aborted, 'request_cancelled', 409);
    const remaining = Math.floor(this.#limits.timeoutMs - (performance.now() - this.#started));
    requireThat(remaining > 0, 'task_time_budget_exhausted', 408); return remaining;
  }
  #client(timeoutMs) { return createClient({ port: this.#port, secret: this.#secret, brokerPublicKey: this.#publicKey, fetchImpl: this.#fetch, timeoutMs }); }
  async #request(method, params, timeoutMs, { signal, requestId = randomUUID() } = {}) {
    const mutation = MUTATIONS.has(method) && method !== 'stop';
    const input = { id: requestId, deviceId: this.#deviceId, sessionId: this.#sessionId, ...(mutation && this.#task ? { taskId: this.#task.id } : {}), method, params };
    validateCall(input);
    if (method !== 'stop') {
      timeoutMs = Math.min(timeoutMs, this.#remaining(signal));
      if (mutation) { requireThat(this.#actions < this.#limits.maxActions, 'task_action_budget_exhausted', 409); this.#actions++; }
      else { requireThat(this.#observations < this.#limits.maxObservations, 'task_observation_budget_exhausted', 409); this.#observations++; }
    }
    const request = this.#client(timeoutMs);
    try {
      const receipt = await request('/v1/call', 'POST', input, { signal });
      requireThat(receipt?.id === input.id && ['observed', 'completed', 'rejected', 'unknown'].includes(receipt.status), 'receipt_invalid', 502);
      const result = { id: receipt.id, status: receipt.status };
      if (['rejected', 'unknown'].includes(receipt.status)) {
        requireThat(receipt.result === undefined, 'receipt_invalid', 502);
        result.error = projectedError(receipt.error, receipt.status === 'unknown' ? 'outcome_unknown' : 'request_rejected');
      } else {
        requireThat(receipt.error === undefined, 'receipt_invalid', 502);
        if (receipt.status === 'observed') { requireThat(method === 'observe', 'receipt_invalid', 502); result.result = projectedView(receipt.result, params.includeScreenshot); }
        else { requireThat(MUTATIONS.has(method) && ['dispatched', 'completed', 'stopped'].includes(receipt.result?.status), 'receipt_invalid', 502); result.result = { status: receipt.result.status }; }
      }
      return result;
    } catch (failure) {
      if (isDefiniteRejection(failure)) { failure.requestId = input.id; throw failure; }
      const error = new Fault(errorCodes.has(failure?.code) || ['receipt_invalid', 'invalid_observation', 'broker_unavailable', 'request_cancelled'].includes(failure?.code) ? failure.code : MUTATIONS.has(method) ? 'outcome_unknown' : 'observation_unconfirmed', 502);
      error.requestId = input.id; throw error;
    }
  }
  async #exclusive(operation) {
    requireThat(!this.#closed, 'session_closed', 409); requireThat(!this.#busy, 'client_busy', 409);
    this.#busy = true;
    try { return await operation(); } finally { this.#busy = false; }
  }
  async #observe(includeScreenshot, timeoutMs, signal) {
    this.#remaining(signal);
    this.#view = undefined;
    const combined = AbortSignal.any([this.#stopController.signal, ...(signal ? [signal] : [])]);
    let receipt;
    try { receipt = await this.#request('observe', { includeScreenshot }, timeoutMs, { signal: combined }); }
    catch (error) { if (this.#closed) throw new Fault('session_closed', 409); throw error; }
    requireThat(receipt.status === 'observed', receipt.error?.code ?? 'observation_unconfirmed', 409);
    const view = receipt.result;
    this.#remaining(signal);
    this.#view = freeze(view);
    return this.#view;
  }
  observe({ includeScreenshot = false, timeoutMs = 10_000, signal } = {}) {
    requireThat(typeof includeScreenshot === 'boolean'); number(timeoutMs, 1, 30_000);
    return this.#exclusive(() => this.#observe(includeScreenshot, timeoutMs, signal));
  }
  /** Only selected transient reads recover; targets are matched afresh and no mutation is replayed. */
  waitFor(selector, { timeoutMs = 10_000, maxObservations = 10, intervalMs = 400, stableObservations = 2, maxTransientFailures = 2, signal } = {}) {
    validateSelector(selector); number(timeoutMs, 1, 30_000); number(maxObservations, 1, 30); number(intervalMs, 400, 5000); number(stableObservations, 1, maxObservations);
    number(maxTransientFailures, 0, 5);
    return this.#exclusive(async () => {
      this.#remaining(signal);
      const combined = AbortSignal.any([this.#stopController.signal, ...(signal ? [signal] : [])]);
      const start = performance.now(); let stable = 0; let previous; const recoveries = [];
      for (let count = 1; count <= maxObservations; count++) {
        this.#remaining(signal);
        const remaining = Math.floor(timeoutMs - (performance.now() - start));
        requireThat(remaining > 0, 'condition_timeout', 408);
        let view;
        try { view = await this.#observe(false, Math.min(10_000, remaining), signal); }
        catch (error) {
          if (!transientReadErrors.has(error.code) || recoveries.length >= maxTransientFailures) throw error;
          recoveries.push({ observation: count, code: error.code }); stable = 0; previous = undefined;
        }
        requireThat(performance.now() - start < timeoutMs, 'condition_timeout', 408);
        const found = view?.nodes.filter((node) => matches(node, selector)) ?? [];
        requireThat(found.length <= 1, 'selector_ambiguous', 409);
        const identity = found.length ? JSON.stringify([view.packageName, view.windowId, found[0]]) : undefined;
        stable = identity && identity === previous ? stable + 1 : identity ? 1 : 0; previous = identity;
        if (stable >= stableObservations) return { observation: view, node: found[0], observations: count, recoveries, elapsedMs: Math.ceil(performance.now() - start) };
        const left = timeoutMs - (performance.now() - start);
        if (count < maxObservations && left > intervalMs) {
          try { await delay(intervalMs, undefined, { signal: combined }); }
          catch { throw new Fault(this.#closed ? 'session_closed' : 'request_cancelled', 409); }
        }
        else break;
      }
      throw new Fault('condition_timeout', 408);
    });
  }
  act(method, params = {}, { signal, requestId } = {}) {
    requireThat(MUTATIONS.has(method) && method !== 'stop', 'invalid_action');
    return this.#exclusive(async () => {
      requireThat(!this.#uncertain, 'outcome_unknown', 409);
      this.#remaining(signal); requireThat(this.#task, 'task_required', 409);
      requireThat(this.#actions < this.#limits.maxActions, 'task_action_budget_exhausted', 409);
      const view = this.#view;
      if (method !== 'app.launch') requireThat(view && Date.now() - Date.parse(view.capturedAt) <= 30_000, 'fresh_observation_required', 409);
      const bound = method === 'app.launch' ? params : { ...params, observationId: view.observationId };
      validateCall({ id: requestId ?? 'validate', deviceId: this.#deviceId, sessionId: this.#sessionId, taskId: this.#task.id, method, params: bound });
      this.#view = undefined;
      try {
        const receipt = await this.#request(method, bound, 55_000, { signal, requestId });
        requireThat(['completed', 'rejected', 'unknown'].includes(receipt.status), 'receipt_invalid', 502);
        if (receipt.status === 'unknown' || this.#closed) this.#uncertain = true;
        if (this.#closed) return { id: receipt.id, status: 'unknown', error: projectedError(undefined, 'outcome_unknown') };
        return receipt;
      } catch (error) {
        if (isDefiniteRejection(error) && !this.#closed) throw error;
        // A transport or malformed-receipt failure is not proof that input did not happen.
        this.#uncertain = true;
        const failure = new Fault('outcome_unknown', 502); if (error.requestId) failure.requestId = error.requestId; throw failure;
      }
    });
  }
  acquireTask({ ttlSeconds = 300, maxActions = this.#limits.maxActions, label } = {}) {
    number(ttlSeconds, 1, 300); number(maxActions, 1, 100);
    return this.#exclusive(async () => {
      requireThat(!this.#task && !this.#uncertain, 'task_already_bound', 409);
      this.#view = undefined;
      const value = await this.#client(Math.min(10_000, this.#remaining()))('/v1/tasks', 'POST', { deviceId: this.#deviceId, sessionId: this.#sessionId, ttlSeconds, maxActions, ...(label === undefined ? {} : { label }) });
      this.#remaining();
      this.#task = this.#projectTask(value.task); return this.#task;
    });
  }
  #projectTask(task) {
    requireThat(task && task.deviceId === this.#deviceId && task.sessionId === this.#sessionId, 'task_response_invalid', 502); identifier(task.id);
    requireThat(['active', 'completed', 'expired', 'revoked', 'interrupted'].includes(task.status), 'task_response_invalid', 502);
    number(task.maxActions, 1, 100); number(task.actionsUsed, 0, task.maxActions);
    requireThat(Number.isFinite(Date.parse(task.expiresAt)), 'task_response_invalid', 502);
    return freeze({ id: task.id, deviceId: task.deviceId, sessionId: task.sessionId, status: task.status, expiresAt: task.expiresAt, maxActions: task.maxActions, actionsUsed: task.actionsUsed });
  }
  taskStatus() {
    requireThat(this.#task, 'task_required', 409);
    return this.#client(10_000)(`/v1/tasks/${this.#task.id}`).then((value) => this.#projectTask(value.task));
  }
  releaseTask() {
    return this.#exclusive(async () => {
      requireThat(this.#task && !this.#uncertain, 'task_reconciliation_required', 409);
      const result = await this.#client(10_000)(`/v1/tasks/${this.#task.id}`, 'DELETE');
      this.#task = undefined; this.#view = undefined; return result;
    });
  }
  /** Status is evidence about dispatch only and never clears quarantine or restores authority. */
  async actionStatus(requestId) {
    identifier(requestId);
    const value = await this.#client(10_000)(`/v1/receipts/${requestId}`);
    const receipt = value?.receipt;
    requireThat(receipt?.id === requestId && receipt.deviceId === this.#deviceId && receipt.sessionId === this.#sessionId && ['completed', 'rejected', 'unknown'].includes(receipt.status) && value.reconciliation === 'status_only' && value.resumeAllowed === false, 'receipt_invalid', 502);
    return freeze({ receipt: { id: requestId, status: receipt.status, ...(receipt.error ? { error: projectedError(receipt.error, 'request_rejected') } : {}) }, reconciliation: 'status_only', resumeAllowed: false });
  }
  /** Stop bypasses this helper's ordinary lock. The in-flight OS gesture may still finish. */
  async stop() {
    if (this.#stopPromise) return this.#stopPromise;
    this.#closed = true; this.#view = undefined; this.#stopController.abort();
    this.#stopPromise = (async () => {
      try {
        const receipt = await this.#request('stop', {}, 10_000);
        requireThat(receipt.status === 'unknown' || receipt.status === 'completed' && receipt.result.status === 'stopped', 'stop_unconfirmed', 502);
        if (receipt.status === 'unknown') this.#uncertain = true;
        return receipt;
      } catch (error) { this.#uncertain = true; const failure = new Fault('stop_unconfirmed', 502); if (error.requestId) failure.requestId = error.requestId; throw failure; }
    })();
    return this.#stopPromise;
  }
}
