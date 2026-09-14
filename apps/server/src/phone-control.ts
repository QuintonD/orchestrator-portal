import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { audit } from "./db.js";
import { boundedText } from "./source-http.js";
import { createHash, createPublicKey, randomUUID, verify, type KeyObject } from "node:crypto";

// A browser can select a known device, never a transport address or native secret.
const brokerOrigin = "http://127.0.0.1:4421";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
class BrokerRefusal extends Error { constructor(readonly code: string) { super("Phone request was rejected before dispatch"); } }
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/);
const packageName = z.string().max(200).regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/);
const method = z.enum(["describe", "observe", "apps.list", "app.launch", "tap", "longPress", "swipe", "pinch", "type", "key", "stop", "fixture.increment", "node.click", "node.scroll", "document.read", "document.replace", "draft.create"]);
const documentScope = z.object({ adapter: z.literal("android.document.v1"), resourceIds: z.array(identifier).min(1).max(32).refine((value) => new Set(value).size === value.length), effects: z.array(z.enum(["document.read", "document.replace"])).min(1).max(2).refine((value) => new Set(value).size === value.length && (!value.includes("document.replace") || value.includes("document.read"))) }).strict();
const folderId = z.string().uuid();
const resourceScope = z.union([documentScope, z.object({ adapter: z.literal("android.folder-drafts.v1"), resourceIds: z.array(folderId).min(1).max(32).refine((ids) => new Set(ids).size === ids.length), effects: z.tuple([z.literal("draft.create")]) }).strict()]);
const documentText = z.string().max(2000).refine((value) => !/[\u0000\uD800-\uDFFF]/u.test(value) && Buffer.byteLength(value, "utf8") <= 8192);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const documentRead = z.object({ resourceId: identifier, revision, text: documentText }).strict().refine((value) => hash(value.text) === value.revision);
const disclosure = z.object({ screenshots: z.boolean() }).strict();
const scope = { apps: z.array(packageName).max(32).refine((value) => new Set(value).size === value.length), operations: z.array(method).min(1).max(32).refine((value) => new Set(value).size === value.length), disclosure: disclosure.optional(), resourceScope: resourceScope.optional() };
function validScope(value: { apps: string[]; operations: string[]; disclosure?: { screenshots: boolean } | undefined; resourceScope?: z.infer<typeof resourceScope> | undefined }) {
  return value.resourceScope ? value.apps.length === 0 && !value.disclosure?.screenshots && value.operations.every((operation) => operation === "describe" || operation === "stop" || value.resourceScope!.effects.some((effect) => effect === operation)) : value.apps.length > 0 && value.operations.every((operation) => !operation.startsWith("document.") && operation !== "draft.create");
}
const sessionIds = z.array(identifier).min(1).max(256).refine((value) => new Set(value).size === value.length).optional();
const sessionInput = z.object({ deviceId: identifier, ...scope, ttlSeconds: z.number().int().min(60).max(3600) }).strict().refine(validScope);
const credentialInput = z.object({ label: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/u), devices: z.array(identifier).min(1).max(16).refine((value) => new Set(value).size === value.length), sessionIds, ...scope, ttlSeconds: z.number().int().min(60).max(86400) }).strict().refine(validScope);
const session = z.object({ id: identifier, deviceId: identifier, ...scope, expiresAt: z.string().max(40), revokedAt: z.string().max(40).optional() });
const credential = z.object({ id: identifier, label: z.string().max(80), devices: z.array(identifier).max(20), sessionIds, ...scope, expiresAt: z.string().max(40), revokedAt: z.string().max(40).optional() });
const task = z.object({ id: identifier, deviceId: identifier, sessionId: identifier, actorId: identifier.optional(), label: z.string().max(80).optional(), resourceScope: resourceScope.optional(), expiresAt: z.string().max(40), maxActions: z.number().int().min(1).max(1000), actionsUsed: z.number().int().min(0).max(1000), status: z.enum(["active", "completed", "expired", "revoked", "interrupted"]), outcome: z.literal("unverified") });
const taskInput = z.object({ deviceId: identifier, sessionId: identifier, ttlSeconds: z.number().int().min(1).max(300), maxActions: z.number().int().min(1).max(100), label: z.string().min(1).max(80).optional(), resourceScope: resourceScope.optional() }).strict();
const state = z.object({ storageState: z.enum(["ready", "unavailable"]).optional(), devices: z.array(z.object({ id: identifier, label: z.string().max(100), busy: z.boolean(), connection: z.enum(["recently_observed", "unknown"]).optional(), lastSeenAt: z.string().max(40).optional(), actionState: z.enum(["ready", "unknown"]).optional() })).max(100), sessions: z.array(session).max(1000), credentials: z.array(credential).max(1000), tasks: z.array(task).max(1024).optional() });
const auditEvents = z.object({ events: z.array(z.object({ at: z.string().max(40), actorId: z.string().max(100), deviceId: identifier.optional(), method: method.optional(), status: z.string().max(40), code: z.string().max(80).optional() })).max(1000) });
const point = z.object({ x: z.number().int().min(0).max(16383), y: z.number().int().min(0).max(16383) }).strict();
const observationId = identifier;
const empty = z.object({}).strict();
const callInputs = {
  "draft.create": z.object({ resourceId: folderId, text: documentText }).strict(),
  "document.read": z.object({ resourceId: identifier }).strict(),
  "document.replace": z.object({ resourceId: identifier, expectedRevision: revision, text: documentText }).strict(),
  describe: empty, observe: z.object({ includeScreenshot: z.boolean().optional() }).strict(), "apps.list": empty, stop: empty,
  "app.launch": z.object({ packageName }).strict(),
  tap: point.extend({ observationId }).strict(),
  longPress: point.extend({ observationId, durationMs: z.number().int().min(200).max(2000) }).strict(),
  swipe: z.object({ observationId, points: z.array(point).min(2).max(20), durationMs: z.number().int().min(100).max(2000) }).strict(),
  pinch: z.object({ observationId, centerX: z.number().int().min(0).max(16383), centerY: z.number().int().min(0).max(16383), scale: z.number().min(0.5).max(2).refine((value) => value !== 1), durationMs: z.number().int().min(100).max(2000) }).strict(),
  type: z.object({ observationId, nodeId: identifier, text: z.string().min(1).max(2000).refine((value) => !value.includes("\u0000")) }).strict(),
  "fixture.increment": z.object({ observationId }).strict(),
  "node.click": z.object({ observationId, nodeId: identifier }).strict(),
  "node.scroll": z.object({ observationId, nodeId: identifier, direction: z.enum(["forward", "backward"]) }).strict(),
  key: z.object({ observationId, key: z.enum(["back", "home"]) }).strict(),
};
const callInput = z.object({ id: identifier, deviceId: identifier, sessionId: identifier, taskId: identifier.optional(), method, params: z.unknown() }).strict().refine((value) => !(value.method.startsWith("document.") || value.method === "draft.create") || Boolean(value.taskId));
const captureRecovery = z.object({ retryCount: z.literal(1), initialError: z.literal("screenshot_internal_error"), initialStage: z.literal("awaiting_callback"), initialElapsedMs: z.number().int().min(0).max(60000), totalElapsedMs: z.number().int().min(0).max(60000) }).strict().refine((value) => value.totalElapsedMs >= value.initialElapsedMs);
const captureDetails = z.object({ captureRecovery: captureRecovery.optional() });
const receipt = z.object({ id: identifier, status: z.enum(["observed", "completed", "rejected", "unknown"]), result: z.unknown().optional(), error: z.object({ code: z.string().regex(/^[A-Z0-9_]{1,80}$/i), message: z.string().max(1000), details: captureDetails.optional() }).optional() });
const observation = z.object({
  observationId, packageName: z.string().max(200), windowId: z.union([z.number().int(), z.string().max(128)]), width: z.number().int().min(0).max(16384), height: z.number().int().min(0).max(16384), capturedAt: z.string().max(40),
  screenshot: z.object({ mimeType: z.literal("image/png"), base64: z.string().max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).optional(),
  captureRecovery: captureRecovery.optional(),
  touchBounds: z.object({ left: z.number().int().min(0).max(16384), top: z.number().int().min(0).max(16384), right: z.number().int().min(0).max(16384), bottom: z.number().int().min(0).max(16384) }).strict().optional(),
  nodes: z.array(z.object({ id: identifier, text: z.string().max(16384).optional(), description: z.string().max(16384).optional(), bounds: z.object({ left: z.number().int(), top: z.number().int(), right: z.number().int(), bottom: z.number().int() }), editable: z.boolean(), clickable: z.boolean(),
    resourceId: z.string().max(256).optional(), className: z.string().max(256).optional(), enabled: z.boolean().optional(), scrollable: z.boolean().optional(), checkable: z.boolean().optional(), selected: z.boolean().optional(),
    checkedState: z.enum(["unchecked", "checked", "mixed"]).optional(), stateDescription: z.string().max(256).optional(), hintText: z.string().max(256).optional(),
    actions: z.array(z.enum(["click", "longClick", "scrollForward", "scrollBackward", "setText"])).max(5).refine((value) => new Set(value).size === value.length).optional(),
  })).max(1000),
  blockedReason: z.string().max(200).optional(),
}).refine(({ touchBounds: bounds, width, height }) => !bounds || Object.values(bounds).every((value) => value === 0)
  || bounds.right > bounds.left && bounds.bottom > bounds.top && bounds.right <= width && bounds.bottom <= height);
const stopped = z.object({ revoked: z.literal(true), stopStatus: z.enum(["completed", "unknown"]).optional() });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Object.assign(new Error("Invalid phone-control request"), { statusCode: 400 });
  return parsed.data;
}

