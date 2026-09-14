// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
export const METHODS = Object.freeze(['describe', 'observe', 'apps.list', 'app.launch', 'tap', 'longPress', 'swipe', 'pinch', 'node.click', 'node.scroll', 'type', 'key', 'fixture.increment', 'document.read', 'document.replace', 'draft.create', 'stop']);
export const MUTATIONS = new Set(METHODS.filter((method) => !['describe', 'observe', 'apps.list', 'document.read'].includes(method)));
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_NATIVE_BYTES = 8 * 1024 * 1024;
export class Fault extends Error {
  constructor(code, status = 400, details) { super(code); this.code = code; this.status = status; if (details !== undefined) this.details = details; }
}
export function requireThat(value, code = 'invalid_request', status = 400) { if (!value) throw new Fault(code, status); }
export function object(value, allowed, required = allowed) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireThat(Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key)));
}
export function string(value, max = 128) { requireThat(typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)); return value; }
export function identifier(value) { string(value, 96); requireThat(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(value)); return value; }
export function packageName(value) { string(value, 200); requireThat(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(value)); return value; }
export function number(value, min, max, integer = true) { requireThat(Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))); return value; }
export function list(value, check, max = 64) { requireThat(Array.isArray(value) && value.length > 0 && value.length <= max && new Set(value).size === value.length); value.forEach(check); return value; }
export function operations(value) { return list(value, (entry) => requireThat(METHODS.includes(entry))); }
export const DOCUMENT_EFFECTS = Object.freeze(['document.read', 'document.replace']);
export const RESOURCE_EFFECTS = Object.freeze([...DOCUMENT_EFFECTS, 'draft.create']);
export function documentText(value) {
  requireThat(typeof value === 'string' && value.length <= 2000 && value.isWellFormed() && !value.includes('\u0000') && Buffer.byteLength(value, 'utf8') <= 8192, 'invalid_document_text');
  return value;
}
export function documentRevision(value) { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'invalid_document_revision'); return value; }
export function validateResourceScope(value) {
  object(value, ['adapter', 'resourceIds', 'effects']);
  requireThat(['android.document.v1', 'android.folder-drafts.v1'].includes(value.adapter), 'unsupported_resource_adapter');
  const effects = value.adapter === 'android.document.v1' ? DOCUMENT_EFFECTS : ['draft.create'];
  list(value.resourceIds, identifier, 32); list(value.effects, effect => requireThat(effects.includes(effect), 'unsupported_resource_effect'), effects.length);
  requireThat(!value.effects.includes('document.replace') || value.effects.includes('document.read'), 'document_read_required');
  return { adapter: value.adapter, resourceIds: [...value.resourceIds], effects: [...value.effects] };
}
/** Both owner-issued authorities must explicitly grant resources; legacy app authority is insufficient. */
export function intersectResourceScopes(left, right) {
  requireThat(left && right, 'resource_scope_required', 403);
  validateResourceScope(left); validateResourceScope(right);
  requireThat(left.adapter === right.adapter, 'resource_forbidden', 403);
  const resourceIds = left.resourceIds.filter(id => right.resourceIds.includes(id));
  const effects = left.effects.filter(effect => right.effects.includes(effect));
  requireThat(resourceIds.length && effects.length, 'resource_forbidden', 403);
  return { adapter: left.adapter, resourceIds, effects };
}
export function narrowResourceScope(parent, requested) {
  const scope = validateResourceScope(requested);
  requireThat(parent && scope.adapter === parent.adapter && scope.resourceIds.every(id => parent.resourceIds.includes(id)) && scope.effects.every(effect => parent.effects.includes(effect)), 'resource_scope_escalation', 403);
  return scope;
}
export function validateGrant(value, session = false) {
  const required = session ? ['deviceId', 'apps', 'operations', 'ttlSeconds'] : ['label', 'devices', 'apps', 'operations', 'ttlSeconds'];
  object(value, [...required, ...(session ? [] : ['sessionIds']), 'disclosure', 'resourceScope'], required);
  if (session) identifier(value.deviceId); else { string(value.label, 80); list(value.devices, identifier, 16); }
  if (!session && Object.hasOwn(value, 'sessionIds')) list(value.sessionIds, identifier, 256);
  if (Object.hasOwn(value, 'disclosure')) { object(value.disclosure, ['screenshots']); requireThat(typeof value.disclosure.screenshots === 'boolean'); }
  if (value.resourceScope !== undefined) {
    const scope = validateResourceScope(value.resourceScope);
    requireThat(Array.isArray(value.apps) && value.apps.length === 0, 'resource_scope_mixed_apps');
    requireThat(value.disclosure?.screenshots !== true, 'resource_scope_screen_forbidden');
    requireThat(Array.isArray(value.operations) && value.operations.every(method => ['describe', 'stop', ...scope.effects].includes(method)), 'resource_scope_operation_forbidden');
  } else {
    list(value.apps, packageName, 32);
    requireThat(Array.isArray(value.operations) && value.operations.every(method => !RESOURCE_EFFECTS.includes(method)), 'resource_scope_required');
  }
  operations(value.operations); number(value.ttlSeconds, 60, session ? 3600 : 86400);
}
function observation(value) { identifier(value); }
function point(value) { object(value, ['x', 'y']); number(value.x, 0, 16383); number(value.y, 0, 16383); }
export function validateCall(value) {
  object(value, ['id', 'deviceId', 'sessionId', 'taskId', 'method', 'params'], ['id', 'deviceId', 'sessionId', 'method', 'params']); identifier(value.id); identifier(value.deviceId); identifier(value.sessionId);
  if (Object.hasOwn(value, 'taskId')) identifier(value.taskId);
  requireThat(METHODS.includes(value.method)); const p = value.params;
  switch (value.method) {
    case 'draft.create': object(p, ['resourceId', 'text']); identifier(p.resourceId); documentText(p.text); break;
    case 'document.read': object(p, ['resourceId']); identifier(p.resourceId); break;
    case 'document.replace': object(p, ['resourceId', 'expectedRevision', 'text']); identifier(p.resourceId); documentRevision(p.expectedRevision); documentText(p.text); break;
    case 'observe': object(p, ['includeScreenshot'], []); if (Object.hasOwn(p, 'includeScreenshot')) requireThat(typeof p.includeScreenshot === 'boolean'); break;
    case 'describe': case 'apps.list': case 'stop': object(p, []); break;
    case 'app.launch': object(p, ['packageName']); packageName(p.packageName); break;
    case 'fixture.increment': object(p, ['observationId']); observation(p.observationId); break;
    case 'node.click': object(p, ['observationId', 'nodeId']); observation(p.observationId); identifier(p.nodeId); break;
    case 'node.scroll': object(p, ['observationId', 'nodeId', 'direction']); observation(p.observationId); identifier(p.nodeId); requireThat(['forward', 'backward'].includes(p.direction)); break;
    case 'tap': object(p, ['observationId', 'x', 'y']); observation(p.observationId); point({ x: p.x, y: p.y }); break;
    case 'longPress': object(p, ['observationId', 'x', 'y', 'durationMs']); observation(p.observationId); point({ x: p.x, y: p.y }); number(p.durationMs, 200, 2000); break;
    case 'swipe': object(p, ['observationId', 'points', 'durationMs']); observation(p.observationId); requireThat(Array.isArray(p.points) && p.points.length >= 2 && p.points.length <= 20); p.points.forEach(point); number(p.durationMs, 100, 2000); break;
    case 'pinch': object(p, ['observationId', 'centerX', 'centerY', 'scale', 'durationMs']); observation(p.observationId); number(p.centerX, 0, 16383); number(p.centerY, 0, 16383); number(p.scale, 0.5, 2, false); requireThat(p.scale !== 1); number(p.durationMs, 100, 2000); break;
    case 'type': object(p, ['observationId', 'nodeId', 'text']); observation(p.observationId); identifier(p.nodeId); requireThat(typeof p.text === 'string' && p.text.length > 0 && p.text.length <= 2000 && !p.text.includes('\u0000')); break;
    case 'key': object(p, ['observationId', 'key']); observation(p.observationId); requireThat(['back', 'home'].includes(p.key)); break;
    default: throw new Fault('unsupported_method');
  }
}
export function captureRecovery(value) {
  object(value, ['retryCount', 'initialError', 'initialStage', 'initialElapsedMs', 'totalElapsedMs']);
  requireThat(value.retryCount === 1 && value.initialError === 'screenshot_internal_error' && value.initialStage === 'awaiting_callback');
  number(value.initialElapsedMs, 0, 60000); number(value.totalElapsedMs, value.initialElapsedMs, 60000);
  return { retryCount: 1, initialError: 'screenshot_internal_error', initialStage: 'awaiting_callback', initialElapsedMs: value.initialElapsedMs, totalElapsedMs: value.totalElapsedMs };
}
export function captureDetails(value, includeStages = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const details = {};
  if (includeStages && ['queued', 'awaiting_callback', 'encoding'].includes(value.captureStage)) details.captureStage = value.captureStage;
  if (includeStages && Number.isInteger(value.captureElapsedMs) && value.captureElapsedMs >= 0 && value.captureElapsedMs <= 60000) details.captureElapsedMs = value.captureElapsedMs;
  if (Object.hasOwn(value, 'captureRecovery')) details.captureRecovery = captureRecovery(value.captureRecovery);
  return Object.keys(details).length ? details : undefined;
}
export function publicError(error) {
  const code = error instanceof Fault ? error.code : 'internal_error';
  const details = error instanceof Fault ? captureDetails(error.details, code.startsWith('screenshot_')) : undefined;
  return { error: { code, message: code.replaceAll('_', ' '), ...(details ? { details } : {}) } };
}
