// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Fault, requireThat, object, identifier, packageName, number, string, validateGrant, validateCall, publicError, captureDetails, METHODS, MUTATIONS, MAX_BODY_BYTES, MAX_NATIVE_BYTES } from './validation.mjs';
import { digest, token, tokenMatches } from './security.mjs';
import { requestHash, bodyHash, signHttpResponse } from './response-proof.mjs';

const OBSERVATION_MS = 30_000;
const SAFE_CAPTURE_ERRORS = new Set(['screenshot_rate_limited', 'screenshot_secure_window', 'screenshot_invalid_window', 'screenshot_invalid_display', 'screenshot_access_denied', 'screenshot_geometry_changed', 'screenshot_too_large', 'screenshot_timeout', 'screenshot_internal_error', 'screenshot_unavailable']);
const SAFE_NATIVE_ERRORS = new Set(['invalid_request', 'unauthorized', 'forbidden', 'stale_observation', 'session_expired', 'deadline_expired', 'consent_unavailable', 'consent_denied', 'consent_timeout', 'busy', 'accessibility_unavailable', 'capture_unavailable', 'secure_window', 'blocked_app', 'replay_conflict', 'unknown_action_state', 'stopped', 'unsupported_method', 'out_of_bounds', 'node_unavailable', 'device_locked', 'biometric_unavailable', ...SAFE_CAPTURE_ERRORS]);
const iso = (time) => new Date(time).toISOString();
const publicCredential = ({ tokenHash: _secret, ...value }) => value;
const intersect = (a, b) => a.filter((value) => b.includes(value));
function canonical(value) { return JSON.stringify(value, function (_key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item; }); }
function receipt(id, status, result, error) { return { id, status, ...(result === undefined ? {} : { result }), ...(error ? publicError(error) : {}) }; }
async function boundedJson(response, max) {
  const reader = response.body?.getReader(); requireThat(reader, 'native_response_invalid', 502); let size = 0; const chunks = [];
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; requireThat(size <= max, 'native_response_too_large', 502); chunks.push(value); } try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Fault('native_response_invalid', 502); } }
  finally { await reader.cancel().catch(() => {}); }
}
function sanitizeObservation(raw, allowedApps, includeScreenshot, now) {
  try {
    requireThat(raw && typeof raw === 'object'); identifier(raw.observationId); packageName(raw.packageName); requireThat(allowedApps.includes(raw.packageName), 'app_forbidden', 403);
    requireThat(typeof raw.windowId === 'number' && Number.isInteger(raw.windowId) || typeof raw.windowId === 'string' && raw.windowId.length <= 128);
    number(raw.width, 1, 16384); number(raw.height, 1, 16384);
    const captured = typeof raw.capturedAt === 'number' ? raw.capturedAt : Date.parse(raw.capturedAt); requireThat(Number.isFinite(captured) && captured <= now + 5000 && now - captured <= OBSERVATION_MS, 'stale_observation', 409);
    if (raw.blockedReason) throw new Fault(SAFE_CAPTURE_ERRORS.has(raw.blockedReason) ? raw.blockedReason : 'observation_blocked', 403, SAFE_CAPTURE_ERRORS.has(raw.blockedReason) ? captureDetails(raw) : undefined);
    requireThat(Array.isArray(raw.nodes) && raw.nodes.length <= 1000); const nodeIds = new Set();
    const nodes = raw.nodes.map((node) => {
      identifier(node.id); requireThat(!nodeIds.has(node.id)); nodeIds.add(node.id); requireThat(typeof node.editable === 'boolean' && typeof node.clickable === 'boolean');
      const b = node.bounds; requireThat(b && typeof b === 'object'); number(b.left, 0, raw.width); number(b.top, 0, raw.height); number(b.right, b.left, raw.width); number(b.bottom, b.top, raw.height);
      for (const field of ['text', 'description']) if (node[field] !== undefined) requireThat(typeof node[field] === 'string' && node[field].length <= 16384);
      const semantic = {};
      for (const field of ['resourceId', 'className', 'stateDescription', 'hintText']) if (node[field] !== undefined) { requireThat(typeof node[field] === 'string' && node[field].length <= 256); semantic[field] = node[field]; }
      for (const field of ['enabled', 'scrollable', 'checkable', 'selected']) if (node[field] !== undefined) { requireThat(typeof node[field] === 'boolean'); semantic[field] = node[field]; }
      if (node.checkedState !== undefined) { requireThat(['unchecked', 'checked', 'mixed'].includes(node.checkedState)); semantic.checkedState = node.checkedState; }
      if (node.actions !== undefined) {
        requireThat(Array.isArray(node.actions) && node.actions.length <= 5 && new Set(node.actions).size === node.actions.length && node.actions.every((action) => ['click', 'longClick', 'scrollForward', 'scrollBackward', 'setText'].includes(action)));
        semantic.actions = [...node.actions];
      }
      return { id: node.id, ...(node.text === undefined ? {} : { text: node.text }), ...(node.description === undefined ? {} : { description: node.description }), bounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, editable: node.editable, clickable: node.clickable, ...semantic };
    });
    const result = { observationId: raw.observationId, packageName: raw.packageName, windowId: raw.windowId, width: raw.width, height: raw.height, capturedAt: iso(captured), nodes };
    if (raw.touchBounds !== undefined) {
      const bounds = raw.touchBounds;
      object(bounds, ['left', 'top', 'right', 'bottom']);
      number(bounds.left, 0, raw.width); number(bounds.top, 0, raw.height);
      number(bounds.right, bounds.left, raw.width); number(bounds.bottom, bounds.top, raw.height);
      const empty = Object.values(bounds).every((coordinate) => coordinate === 0);
      requireThat(empty || bounds.right > bounds.left && bounds.bottom > bounds.top);
      result.touchBounds = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    }
    if (includeScreenshot && raw.screenshot !== undefined) {
      requireThat(raw.screenshot?.mimeType === 'image/png' && typeof raw.screenshot.base64 === 'string' && raw.screenshot.base64.length <= 7 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/u.test(raw.screenshot.base64));
      requireThat(Buffer.from(raw.screenshot.base64, 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      result.screenshot = { mimeType: 'image/png', base64: raw.screenshot.base64 };
    }
    return result;
  } catch (error) { if (error instanceof Fault && (['app_forbidden', 'stale_observation', 'observation_blocked'].includes(error.code) || SAFE_CAPTURE_ERRORS.has(error.code))) throw error; throw new Fault('native_response_invalid', 502); }
}
function sanitizeDescription(raw) {
  requireThat(raw?.protocolVersion === 1 && raw.platform === 'android' && Array.isArray(raw.methods), 'native_response_invalid', 502);
  const expires = typeof raw.session?.expiresAt === 'number' ? raw.session.expiresAt : Date.parse(raw.session?.expiresAt);
  return { protocolVersion: 1, platform: 'android', methods: raw.methods.filter((value) => METHODS.includes(value)), session: { ...(Number.isFinite(expires) ? { expiresAt: iso(expires) } : {}) }, capabilities: { screenshots: raw.capabilities?.windowScreenshot === true, gestures: raw.methods.includes('tap'), biometricConsent: raw.capabilities?.strongBiometricAvailable === true } };
}

export class Broker {
  constructor({ config, state, save, fetchImpl = fetch, now = Date.now, timeoutMs = 45_000 }) {
    this.config = config; this.data = state; this.save = save; this.fetch = fetchImpl; this.now = now; this.timeoutMs = timeoutMs;
    this.inflight = new Map(); this.observations = new Map(); this.readReceipts = new Map(); this.lastSeen = new Map(); this.stopping = new Set(); this.rateBuckets = new Map();
    this.data.uncertainDevices ??= [];
    this.data.tasks ??= [];
    // An interrupted process may have sent a persisted intent without receiving its result.
    for (const entry of this.data.receipts) if (!entry.read && entry.receipt.status === 'unknown' && entry.deviceId && !this.data.uncertainDevices.includes(entry.deviceId)) this.data.uncertainDevices.push(entry.deviceId);
    // Persisted authority is evidence of a previous process, never permission to resume it.
    let recoveredSession = false;
    for (const task of this.data.tasks) if (task.status === 'active') { task.status = 'interrupted'; task.endedAt = iso(this.now()); recoveredSession = true; }
    for (const session of this.data.sessions) if (!session.revokedAt) {
      session.revokedAt = iso(this.now()); recoveredSession = true;
      if (Date.parse(session.expiresAt) > this.now() && !this.data.uncertainDevices.includes(session.deviceId)) this.data.uncertainDevices.push(session.deviceId);
    }
    if (recoveredSession) this.persist();
  }
  persist() {
    try { this.save(this.data); } catch {
      this.persistenceFailed = true; this.clearPrivateViews(); throw new Fault('persistence_unavailable', 503);
    }
  }
  audit(actorId, status, { deviceId, method, code } = {}) {
    this.data.audit.push({ at: iso(this.now()), actorId, status, ...(deviceId ? { deviceId } : {}), ...(method ? { method } : {}), ...(code ? { code } : {}) });
    this.data.audit = this.data.audit.slice(-500); this.persist();
  }
  authenticate(value) {
    requireThat(typeof value === 'string' && value.startsWith('Bearer ') && value.length <= 300, 'unauthorized', 401); const secret = value.slice(7);
    if (tokenMatches(secret, this.config.adminTokenHash)) return { id: 'owner', admin: true };
    const credential = this.data.credentials.find((entry) => tokenMatches(secret, entry.tokenHash));
    requireThat(credential && !credential.revokedAt && Date.parse(credential.expiresAt) > this.now(), 'unauthorized', 401);
    return { id: credential.id, admin: false, credential };
  }
  admin(actor) { requireThat(actor.admin, 'owner_required', 403); }
  rateLimit(actor) {
    const capacity = actor.admin ? 120 : 30; const refill = actor.admin ? 2 : 1; const now = this.now();
    const previous = this.rateBuckets.get(actor.id) ?? { tokens: capacity, at: now }; const available = Math.min(capacity, previous.tokens + (now - previous.at) * refill / 1000);
    requireThat(available >= 1, 'rate_limited', 429); this.rateBuckets.set(actor.id, { tokens: available - 1, at: now });
    for (const [key, value] of this.rateBuckets) if (now - value.at > 120_000) this.rateBuckets.delete(key);
  }
  active(actor) {
    if (!actor.admin) requireThat(this.data.credentials.some((entry) => entry.id === actor.id && !entry.revokedAt && Date.parse(entry.expiresAt) > this.now()), 'unauthorized', 401);
  }
  device(id) { const device = this.config.devices.find((entry) => entry.id === id); requireThat(device, 'device_not_found', 404); return device; }
  scope(actor, call) {
    requireThat(!this.persistenceFailed || call.method === 'stop', 'persistence_unavailable', 503);
    this.active(actor); this.device(call.deviceId);
    const session = this.data.sessions.find((entry) => entry.id === call.sessionId && entry.deviceId === call.deviceId);
    requireThat(session && !session.revokedAt && Date.parse(session.expiresAt) > this.now(), 'session_expired', 403);
    requireThat(session.operations.includes(call.method), 'operation_forbidden', 403);
    if (!actor.admin) requireThat(actor.credential.devices.includes(call.deviceId) && actor.credential.operations.includes(call.method) && (!actor.credential.sessionIds || actor.credential.sessionIds.includes(call.sessionId)), 'scope_forbidden', 403);
    const apps = actor.admin ? session.apps : intersect(session.apps, actor.credential.apps); requireThat(apps.length > 0, 'app_forbidden', 403);
    const disclosure = { screenshots: session.disclosure?.screenshots === true && (actor.admin || actor.credential.disclosure?.screenshots === true) };
    if (call.method === 'observe' && call.params?.includeScreenshot === true) requireThat(disclosure.screenshots, 'screenshot_forbidden', 403);
    return { session, apps, disclosure };
  }
  state(actor) {
    this.active(actor); this.prune(); const ids = actor.admin ? this.config.devices.map((device) => device.id) : actor.credential.devices;
    return {
      storageState: this.persistenceFailed ? 'unavailable' : 'ready',
      devices: this.config.devices.filter((device) => ids.includes(device.id)).map((device) => ({ id: device.id, label: device.label, busy: this.inflight.has(device.id) || this.stopping.has(device.id), actionState: this.data.uncertainDevices.includes(device.id) ? 'unknown' : 'ready', connection: this.lastSeen.has(device.id) && this.now() - this.lastSeen.get(device.id) <= 60_000 ? 'recently_observed' : 'unknown', ...(this.lastSeen.has(device.id) ? { lastSeenAt: iso(this.lastSeen.get(device.id)) } : {}) })),
      sessions: this.data.sessions.filter((session) => ids.includes(session.deviceId) && (actor.admin || !actor.credential.sessionIds || actor.credential.sessionIds.includes(session.id))).map((session) => ({ ...session, disclosure: { screenshots: session.disclosure?.screenshots === true && (actor.admin || actor.credential.disclosure?.screenshots === true) }, ...(!actor.admin ? { apps: intersect(session.apps, actor.credential.apps), operations: intersect(session.operations, actor.credential.operations) } : {}) })).filter((session) => session.apps.length > 0 && session.operations.length > 0),
      credentials: this.data.credentials.filter((entry) => actor.admin || entry.id === actor.id).map(publicCredential),
      tasks: this.data.tasks.filter((task) => ids.includes(task.deviceId) && (actor.admin || task.actorId === actor.id)).map((task) => ({ ...this.publicTask(task), ...(actor.admin ? { actorId: task.actorId } : {}) })),
    };
  }
  createCredential(actor, input) {
    this.admin(actor); requireThat(!this.persistenceFailed, 'persistence_unavailable', 503); validateGrant(input); input.devices.forEach((id) => this.device(id)); requireThat(this.data.credentials.filter((entry) => Date.parse(entry.expiresAt) > this.now()).length < 256, 'credential_limit', 429);
    if (input.sessionIds) for (const id of input.sessionIds) requireThat(this.data.sessions.some((session) => session.id === id && input.devices.includes(session.deviceId) && !session.revokedAt && Date.parse(session.expiresAt) > this.now()), 'session_forbidden', 403);
    const secret = token(); const credential = { id: randomUUID(), label: input.label, devices: [...input.devices], apps: [...input.apps], operations: [...input.operations], disclosure: { screenshots: input.disclosure?.screenshots === true }, ...(input.sessionIds ? { sessionIds: [...input.sessionIds] } : {}), createdAt: iso(this.now()), expiresAt: iso(this.now() + input.ttlSeconds * 1000), tokenHash: digest(secret) };
    this.data.credentials = this.data.credentials.filter((entry) => Date.parse(entry.expiresAt) > this.now()); this.data.credentials.push(credential); this.audit(actor.id, 'credential_created');
    return { credential: { ...publicCredential(credential), token: secret } };
  }
  async revokeCredential(actor, id) {
    this.admin(actor); identifier(id); const credential = this.data.credentials.find((entry) => entry.id === id); requireThat(credential, 'credential_not_found', 404);
    credential.revokedAt = iso(this.now()); this.clearPrivateViews(id);
    this.endTasks((task) => task.actorId === id, 'revoked');
    const affected = [...this.inflight.entries()].filter(([, entry]) => entry.actorId === id).map(([deviceId, entry]) => { entry.controller.abort(); return deviceId; });
    let persistenceFailed = false; try { this.audit(actor.id, 'credential_revoked'); } catch { persistenceFailed = true; }
    for (const deviceId of persistenceFailed ? credential.devices : affected) {
      try { await this.stopDevice(actor, deviceId); } catch { /* Other in-progress owner stops already revoked this device in memory. */ }
    }
    if (persistenceFailed) throw new Fault('persistence_unavailable', 503);
    return { revoked: true };
  }
  createSession(actor, input) {
    this.admin(actor); requireThat(!this.persistenceFailed, 'persistence_unavailable', 503); validateGrant(input, true); this.device(input.deviceId); requireThat(this.data.sessions.filter((entry) => Date.parse(entry.expiresAt) > this.now()).length < 256, 'session_limit', 429);
    const session = { id: randomUUID(), deviceId: input.deviceId, apps: [...input.apps], operations: [...input.operations], disclosure: { screenshots: input.disclosure?.screenshots === true }, createdAt: iso(this.now()), expiresAt: iso(this.now() + input.ttlSeconds * 1000) };
    this.data.sessions = this.data.sessions.filter((entry) => Date.parse(entry.expiresAt) > this.now()); this.data.sessions.push(session); this.audit(actor.id, 'session_created', { deviceId: input.deviceId }); return { session: { ...session } };
  }
  clearPrivateViews(actorId, deviceId) {
    for (const [key, entry] of this.observations) if ((!actorId || entry.actorId === actorId) && (!deviceId || entry.deviceId === deviceId)) this.observations.delete(key);
    for (const [key, entry] of this.readReceipts) if ((!actorId || entry.actorId === actorId) && (!deviceId || entry.deviceId === deviceId)) this.readReceipts.delete(key);
  }
  publicTask(task) {
    const { actorId: _actorId, ...value } = task;
    return { ...value, outcome: 'unverified' };
  }
  endTasks(matches, status) {
    for (const task of this.data.tasks) if (task.status === 'active' && matches(task)) { task.status = status; task.endedAt = iso(this.now()); }
  }
  taskAuthority(actor, input) {
    this.active(actor); this.device(input.deviceId); requireThat(!this.persistenceFailed, 'persistence_unavailable', 503);
    const session = this.data.sessions.find((entry) => entry.id === input.sessionId && entry.deviceId === input.deviceId);
    requireThat(session && !session.revokedAt && Date.parse(session.expiresAt) > this.now(), 'session_expired', 403);
    if (!actor.admin) requireThat(actor.credential.devices.includes(input.deviceId) && (!actor.credential.sessionIds || actor.credential.sessionIds.includes(session.id)), 'scope_forbidden', 403);
    requireThat((actor.admin ? session.apps : intersect(session.apps, actor.credential.apps)).length > 0, 'app_forbidden', 403);
    requireThat(session.operations.some((method) => method !== 'stop' && MUTATIONS.has(method) && (actor.admin || actor.credential.operations.includes(method))), 'operation_forbidden', 403);
    return session;
  }
  createTask(actor, input) {
    object(input, ['deviceId', 'sessionId', 'ttlSeconds', 'maxActions', 'label'], ['deviceId', 'sessionId', 'ttlSeconds', 'maxActions']);
    identifier(input.deviceId); identifier(input.sessionId); number(input.ttlSeconds, 1, 300); number(input.maxActions, 1, 100); if (input.label !== undefined) string(input.label, 80);
    const session = this.taskAuthority(actor, input); this.prune();
    requireThat(!this.data.uncertainDevices.includes(input.deviceId), 'device_outcome_unknown', 409);
    requireThat(!this.inflight.has(input.deviceId) && !this.stopping.has(input.deviceId), 'device_busy', 409);
    requireThat(!this.data.tasks.some((task) => task.deviceId === input.deviceId && task.status === 'active'), 'task_busy', 409);
    requireThat(this.data.tasks.length < 1024, 'task_capacity', 429);
    const task = { id: randomUUID(), actorId: actor.id, deviceId: input.deviceId, sessionId: input.sessionId, status: 'active', createdAt: iso(this.now()), expiresAt: iso(Math.min(this.now() + input.ttlSeconds * 1000, Date.parse(session.expiresAt), actor.admin ? Infinity : Date.parse(actor.credential.expiresAt))), maxActions: input.maxActions, actionsUsed: 0, ...(input.label === undefined ? {} : { label: input.label }) };
    this.data.tasks.push(task); this.clearPrivateViews(undefined, task.deviceId); this.audit(actor.id, 'task_created', { deviceId: task.deviceId });
    return { task: this.publicTask(task) };
  }
  taskStatus(actor, id) {
    this.active(actor); identifier(id); this.prune();
    const task = this.data.tasks.find((entry) => entry.id === id && (actor.admin || entry.actorId === actor.id && actor.credential.devices.includes(entry.deviceId)));
    requireThat(task, 'task_not_found', 404); return { task: this.publicTask(task) };
  }
  releaseTask(actor, id) {
    const { task: visible } = this.taskStatus(actor, id); const task = this.data.tasks.find((entry) => entry.id === visible.id);
    requireThat(!this.inflight.has(task.deviceId) && !this.stopping.has(task.deviceId), 'device_busy', 409);
    requireThat(!this.data.uncertainDevices.includes(task.deviceId), 'device_outcome_unknown', 409);
    if (task.status === 'active') { task.status = 'completed'; task.endedAt = iso(this.now()); this.clearPrivateViews(undefined, task.deviceId); this.audit(actor.id, 'task_released', { deviceId: task.deviceId }); }
    return { task: this.publicTask(task) };
  }
  requireTask(actor, input, { response = false } = {}) {
    requireThat(input.taskId, 'task_required', 403);
    const task = this.data.tasks.find((entry) => entry.id === input.taskId && entry.actorId === actor.id && entry.deviceId === input.deviceId && entry.sessionId === input.sessionId);
    requireThat(task, 'task_forbidden', 403);
    requireThat(task.status === 'active' && Date.parse(task.expiresAt) > this.now(), 'task_expired', 403);
    if (!response) requireThat(task.actionsUsed < task.maxActions, 'task_budget_exhausted', 429);
    return task;
  }
  receiptStatus(actor, id) {
    this.active(actor); identifier(id); this.prune();
    const entry = this.data.receipts.find((item) => item.key === `${actor.id}:${id}` && (actor.admin || actor.credential.devices.includes(item.deviceId)));
    requireThat(entry, 'receipt_not_found', 404);
    const value = entry.receipt;
    return { receipt: { id, deviceId: entry.deviceId, ...(entry.sessionId ? { sessionId: entry.sessionId } : {}), ...(entry.taskId ? { taskId: entry.taskId } : {}), ...(entry.method ? { method: entry.method } : {}), status: entry.outcomeStatus ?? value.status, ...(entry.recordedAt ? { recordedAt: entry.recordedAt } : {}), ...(entry.completedAt ? { completedAt: entry.completedAt } : {}), ...(value.error && entry.outcomeStatus !== 'observed' ? { error: { code: value.error.code } } : {}) }, reconciliation: 'status_only', resumeAllowed: false };
  }
  async revokeSession(actor, id) {
    this.admin(actor); identifier(id); const session = this.data.sessions.find((entry) => entry.id === id); requireThat(session, 'session_not_found', 404);
    // The companion has a device-wide session. Stopping it also invalidates every broker session for that device.
    return this.stopDevice(actor, session.deviceId);
  }
  async stopDevice(actor, deviceId) {
    this.admin(actor); return this.#stopAuthorizedDevice(actor, deviceId);
  }
  async #stopAuthorizedDevice(actor, deviceId) {
    const device = this.device(deviceId);
    requireThat(!this.stopping.has(deviceId), 'device_busy', 409); this.stopping.add(deviceId);
    try {
      for (const session of this.data.sessions) if (session.deviceId === deviceId && !session.revokedAt) session.revokedAt = iso(this.now());
      this.endTasks((task) => task.deviceId === deviceId, 'revoked');
      this.clearPrivateViews(undefined, deviceId); this.inflight.get(deviceId)?.controller.abort();
      let persistenceFailed = false; try { this.audit(actor.id, 'stop_requested', { deviceId, method: 'stop' }); } catch { persistenceFailed = true; }
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 10_000)); let stopStatus = 'unknown';
      try { const result = await this.native(device, { id: randomUUID(), method: 'stop', params: {} }, controller.signal); requireThat(['stopped', 'completed'].includes(result?.status) && result.inFlightGestureMayFinish !== true, 'native_stop_unconfirmed', 502); stopStatus = 'completed'; this.data.uncertainDevices = this.data.uncertainDevices.filter((id) => id !== deviceId); } catch { if (!this.data.uncertainDevices.includes(deviceId)) this.data.uncertainDevices.push(deviceId); }
      finally { clearTimeout(timer); }
      try { this.audit(actor.id, stopStatus, { deviceId, method: 'stop' }); } catch { persistenceFailed = true; }
      return { revoked: true, stopStatus: persistenceFailed ? 'unknown' : stopStatus };
    } finally { this.stopping.delete(deviceId); }
  }
  async native(device, call, signal) {
    const response = await this.fetch(`${device.origin}/v1/call`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${device.token}` }, body: JSON.stringify(call), signal });
    requireThat(response.ok, 'native_transport_error', 502); const body = await boundedJson(response, MAX_NATIVE_BYTES); requireThat(body?.id === call.id && Object.hasOwn(body, 'result') !== Object.hasOwn(body, 'error'), 'native_response_invalid', 502);
    if (body.error) throw new Fault(SAFE_NATIVE_ERRORS.has(body.error.code) ? body.error.code : 'native_rejected', SAFE_NATIVE_ERRORS.has(body.error.code) ? 422 : 502, SAFE_CAPTURE_ERRORS.has(body.error.code) ? captureDetails(body.error.details) : undefined);
    requireThat(Object.hasOwn(body, 'result') && !Object.hasOwn(body, 'error'), 'native_response_invalid', 502); this.lastSeen.set(device.id, this.now()); return body.result;
  }
  prune() {
    const now = this.now(); this.data.receipts = this.data.receipts.filter((entry) => entry.retainUntil > now);
    this.endTasks((task) => Date.parse(task.expiresAt) <= now, 'expired');
    this.data.tasks = this.data.tasks.filter((task) => task.status === 'active' || Date.parse(task.endedAt) + 86_400_000 > now);
    for (const [key, entry] of this.observations) if (entry.expiresAt <= now) this.observations.delete(key);
    for (const [key, entry] of this.readReceipts) if (entry.expiresAt <= now) this.readReceipts.delete(key);
  }
  boundPrivateMemory() {
    let bytes = [...this.readReceipts.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [key, entry] of this.readReceipts) {
      if (bytes <= 16 * 1024 * 1024 && this.readReceipts.size <= 32) break;
      bytes -= entry.bytes; this.readReceipts.delete(key);
      for (const [observationKey, observation] of this.observations) if (observation.receiptKey === key) this.observations.delete(observationKey);
    }
  }
  async call(actor, input) {
    validateCall(input); const { session, apps } = this.scope(actor, input); this.prune();
    if (input.method === 'stop') {
      // A scoped stop has already passed the session/device/operation checks. It
      // must interrupt ordinary work even with a full ledger or failed storage.
      const stopped = await this.#stopAuthorizedDevice(actor, input.deviceId);
      return stopped.stopStatus === 'completed'
        ? receipt(input.id, 'completed', { status: 'stopped' })
        : receipt(input.id, 'unknown', undefined, new Fault('outcome_unknown', 502));
    }
    const key = `${actor.id}:${input.id}`; const fingerprint = digest(canonical(input)); const previous = this.data.receipts.find((entry) => entry.key === key);
    if (previous) {
      requireThat(previous.fingerprint === fingerprint, 'replay_conflict', 409);
      if (previous.read) { const cached = this.readReceipts.get(key); requireThat(cached && cached.expiresAt > this.now(), 'observation_expired', 409); return cached.receipt; }
      return previous.receipt;
    }
    const device = this.device(input.deviceId); requireThat(!this.inflight.has(device.id) && !this.stopping.has(device.id), 'device_busy', 409); requireThat(this.data.receipts.length < 4096, 'receipt_capacity', 429);
    const mutation = MUTATIONS.has(input.method);
    requireThat(!mutation || input.method === 'stop' || !this.data.uncertainDevices.includes(device.id), 'device_outcome_unknown', 409);
    const params = { ...input.params };
    if (input.method === 'observe') { params.includeScreenshot = input.params.includeScreenshot === true; params.allowedPackages = apps; }
    if (input.method === 'apps.list') params.allowedPackages = apps;
    if (input.method === 'app.launch') { requireThat(apps.includes(params.packageName), 'app_forbidden', 403); params.expectedPackage = params.packageName; }
    if (params.observationId) {
      const observation = this.observations.get(`${actor.id}:${session.id}:${params.observationId}`); requireThat(observation && observation.expiresAt > this.now() && observation.deviceId === input.deviceId, 'stale_observation', 409);
      requireThat(apps.includes(observation.result.packageName), 'app_forbidden', 403); params.expectedPackage = observation.result.packageName;
      const touchBounds = observation.result.touchBounds;
      const bounds = touchBounds ?? { left: 0, top: 0, right: observation.result.width, bottom: observation.result.height };
      const inside = (x, y) => requireThat(x >= bounds.left && y >= bounds.top && x < bounds.right && y < bounds.bottom, 'out_of_bounds');
      if ('x' in params) inside(params.x, params.y); if ('centerX' in params) inside(params.centerX, params.centerY); if (params.points) params.points.forEach(({ x, y }) => inside(x, y));
      if (input.method === 'pinch' && touchBounds) {
        // Match the companion's two horizontal finger paths, including their starting positions when shrinking.
        const radius = Math.fround(Math.min(observation.result.width, observation.result.height) * Math.fround(0.1));
        const extent = Math.fround(radius * Math.max(1, Math.fround(params.scale)));
        inside(Math.fround(params.centerX - extent), params.centerY);
        inside(Math.fround(params.centerX + extent), params.centerY);
      }
      if (input.method === 'type') requireThat(observation.result.nodes.some((node) => node.id === params.nodeId && node.editable), 'node_not_editable', 403);
      if (input.method === 'node.click') requireThat(observation.result.nodes.some((node) => node.id === params.nodeId && node.clickable), 'node_not_clickable', 403);
      if (input.method === 'node.scroll') requireThat(observation.result.nodes.some((node) => node.id === params.nodeId && node.enabled === true && node.scrollable === true && node.actions?.includes(params.direction === 'forward' ? 'scrollForward' : 'scrollBackward')), 'node_not_scrollable', 403);
    }
    if (mutation && input.method !== 'stop') {
      const task = this.requireTask(actor, input);
      params.deadlineAt = Math.min(this.now() + Math.max(1, this.timeoutMs - 1000), Date.parse(session.expiresAt), Date.parse(task.expiresAt), actor.admin ? Infinity : Date.parse(actor.credential.expiresAt));
      requireThat(params.deadlineAt > this.now(), 'session_expired', 403);
    }
    requireThat(Buffer.byteLength(JSON.stringify({ id: digest(key), method: input.method, params })) <= MAX_BODY_BYTES, 'request_too_large', 413);
    const entry = { key, deviceId: device.id, sessionId: session.id, ...(input.taskId ? { taskId: input.taskId } : {}), method: input.method, recordedAt: iso(this.now()), fingerprint, retainUntil: mutation ? Date.parse(session.expiresAt) + 86_400_000 : this.now() + OBSERVATION_MS, read: !mutation, receipt: receipt(input.id, 'unknown', undefined, new Fault('outcome_unknown')) };
    if (mutation) this.requireTask(actor, input).actionsUsed += 1;
    this.data.receipts.push(entry); this.persist(); // Write intent before crossing the device boundary. A crash cannot silently reinject a mutation.
    const controller = new AbortController(); this.inflight.set(device.id, { actorId: actor.id, controller }); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (mutation) this.clearPrivateViews(undefined, device.id);
    let nativeCompleted = false;
    try {
      const result = await this.native(device, { id: digest(key), method: input.method, params }, controller.signal);
      nativeCompleted = true;
      this.scope(actor, input); // Revocation and expiry also gate responses, including already captured private screens.
      if (mutation) this.requireTask(actor, input, { response: true });
      let projected;
      if (input.method === 'observe') {
        this.clearPrivateViews(actor.id, device.id);
        projected = sanitizeObservation(result, apps, params.includeScreenshot, this.now());
        this.observations.set(`${actor.id}:${session.id}:${projected.observationId}`, { receiptKey: key, actorId: actor.id, deviceId: device.id, expiresAt: Math.min(this.now() + OBSERVATION_MS, Date.parse(projected.capturedAt) + OBSERVATION_MS), result: projected });
      } else if (input.method === 'describe') { projected = sanitizeDescription(result); projected.capabilities.screenshots &&= this.scope(actor, input).disclosure.screenshots; projected.capabilities.taskLeaseRequired = true; projected.methods = projected.methods.filter((method) => session.operations.includes(method) && (actor.admin || actor.credential.operations.includes(method))); }
      else if (input.method === 'apps.list') {
        requireThat(Array.isArray(result?.apps) && result.apps.length <= 1000, 'native_response_invalid', 502);
        projected = { apps: result.apps.filter((app) => apps.includes(app.packageName)).map((app) => { packageName(app.packageName); string(app.label, 200); return { packageName: app.packageName, label: app.label }; }) };
      } else {
        requireThat(result && typeof result === 'object' && ['dispatched', 'completed', 'stopped'].includes(result.status), 'native_response_invalid', 502);
        projected = { status: result.status }; // Native text and arbitrary metadata never enter the receipt ledger.
      }
      entry.receipt = receipt(input.id, mutation ? 'completed' : 'observed', projected);
      entry.outcomeStatus = entry.receipt.status;
      entry.completedAt = iso(this.now());
      if (!mutation) { this.readReceipts.set(key, { actorId: actor.id, deviceId: device.id, expiresAt: Math.min(this.now() + OBSERVATION_MS, input.method === 'observe' ? Date.parse(projected.capturedAt) + OBSERVATION_MS : Infinity), bytes: Buffer.byteLength(JSON.stringify(entry.receipt)), receipt: entry.receipt }); this.boundPrivateMemory(); entry.receipt = receipt(input.id, 'rejected', undefined, new Fault('observation_expired')); }
      if (input.method === 'stop') { for (const item of this.data.sessions) if (item.deviceId === device.id) item.revokedAt = iso(this.now()); }
      this.audit(actor.id, mutation ? 'completed' : 'observed', { deviceId: device.id, method: input.method });
      return mutation ? entry.receipt : this.readReceipts.get(key).receipt;
    } catch (error) {
      const knownRejection = !nativeCompleted && error instanceof Fault && error.status < 500 && error.code !== 'unknown_action_state';
      const safe = error instanceof Fault ? error : new Fault('outcome_unknown', 502);
      entry.receipt = receipt(input.id, mutation && !knownRejection ? 'unknown' : 'rejected', undefined, safe);
      entry.outcomeStatus = entry.receipt.status;
      entry.completedAt = iso(this.now());
      if (mutation && entry.receipt.status === 'unknown' && !this.data.uncertainDevices.includes(device.id)) this.data.uncertainDevices.push(device.id);
      if (!mutation) { entry.read = false; }
      try { this.audit(actor.id, entry.receipt.status, { deviceId: device.id, method: input.method, code: safe.code }); } catch { entry.receipt = receipt(input.id, 'unknown', undefined, new Fault('persistence_unavailable', 500)); entry.outcomeStatus = 'unknown'; }
      return entry.receipt;
    } finally { clearTimeout(timer); if (this.inflight.get(device.id)?.controller === controller) this.inflight.delete(device.id); }
  }
}

async function requestBody(req) {
  requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'json_required', 415);
  const declared = Number(req.headers['content-length'] ?? 0); requireThat(Number.isFinite(declared) && declared <= MAX_BODY_BYTES, 'request_too_large', 413);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; requireThat(size <= MAX_BODY_BYTES, 'request_too_large', 413); chunks.push(chunk); }
  try { req.phoneControlBody = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); return JSON.parse(req.phoneControlBody); } catch { throw new Fault('invalid_json'); }
}
export function createServer(broker, { port = broker.config.port } = {}) {
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    let validatedCall; let validatedActor;
    const respond = (status, value) => {
      const text = JSON.stringify(value); const nonce = req.headers['x-phone-request-nonce'];
      if (broker.config.signingPrivateKey && typeof nonce === 'string' && /^[a-zA-Z0-9_-]{16,96}$/u.test(nonce)) {
        try {
          const signature = signHttpResponse({ privateKey: broker.config.signingPrivateKey, nonce, method: req.method, path: req.url, requestHash: bodyHash(req.phoneControlBody ?? ''), status, bodyHash: bodyHash(text) });
          res.setHeader('x-phone-response-signature', signature);
        } catch { /* Invalid identity material yields an unproven response, never a trusted fallback. */ }
      }
      res.statusCode = status; res.end(text);
    };
    try {
      requireThat(req.headers.origin === undefined && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'none'), 'browser_origin_forbidden', 403);
      requireThat(req.headers.host === `127.0.0.1:${server.address()?.port ?? port}`, 'host_forbidden', 403);
      requireThat(req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization').length === 1, 'unauthorized', 401);
      const actor = broker.authenticate(req.headers.authorization); const path = req.url; let result;
      if (!(req.method === 'POST' && path === '/v1/call') && !(actor.admin && (req.method === 'DELETE' || req.method === 'POST' && /^\/v1\/devices\/[a-zA-Z0-9_-]+\/stop$/u.test(path)))) broker.rateLimit(actor);
      if (req.method === 'GET' && path === '/v1/state') result = broker.state(actor);
      else if (req.method === 'GET' && path === '/v1/legal') result = { name: 'Orchestrator Phone Control', attribution: 'Orchestrator Phone Control — created by the Orchestrator contributors', license: 'AGPL-3.0-only', notice: 'Additional attribution preservation term: see ATTRIBUTION.md. No warranty.', source: 'https://github.com/QuintonD/orchestrator-portal' };
      else if (req.method === 'GET' && path === '/v1/credentials') { broker.admin(actor); result = { credentials: broker.data.credentials.map(publicCredential) }; }
      else if (req.method === 'GET' && path === '/v1/audit') { broker.admin(actor); result = { events: broker.data.audit.map((event) => ({ ...event })) }; }
      else if (req.method === 'POST' && path === '/v1/credentials') { broker.admin(actor); result = broker.createCredential(actor, await requestBody(req)); }
      else if (req.method === 'DELETE' && /^\/v1\/credentials\/[a-zA-Z0-9._-]+$/u.test(path)) { broker.admin(actor); result = await broker.revokeCredential(actor, path.split('/').at(-1)); }
      else if (req.method === 'POST' && path === '/v1/sessions') { broker.admin(actor); result = broker.createSession(actor, await requestBody(req)); }
      else if (req.method === 'POST' && path === '/v1/tasks') result = broker.createTask(actor, await requestBody(req));
      else if (req.method === 'GET' && /^\/v1\/tasks\/[a-zA-Z0-9_-]+$/u.test(path)) result = broker.taskStatus(actor, path.split('/').at(-1));
      else if (req.method === 'DELETE' && /^\/v1\/tasks\/[a-zA-Z0-9_-]+$/u.test(path)) result = broker.releaseTask(actor, path.split('/').at(-1));
      else if (req.method === 'GET' && /^\/v1\/receipts\/[a-zA-Z0-9_-]+$/u.test(path)) result = broker.receiptStatus(actor, path.split('/').at(-1));
      else if (req.method === 'DELETE' && /^\/v1\/sessions\/[a-zA-Z0-9._-]+$/u.test(path)) { broker.admin(actor); result = await broker.revokeSession(actor, path.split('/').at(-1)); }
      else if (req.method === 'POST' && /^\/v1\/devices\/[a-zA-Z0-9._-]+\/stop$/u.test(path)) { broker.admin(actor); object(await requestBody(req), []); result = await broker.stopDevice(actor, path.split('/')[3]); }
      else if (req.method === 'POST' && path === '/v1/call') { const input = await requestBody(req); validateCall(input); validatedCall = input; validatedActor = actor; if (input.method !== 'stop') broker.rateLimit(actor); result = await broker.call(actor, input); }
      else throw new Fault('not_found', 404);
      respond(200, result);
    } catch (error) {
      res.statusCode = error instanceof Fault ? error.status : 500; const result = publicError(error);
      const proofSession = validatedCall && broker.data.sessions.find((session) => session.id === validatedCall.sessionId && session.deviceId === validatedCall.deviceId);
      // call() returns receipts after dispatch. Only a caught, known Fault before
      // that boundary can carry a no-dispatch proof; HTTP status alone proves nothing.
      // Receipts can eventually expire. An expired session is therefore never a
      // proof boundary, even when its old request id has left the retained ledger.
      if (validatedCall && validatedCall.method !== 'stop' && proofSession && !proofSession.revokedAt && Date.parse(proofSession.expiresAt) > broker.now() && !broker.data.receipts.some((entry) => entry.key === `${validatedActor.id}:${validatedCall.id}`) && error instanceof Fault) {
        const hash = requestHash(validatedCall);
        result.dispatch = { state: 'not_dispatched', requestHash: hash };
      }
      respond(res.statusCode, result);
    }
  });
  server.maxRequestsPerSocket = 100; server.maxConnections = 64; server.keepAliveTimeout = 5000;
  return server;
}