export function registerPhoneControl(app: FastifyInstance, db: DatabaseSync, authenticated: preHandlerHookHandler, demo: boolean) {
  const token = process.env.ORCHESTRATOR_PHONE_BROKER_TOKEN?.trim();
  let publicKey: KeyObject | undefined;
  try {
    const pem = process.env.ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY?.trim();
    if (pem && pem.length <= 2048) { const key = createPublicKey(pem); if (key.asymmetricKeyType === "ed25519") publicKey = key; }
  } catch { /* A missing or invalid owner pin must not authenticate the broker. */ }
  const configured = Boolean(token && token.length >= 32 && token.length <= 512 && !/[\s\u0000-\u001f]/u.test(token));
  const opts = { preHandler: authenticated, bodyLimit: 32 * 1024, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
  // Stop/revoke have a separate budget, so ordinary calls cannot exhaust their allowance.
  const stopOpts = { ...opts, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  function requireBroker() {
    if (demo) throw Object.assign(new Error("Exploration mode is synthetic. Phone requests are disabled."), { statusCode: 409 });
    if (!configured) throw Object.assign(new Error("Phone control is disabled. Configure the standalone broker on this computer."), { statusCode: 503 });
  }
  async function requestBroker<T>(path: string, schema: z.ZodType<T>, body?: unknown, verb = body === undefined ? "GET" : "POST"): Promise<T> {
    requireBroker();
    if (!publicKey && !/^\/v1\/devices\/[A-Za-z0-9_-]+\/stop$/.test(path)) throw new Error("Configure the owner's broker public key before use");
    const nonce = randomUUID();
    const requestText = body === undefined ? "" : JSON.stringify(body);
    // No redirects, alternate hosts, forwarded browser headers, or automatic retries.
    const response = await fetch(`${brokerOrigin}${path}`, {
      method: verb, redirect: "error", headers: { authorization: `Bearer ${token}`, "x-phone-request-nonce": nonce, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: requestText }), signal: AbortSignal.timeout(verb === "GET" ? 8000 : 55000),
    });
    const text = await boundedText(response, 8 * 1024 * 1024);
    const signature = response.headers.get("x-phone-response-signature");
    // Public HTTP protocol verification; no component code or execution authority is imported.
    const signed = Buffer.from(JSON.stringify(["orchestrator-phone-control/http-response/v1", nonce, verb, path, hash(requestText), response.status, hash(text)]));
    if (!publicKey || !signature || !/^[A-Za-z0-9_-]{86}$/.test(signature) || !verify(null, signed, publicKey, Buffer.from(signature, "base64url"))) throw new Error("Broker response authenticity was not confirmed");
    // Never reflect an upstream error, admin credential, or private device configuration.
    if (token && text.includes(token)) throw new Error("Broker returned private configuration");
    if (!response.ok) {
      const rejected = JSON.parse(text);
      if (path === "/v1/call" && rejected.dispatch?.state === "not_dispatched" && rejected.dispatch.requestHash === hash(requestText) && /^[a-z_]{1,60}$/.test(rejected.error?.code ?? "")) throw new BrokerRefusal(rejected.error.code);
      throw new Error("Broker request was not confirmed");
    }
    return schema.parse(JSON.parse(text));
  }
  app.get("/api/phone-control/state", opts, async (_request, reply) => {
    reply.header("cache-control", "no-store");
    if (demo) return { mode: "demo", devices: [{ id: "sample-phone", label: "Sample Android phone", busy: false }], sessions: [], credentials: [], events: [] };
    if (!configured) return { mode: "disabled", devices: [], sessions: [], credentials: [], events: [] };
    try {
      const [data, events] = await Promise.all([requestBroker("/v1/state", state), requestBroker("/v1/audit", auditEvents)]);
      return { mode: "connected", ...data, ...events };
    } catch { return { mode: "unavailable", devices: [], sessions: [], credentials: [], events: [] }; }
  });
  app.post("/api/phone-control/sessions", opts, async (request, reply) => {
    const body = parse(sessionInput, request.body); requireBroker(); reply.header("cache-control", "no-store");
    try {
      const result = await requestBroker("/v1/sessions", z.object({ session }), body);
      audit(db, request.principal!.userId, "phone.session.create", result.session.id);
      return result;
    } catch { return reply.code(502).send({ error: "Session creation is uncertain. Refresh the session list before trying again." }); }
  });
  app.post("/api/phone-control/credentials", opts, async (request, reply) => {
    const body = parse(credentialInput, request.body); requireBroker(); reply.header("cache-control", "no-store");
    try {
      const result = await requestBroker("/v1/credentials", z.object({ credential: credential.extend({ token: z.string().min(32).max(512) }) }), body);
      audit(db, request.principal!.userId, "phone.credential.create", result.credential.id);
      return result;
    } catch { return reply.code(502).send({ error: "Credential creation is uncertain. Refresh and revoke any unexpected credential before trying again." }); }
  });
  app.post("/api/phone-control/tasks", opts, async (request, reply) => {
    const body = parse(taskInput, request.body); requireBroker(); reply.header("cache-control", "no-store");
    try {
      const result = await requestBroker("/v1/tasks", z.object({ task }), body);
      audit(db, request.principal!.userId, "phone.task.create", result.task.id);
      return result;
    } catch { return reply.code(502).send({ error: "Phone control could not be reserved. Refresh task status before trying again; another workflow may hold the phone." }); }
  });
  app.delete("/api/phone-control/tasks/:id", stopOpts, async (request, reply) => {
    const { id } = parse(z.object({ id: identifier }).strict(), request.params); requireBroker(); reply.header("cache-control", "no-store");
    try {
      const result = await requestBroker(`/v1/tasks/${id}`, z.object({ task }), undefined, "DELETE");
      audit(db, request.principal!.userId, "phone.task.end", id);
      return result;
    } catch { return reply.code(502).send({ error: "The control reservation could not be ended. A request or outcome may still be pending. Stop phone access and inspect the device." }); }
  });
  for (const kind of ["sessions", "credentials"] as const) {
    app.delete(`/api/phone-control/${kind}/:id`, stopOpts, async (request, reply) => {
      const { id } = parse(z.object({ id: identifier }).strict(), request.params); requireBroker(); reply.header("cache-control", "no-store");
      try {
        const result = await requestBroker(`/v1/${kind}/${id}`, stopped, undefined, "DELETE");
        audit(db, request.principal!.userId, `phone.${kind}.revoke`, id, { status: result.stopStatus ?? "revoked" });
        return result;
      } catch { return reply.code(502).send({ error: "Revocation is uncertain. Stop access on the phone and refresh to check its status." }); }
    });
  }
  app.post("/api/phone-control/devices/:id/stop", stopOpts, async (request, reply) => {
    const { id } = parse(z.object({ id: identifier }).strict(), request.params); parse(empty, request.body); requireBroker(); reply.header("cache-control", "no-store");
    try {
      const result = await requestBroker(`/v1/devices/${id}/stop`, stopped, {});
      audit(db, request.principal!.userId, "phone.stop", id, { status: result.stopStatus });
      return result;
    } catch { return reply.code(502).send({ error: "Stop is unconfirmed. Use Stop access on the phone now and inspect its state." }); }
  });
  app.post("/api/phone-control/call", opts, async (request, reply) => {
    const body = parse(callInput, request.body);
    const params = parse(callInputs[body.method] as z.ZodType, body.params);
    requireBroker(); reply.header("cache-control", "no-store");
    try {
      const raw = await requestBroker("/v1/call", receipt, { ...body, params });
      if (raw.id !== body.id) throw new Error("Mismatched receipt");
      const mutation = !["observe", "describe", "apps.list", "document.read"].includes(body.method);
      // Authenticity identifies the sender; contradictory receipts still cannot
      // release the browser's pending-action latch or attest a dispatch.
      if (raw.status === "completed") {
        if (!mutation || raw.error !== undefined) throw new Error("Invalid completed receipt");
        const dispatch = z.object({ status: z.enum(["dispatched", "completed", "stopped"]) }).parse(raw.result);
        if (body.method === "stop" && dispatch.status !== "stopped") throw new Error("Unconfirmed stop receipt");
        if ((body.method === "document.replace" || body.method === "draft.create")) z.object({ status: z.literal("completed") }).strict().parse(raw.result);
      } else if (raw.status === "observed") {
        if (mutation || raw.error !== undefined) throw new Error("Invalid observation receipt");
      } else if (raw.result !== undefined) throw new Error("Contradictory rejected or unknown receipt");
      let result: unknown;
      if (raw.status === "observed" && body.method === "document.read") {
        const document = documentRead.parse(raw.result);
        if (document.resourceId !== (params as { resourceId: string }).resourceId) throw new Error("Mismatched document");
        result = document;
      } else if (raw.status === "observed" && body.method === "observe") {
        const observed = observation.parse(raw.result);
        // Screen pixels require separate browser opt-in even when the source includes them.
        if (!(params as { includeScreenshot?: boolean }).includeScreenshot) delete observed.screenshot;
        result = observed;
      } else if (raw.status === "observed" && body.method === "apps.list") {
        result = z.object({ apps: z.array(z.object({ packageName, label: z.string().max(200) })).max(500) }).parse(raw.result);
      } else if (raw.status === "observed" && body.method === "describe") {
        result = z.object({ protocolVersion: z.literal(1), platform: z.literal("android"), methods: z.array(method).max(32), session: z.object({ expiresAt: z.string().max(40).optional() }), capabilities: z.object({ screenshots: z.boolean(), gestures: z.boolean(), biometricConsent: z.boolean() }) }).parse(raw.result);
      }
      audit(db, request.principal!.userId, "phone.call", body.deviceId, { method: body.method, status: raw.status, receiptId: body.id });
      return { id: raw.id, status: raw.status, ...(result === undefined ? {} : { result }), ...(raw.error ? { error: { code: raw.error.code, message: "The phone or broker rejected this request. Check scope, freshness, and consent on the phone.", ...(raw.error.details?.captureRecovery ? { details: { captureRecovery: raw.error.details.captureRecovery } } : {}) } } : {}) };
    } catch (error) {
      if (error instanceof BrokerRefusal) {
        audit(db, request.principal!.userId, "phone.call", body.deviceId, { method: body.method, status: "rejected", receiptId: body.id });
        return { id: body.id, status: "rejected", error: { code: error.code, message: "The authenticated broker rejected this request before dispatch. Check the session, task and allowed operations." } };
      }
      audit(db, request.principal!.userId, "phone.call", body.deviceId, { method: body.method, status: "unknown", receiptId: body.id });
      return { id: body.id, status: "unknown", error: { code: "BROKER_UNCONFIRMED", message: "No reliable receipt was received. Inspect the phone before sending another action. This request was not retried." } };
    }
  });
}
