// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
export const METHODS = Object.freeze(['describe', 'observe', 'apps.list', 'app.launch', 'tap', 'longPress', 'swipe', 'pinch', 'node.click', 'node.scroll', 'type', 'key', 'fixture.increment', 'stop']);
export const MUTATIONS = new Set(METHODS.filter((method) => !['describe', 'observe', 'apps.list'].includes(method)));
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
export function validateGrant(value, session = false) {
  const required = session ? ['deviceId', 'apps', 'operations', 'ttlSeconds'] : ['label', 'devices', 'apps', 'operations', 'ttlSeconds'];
  object(value, [...required, ...(session ? [] : ['sessionIds']), 'disclosure'], required);
  if (session) identifier(value.deviceId); else { string(value.label, 80); list(value.devices, identifier, 16); }
  if (!session && Object.hasOwn(value, 'sessionIds')) list(value.sessionIds, identifier, 256);
  if (Object.hasOwn(value, 'disclosure')) { object(value.disclosure, ['screenshots']); requireThat(typeof value.disclosure.screenshots === 'boolean'); }
  list(value.apps, packageName, 32); operations(value.operations); number(value.ttlSeconds, 60, session ? 3600 : 86400);
}
function observation(value) { identifier(value); }
function point(value) { object(value, ['x', 'y']); number(value.x, 0, 16383); number(value.y, 0, 16383); }
export function validateCall(value) {
  object(value, ['id', 'deviceId', 'sessionId', 'taskId', 'method', 'params'], ['id', 'deviceId', 'sessionId', 'method', 'params']); identifier(value.id); identifier(value.deviceId); identifier(value.sessionId);
  if (Object.hasOwn(value, 'taskId')) identifier(value.taskId);
  requireThat(METHODS.includes(value.method)); const p = value.params;
  switch (value.method) {
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
export function captureDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const details = {};
  if (['queued', 'awaiting_callback', 'encoding'].includes(value.captureStage)) details.captureStage = value.captureStage;
  if (Number.isInteger(value.captureElapsedMs) && value.captureElapsedMs >= 0 && value.captureElapsedMs <= 60000) details.captureElapsedMs = value.captureElapsedMs;
  return Object.keys(details).length ? details : undefined;
}
export function publicError(error) {
  const code = error instanceof Fault ? error.code : 'internal_error';
  const details = code.startsWith('screenshot_') ? captureDetails(error.details) : undefined;
  return { error: { code, message: code.replaceAll('_', ' '), ...(details ? { details } : {}) } };
}
