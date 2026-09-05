import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import {
  createConnectorSchema,
  dashboardLayoutSchema,
  loginSchema,
  portalEventSchema,
  sendMessageSchema,
  setupSchema,
  type Connector,
  type Message,
} from "@orchestrator/contracts";
import { loadConfig, type AppConfig } from "./config.js";
import { Vault, hashPassword, randomToken, tokenHash, verifyPassword } from "./crypto.js";
import { audit, createDatabase, defaultDashboard, seedDemo } from "./db.js";
import { createSession, readSession, requireAuth, sessionCookie } from "./auth.js";
import { publicAdapterCatalog, runtimeAdapters, searchGbrain } from "./adapters.js";
import { ftsQuery, indexDirectory } from "./knowledge.js";
import { registerAlpha } from "./alpha.js";

const version = "0.1.0";
const csrfCookie = "orchestrator_csrf";

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function parseOrReply<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } } }, value: unknown, reply: { code(status: number): { send(payload: unknown): unknown } }): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    reply.code(400).send({ error: "Invalid request", issues: result.error.issues });
    return undefined;
  }
  return result.data;
}

function mapConnector(row: Record<string, unknown>): Connector {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as Connector["kind"],
    status: row.status as Connector["status"],
    capabilities: parseJson(String(row.capabilities_json)),
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
    error: row.error ? String(row.error) : null,
  };
}

export async function createApp(overrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  const events = new EventEmitter();
  events.setMaxListeners(500);
  const config = { ...loadConfig(), ...overrides };
  const db = createDatabase(config.dataDir);
  const vault = new Vault(config.dataDir, process.env.ORCHESTRATOR_MASTER_KEY);
  if (config.demo) seedDemo(db, (value) => vault.seal(value));
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.has(origin)) return reply.code(403).send({ error: "Origin is not allowed" });
  });

  app.get("/healthz", async () => ({ status: "ok", version, now: new Date().toISOString() }));

  app.get("/api/auth/status", async (request) => {
    const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    if (config.demo) return { mode: "demo", authenticated: true, setupRequired: false, user: { id: "demo-user", displayName: "Quinn" } };
    const session = readSession(db, request);
    return {
      mode: "private",
      authenticated: Boolean(session),
      setupRequired: userCount.count === 0,
      user: session ? { id: session.user_id, displayName: session.display_name } : null,
    };
  });

  app.post("/api/auth/setup", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    if (config.demo) return reply.code(409).send({ error: "Demo mode is already configured" });
    const body = parseOrReply(setupSchema, request.body, reply);
    if (!body) return;
    const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    if (count.count > 0) return reply.code(409).send({ error: "Setup is already complete" });
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(body.password);
    const latest = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    if (latest.count > 0) return reply.code(409).send({ error: "Setup is already complete" });
    db.prepare("INSERT INTO users VALUES (?,?,?,?)").run(userId, body.displayName, passwordHash, new Date().toISOString());
    db.prepare("INSERT INTO dashboard_layouts VALUES (?,?,?)").run(userId, JSON.stringify(defaultDashboard), new Date().toISOString());
    const session = createSession(db, userId);
    setAuthCookies(reply, session.token, session.csrf, session.expiresAt, request.protocol === "https");
    audit(db, userId, "auth.setup", userId);
    return reply.code(201).send({ user: { id: userId, displayName: body.displayName } });
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    if (config.demo) return { user: { id: "demo-user", displayName: "Quinn" } };
    const body = parseOrReply(loginSchema, request.body, reply);
    if (!body) return;
    const user = db.prepare("SELECT id, display_name, password_hash FROM users LIMIT 1").get() as { id: string; display_name: string; password_hash: string } | undefined;
    if (!user || !(await verifyPassword(body.password, user.password_hash))) return reply.code(401).send({ error: "Incorrect password" });
    const session = createSession(db, user.id);
    setAuthCookies(reply, session.token, session.csrf, session.expiresAt, request.protocol === "https");
    audit(db, user.id, "auth.login", user.id);
    return { user: { id: user.id, displayName: user.display_name } };
  });

  app.post("/api/ingest/events", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return reply.code(401).send({ error: "Ingest key required" });
    const secret = authorization.slice(7);
    const key = db.prepare("SELECT id FROM ingest_keys WHERE secret_hash = ?").get(tokenHash(secret)) as { id: string } | undefined;
    if (!key) return reply.code(401).send({ error: "Invalid ingest key" });
    const body = parseOrReply(portalEventSchema, request.body, reply);
    if (!body) return;
    const event = insertEvent(db, body);
    db.prepare("UPDATE ingest_keys SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), key.id);
    events.emit("event", event);
    return reply.code(202).send({ id: event.id, state: "accepted" });
  });

  const authenticated = requireAuth(db, config.demo);
  registerAlpha(app, db, vault, authenticated, config.demo);

  app.post("/api/auth/logout", { preHandler: authenticated }, async (request, reply) => {
    const token = request.cookies[sessionCookie];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
    reply.clearCookie(sessionCookie, { path: "/" }).clearCookie(csrfCookie, { path: "/" });
    return { ok: true };
  });

  app.get("/api/overview", { preHandler: authenticated }, async (request) => {
    const attention = db.prepare("SELECT * FROM attention_items WHERE resolved_at IS NULL ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 6").all();
    const projects = db.prepare("SELECT * FROM projects ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'at-risk' THEN 1 ELSE 2 END, updated_at DESC").all();
    const recurring = db.prepare("SELECT * FROM recurring_tasks ORDER BY next_run_at ASC LIMIT 8").all();
    const feed = db.prepare("SELECT * FROM events ORDER BY occurred_at DESC LIMIT 10").all();
    const connectors = db.prepare("SELECT * FROM connectors ORDER BY name").all().map((row) => mapConnector(row as Record<string, unknown>));
    const latestMetric = db.prepare("SELECT * FROM metrics_daily ORDER BY date DESC LIMIT 1").get();
    const previousMetric = db.prepare("SELECT * FROM metrics_daily ORDER BY date DESC LIMIT 1 OFFSET 1").get();
    const mailEvent = db.prepare("SELECT metadata_json FROM events WHERE kind = 'mail.summary' ORDER BY occurred_at DESC LIMIT 1").get() as { metadata_json: string } | undefined;
    const layoutRow = db.prepare("SELECT config_json FROM dashboard_layouts WHERE user_id = ?").get(request.principal?.userId ?? "demo-user") as { config_json: string } | undefined;
    const running = db.prepare("SELECT COUNT(*) AS count FROM events WHERE kind = 'work.running' AND occurred_at > ?").get(new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()) as { count: number };
    return {
      attention: attention.map(mapAttention),
      projects: projects.map(mapProject),
      recurring: recurring.map(mapRecurring),
      feed: feed.map(mapEvent),
      connectors,
      latestMetric: mapMetric(latestMetric as Record<string, unknown> | undefined),
      previousMetric: mapMetric(previousMetric as Record<string, unknown> | undefined),
      activeWork: running.count,
      mail: mapMailSummary(mailEvent?.metadata_json),
      brief: connectors.length === 0 ? { tone: "unknown", headline: "Your workspace is ready", detail: "Connect your first assistant to see work, decisions, and results here." } : connectors.some((c) => c.status !== "connected" || !c.lastSyncAt || Date.now() - Date.parse(c.lastSyncAt) > 900000) ? { tone: "unknown", headline: "Part of the picture needs an update", detail: "Some sources are unavailable or were last checked over 15 minutes ago. Sync connections before relying on this summary." } : buildBrief(attention.length, running.count, projects as Array<Record<string, unknown>>),
      layout: layoutRow ? parseJson(layoutRow.config_json) : defaultDashboard,
    };
  });

  app.get("/api/projects", { preHandler: authenticated }, async () => db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(mapProject));
  app.get("/api/attention", { preHandler: authenticated }, async () => db.prepare("SELECT * FROM attention_items ORDER BY resolved_at IS NOT NULL, created_at DESC").all().map(mapAttention));
  app.post("/api/attention/:id/resolve", { preHandler: authenticated }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare("UPDATE attention_items SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL").run(new Date().toISOString(), id);
    if (!result.changes) return reply.code(404).send({ error: "Attention item not found" });
    audit(db, request.principal!.userId, "attention.resolve", id);
    events.emit("event", { kind: "attention.resolved", id });
    return { ok: true };
  });

  app.get("/api/recurring", { preHandler: authenticated }, async () => db.prepare("SELECT * FROM recurring_tasks ORDER BY next_run_at").all().map(mapRecurring));
  app.get("/api/insights", { preHandler: authenticated }, async () => ({
    daily: db.prepare("SELECT * FROM metrics_daily ORDER BY date ASC").all().map(mapMetric),
    outcomes: db.prepare("SELECT kind, status, COUNT(*) AS count FROM events GROUP BY kind, status ORDER BY count DESC LIMIT 20").all(),
  }));

  app.get("/api/messages", { preHandler: authenticated }, async (request) => {
    const { connectorId = "demo", limit = "80" } = request.query as { connectorId?: string; limit?: string };
    const rows = db.prepare("SELECT * FROM messages WHERE connector_id = ? ORDER BY created_at DESC LIMIT ?").all(connectorId, Math.min(Number(limit) || 80, 200)).reverse();
    return rows.map((row) => mapMessage(row as Record<string, unknown>, vault));
  });

  app.post("/api/messages", { preHandler: authenticated, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const dispatch = db.prepare("SELECT payload FROM alpha_records WHERE id='dispatch'").get() as { payload: string } | undefined;
    if (dispatch && vault.open<{ paused: boolean }>(dispatch.payload).paused) return reply.code(409).send({ error: "Portal dispatch is paused. Resume it in Assistants before sending another request." });
    const body = parseOrReply(sendMessageSchema, request.body, reply);
    if (!body) return;
    const connectorRow = db.prepare("SELECT * FROM connectors WHERE id = ?").get(body.connectorId) as Record<string, unknown> | undefined;
    if (!connectorRow) return reply.code(404).send({ error: "Connector not found" });
    const adapter = runtimeAdapters.get(String(connectorRow.kind));
    if (!adapter?.sendMessage) return reply.code(409).send({ error: "This connector cannot send messages" });
    const correlationId = crypto.randomUUID();
    const userMessage: Message = { id: crypto.randomUUID(), connectorId: body.connectorId, role: "user", body: body.body, state: "accepted", createdAt: new Date().toISOString(), correlationId };
    insertMessage(db, userMessage, vault);
    events.emit("event", { kind: "message.accepted", message: userMessage });
    try {
      const history = db.prepare("SELECT * FROM messages WHERE connector_id=? AND id<>? AND state NOT IN ('unknown','failed') ORDER BY created_at DESC LIMIT 20").all(body.connectorId, userMessage.id).reverse().map((row) => ({ role: row.role as "user" | "assistant", content: vault.open<string>(String(row.body_encrypted)) }));
      const result = await adapter.sendMessage({ connectorId: body.connectorId, config: vault.open(String(connectorRow.config_encrypted)), history }, body.body, body.sessionKey);
      db.prepare("UPDATE messages SET state = ? WHERE id = ?").run(result.state, userMessage.id);
      const assistantMessage = result.reply ? {
        id: crypto.randomUUID(), connectorId: body.connectorId, role: "assistant" as const, body: result.reply,
        state: result.state, createdAt: new Date().toISOString(), correlationId,
      } : null;
      if (assistantMessage) insertMessage(db, assistantMessage, vault);
      audit(db, request.principal!.userId, "message.send", body.connectorId, { correlationId, state: result.state });
      events.emit("event", { kind: "message.result", message: assistantMessage, state: result.state, correlationId });
      return reply.code(201).send({ message: { ...userMessage, state: result.state }, reply: assistantMessage });
    } catch (error) {
      const detail = safeError(error);
      db.prepare("UPDATE messages SET state = 'unknown' WHERE id = ?").run(userMessage.id);
      audit(db, request.principal!.userId, "message.failed", body.connectorId, { correlationId, error: detail });
      return reply.code(502).send({ error: "Delivery is uncertain. Inspect the source before retrying.", message: { ...userMessage, state: "unknown" } });
    }
  });

  app.get("/api/connectors", { preHandler: authenticated }, async () => ({
    connectors: db.prepare("SELECT * FROM connectors ORDER BY name").all().map((row) => mapConnector(row as Record<string, unknown>)),
    catalog: publicAdapterCatalog().concat([{ id: "markdown-directory", displayName: "Markdown directory", version: "1.0.0", capabilities: ["knowledge.search", "knowledge.read", "health.read"] }]),
  }));

  app.post("/api/connectors", { preHandler: authenticated }, async (request, reply) => {
    const body = parseOrReply(createConnectorSchema, request.body, reply);
    if (!body) return;
    const capabilities = body.kind === "markdown-directory"
      ? ["knowledge.search", "knowledge.read", "health.read"]
      : runtimeAdapters.get(body.kind)?.manifest.capabilities;
    if (!capabilities) return reply.code(400).send({ error: "Unsupported connector kind" });
    try { validateConnectorConfig(body.kind, body.config); }
    catch (error) { return reply.code(400).send({ error: safeError(error) }); }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO connectors VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, body.name, body.kind, "disconnected", JSON.stringify(capabilities), vault.seal(body.config), null, null, null, now, now);
    audit(db, request.principal!.userId, "connector.create", id, { kind: body.kind });
    return reply.code(201).send(mapConnector(db.prepare("SELECT * FROM connectors WHERE id = ?").get(id) as Record<string, unknown>));
  });

  app.post("/api/connectors/:id/sync", { preHandler: authenticated }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare("SELECT * FROM connectors WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "Connector not found" });
    db.prepare("UPDATE connectors SET status = 'syncing', error = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    try {
      const connectorConfig = vault.open<Record<string, unknown>>(String(row.config_encrypted));
      if (row.kind === "markdown-directory") {
        const configuredPath = typeof connectorConfig.path === "string" ? connectorConfig.path : "";
        const count = await indexDirectory(db, id, configuredPath);
        updateConnectorHealth(db, id, "connected", 0, null);
        audit(db, request.principal!.userId, "connector.sync", id, { documents: count });
        return { connector: mapConnector(db.prepare("SELECT * FROM connectors WHERE id = ?").get(id) as Record<string, unknown>), imported: { documents: count, events: 0, recurringTasks: 0 } };
      }
      const adapter = runtimeAdapters.get(String(row.kind));
      if (!adapter) return reply.code(409).send({ error: "No runtime adapter is available" });
      const result = await adapter.sync({ connectorId: id, config: connectorConfig });
      for (const event of result.events) insertEvent(db, event);
      for (const task of result.recurringTasks ?? []) {
        db.prepare(`INSERT INTO recurring_tasks VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(connector_id,remote_id) DO UPDATE SET title=excluded.title,schedule=excluded.schedule,next_run_at=excluded.next_run_at,last_state=excluded.last_state`).run(
            crypto.randomUUID(), task.remoteId, task.title, task.schedule, task.nextRunAt ?? null, task.lastState, id,
          );
      }
      updateConnectorHealth(db, id, result.status, result.latencyMs, null);
      audit(db, request.principal!.userId, "connector.sync", id, { events: result.events.length, recurringTasks: result.recurringTasks?.length ?? 0 });
      events.emit("event", { kind: "connector.synced", connectorId: id });
      return { connector: mapConnector(db.prepare("SELECT * FROM connectors WHERE id = ?").get(id) as Record<string, unknown>), imported: { events: result.events.length, recurringTasks: result.recurringTasks?.length ?? 0 } };
    } catch (error) {
      const detail = safeError(error);
      updateConnectorHealth(db, id, "degraded", null, detail);
      return reply.code(502).send({ error: detail });
    }
  });

  app.delete("/api/connectors/:id", { preHandler: authenticated }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === "demo") return reply.code(409).send({ error: "The demo connector cannot be removed" });
    const result = db.prepare("DELETE FROM connectors WHERE id = ?").run(id);
    if (!result.changes) return reply.code(404).send({ error: "Connector not found" });
    audit(db, request.principal!.userId, "connector.delete", id);
    return reply.code(204).send();
  });

  app.get("/api/knowledge/search", { preHandler: authenticated }, async (request) => {
    const { q = "", limit = "12" } = request.query as { q?: string; limit?: string };
    const match = ftsQuery(q);
    if (!match) return { hits: [] };
    const rows = db.prepare(`SELECT knowledge_documents.id, knowledge_documents.title, knowledge_documents.uri,
      knowledge_documents.updated_at, connectors.name AS source,
      snippet(knowledge_fts, 1, '<mark>', '</mark>', ' … ', 26) AS excerpt,
      bm25(knowledge_fts) AS rank
      FROM knowledge_fts JOIN knowledge_documents ON knowledge_documents.rowid = knowledge_fts.rowid
      JOIN connectors ON connectors.id = knowledge_documents.connector_id
      WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT ?`).all(match, Math.min(Number(limit) || 12, 50));
    const warnings: string[] = [];
    const external: Array<{ id: string; title: string; excerpt: string; source: string; uri: string; score: number }> = [];
    const brains = db.prepare("SELECT id,name FROM connectors WHERE kind='gbrain-cli' AND status='connected'").all();
    if (brains.length) {
      try { external.push(...await searchGbrain(q)); }
      catch { warnings.push("gbrain search is unavailable. Local indexed results are shown; coverage is incomplete."); }
    }
    return { warnings, hits: [...rows.map((row) => {
      const item = row as Record<string, unknown>;
      return { id: item.id, title: item.title, uri: item.uri, updatedAt: item.updated_at, source: item.source, excerpt: item.excerpt, score: Math.abs(Number(item.rank)) };
    }), ...external] };
  });

  app.put("/api/dashboard/layout", { preHandler: authenticated }, async (request, reply) => {
    const body = parseOrReply(dashboardLayoutSchema, request.body, reply);
    if (!body) return;
    const userId = request.principal!.userId;
    const prior = db.prepare("SELECT config_json FROM dashboard_layouts WHERE user_id=?").get(userId) as { config_json: string } | undefined;
    const revisionId = crypto.randomUUID();
    db.prepare("INSERT INTO alpha_records VALUES (?,?,?,?)").run(revisionId, "layout-revision", vault.seal({ id: revisionId, userId, layout: prior ? JSON.parse(prior.config_json) : defaultDashboard }), new Date().toISOString());
    db.prepare(`INSERT INTO dashboard_layouts VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at`).run(userId, JSON.stringify(body), new Date().toISOString());
    return body;
  });

  app.post("/api/ingest-keys", { preHandler: authenticated }, async (request, reply) => {
    const name = typeof (request.body as { name?: unknown } | null)?.name === "string" ? (request.body as { name: string }).name.trim().slice(0, 80) : "Integration";
    if (!name) return reply.code(400).send({ error: "Name is required" });
    const secret = `opk_${randomToken(32)}`;
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO ingest_keys VALUES (?,?,?,?,?)").run(id, name, tokenHash(secret), new Date().toISOString(), null);
    audit(db, request.principal!.userId, "ingest-key.create", id);
    return reply.code(201).send({ id, name, secret, warning: "Copy this key now. It cannot be shown again." });
  });

  app.get("/api/ingest-keys", { preHandler: authenticated }, async () => db.prepare("SELECT id,name,created_at AS createdAt,last_used_at AS lastUsedAt FROM ingest_keys ORDER BY created_at DESC").all());

  app.delete("/api/ingest-keys/:id", { preHandler: authenticated }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare("DELETE FROM ingest_keys WHERE id = ?").run(id);
    if (!result.changes) return reply.code(404).send({ error: "Ingest key not found" });
    audit(db, request.principal!.userId, "ingest-key.revoke", id);
    return reply.code(204).send();
  });

  app.get("/api/audit", { preHandler: authenticated }, async (request) => {
    const { limit = "100" } = request.query as { limit?: string };
    return db.prepare("SELECT id,actor,action,target,detail_json AS detail,created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT ?").all(Math.min(Number(limit) || 100, 500));
  });

  app.get("/api/events/stream", { preHandler: authenticated }, async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ now: new Date().toISOString() })}\n\n`);
    const send = (event: unknown) => reply.raw.write(`event: portal\ndata: ${JSON.stringify(event)}\n\n`);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 20_000);
    events.on("event", send);
    request.raw.on("close", () => { clearInterval(heartbeat); events.off("event", send); });
  });

  if (existsSync(path.join(config.webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }

  app.addHook("onClose", async () => db.close());
  return app;
}

function setAuthCookies(reply: { setCookie(name: string, value: string, options: Record<string, unknown>): unknown }, token: string, csrf: string, expiresAt: string, secure: boolean): void {
  const common = { path: "/", sameSite: "strict" as const, secure, expires: new Date(expiresAt) };
  reply.setCookie(sessionCookie, token, { ...common, httpOnly: true });
  reply.setCookie(csrfCookie, csrf, { ...common, httpOnly: false });
}

function insertMessage(db: ReturnType<typeof createDatabase>, message: Message, vault: Vault): void {
  db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?)").run(message.id, message.connectorId, message.role, vault.seal(message.body), message.state, message.correlationId, message.createdAt);
}

function insertEvent(db: ReturnType<typeof createDatabase>, event: ReturnType<typeof portalEventSchema.parse>) {
  const id = event.id ?? crypto.randomUUID();
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const receivedAt = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM events WHERE id=?").get(id);
  if (existing) return { ...event, id, occurredAt, receivedAt };
  db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, event.source, event.kind, event.title, event.summary, event.status, occurredAt, receivedAt, event.projectId ?? null, JSON.stringify(event.metadata));
  applyEventProjection(db, id, event, occurredAt);
  return { ...event, id, occurredAt, receivedAt };
}

function applyEventProjection(db: ReturnType<typeof createDatabase>, eventId: string, event: ReturnType<typeof portalEventSchema.parse>, occurredAt: string): void {
  const metadata = event.metadata;
  if (event.kind === "usage.daily") {
    const date = occurredAt.slice(0, 10);
    db.prepare(`INSERT INTO metrics_daily VALUES (?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET
      tokens=excluded.tokens,cost=excluded.cost,completed=excluded.completed,failed=excluded.failed,latency_ms=excluded.latency_ms`).run(
        date, safeNumber(metadata.tokens), safeNumber(metadata.cost), safeNumber(metadata.completed), safeNumber(metadata.failed), safeNumber(metadata.latencyMs),
      );
  }
  if (event.kind === "attention.required") {
    const attentionId = safeString(metadata.attentionId) ?? eventId;
    const severity = ["critical", "high", "medium", "low"].includes(String(metadata.severity)) ? String(metadata.severity) : "medium";
    db.prepare(`INSERT INTO attention_items VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      severity=excluded.severity,title=excluded.title,detail=excluded.detail,source=excluded.source,due_at=excluded.due_at,resolved_at=NULL`).run(
        attentionId, severity, event.title, event.summary, event.source, occurredAt, safeString(metadata.dueAt) ?? null, null,
      );
  }
  if (event.kind === "attention.resolved") {
    const attentionId = safeString(metadata.attentionId);
    if (attentionId) db.prepare("UPDATE attention_items SET resolved_at = ? WHERE id = ?").run(occurredAt, attentionId);
  }
  if (event.kind === "project.health") {
    const projectId = event.projectId ?? safeString(metadata.projectId) ?? eventId;
    const status = ["on-track", "at-risk", "blocked", "complete"].includes(String(metadata.status)) ? String(metadata.status) : "on-track";
    db.prepare(`INSERT INTO projects VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,description=excluded.description,status=excluded.status,health=excluded.health,progress=excluded.progress,due_at=excluded.due_at,updated_at=excluded.updated_at`).run(
        projectId, safeString(metadata.name) ?? event.title, safeString(metadata.description) ?? event.summary, status,
        Math.max(0, Math.min(100, safeNumber(metadata.health))), Math.max(0, Math.min(100, safeNumber(metadata.progress))), safeString(metadata.dueAt) ?? null, occurredAt,
      );
  }
}

function mapMessage(row: Record<string, unknown>, vault: Vault): Message {
  return { id: String(row.id), connectorId: String(row.connector_id), role: row.role as Message["role"], body: vault.open<string>(String(row.body_encrypted)), state: row.state as Message["state"], createdAt: String(row.created_at), correlationId: row.correlation_id ? String(row.correlation_id) : null };
}

function mapAttention(row: unknown) {
  const item = row as Record<string, unknown>;
  return { id: item.id, severity: item.severity, title: item.title, detail: item.detail, source: item.source, createdAt: item.created_at, dueAt: item.due_at, resolvedAt: item.resolved_at };
}

function mapProject(row: unknown) {
  const item = row as Record<string, unknown>;
  return { id: item.id, name: item.name, description: item.description, status: item.status, health: item.health, progress: item.progress, dueAt: item.due_at, updatedAt: item.updated_at };
}

function mapRecurring(row: unknown) {
  const item = row as Record<string, unknown>;
  return { id: item.id, title: item.title, schedule: item.schedule, nextRunAt: item.next_run_at, lastState: item.last_state, connectorId: item.connector_id };
}

function mapEvent(row: unknown) {
  const item = row as Record<string, unknown>;
  return { id: item.id, source: item.source, kind: item.kind, title: item.title, summary: item.summary, status: item.status, occurredAt: item.occurred_at, projectId: item.project_id, metadata: parseJson(String(item.metadata_json ?? "{}")) };
}

function mapMetric(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return { date: row.date, tokens: row.tokens, cost: row.cost, completed: row.completed, failed: row.failed, latencyMs: row.latency_ms };
}

function mapMailSummary(value: string | undefined) {
  const metadata = value ? parseJson<Record<string, unknown>>(value) : {};
  return { waiting: safeNumber(metadata.waiting), handled: safeNumber(metadata.handled), drafts: safeNumber(metadata.drafts), urgent: safeNumber(metadata.urgent) };
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

function buildBrief(attentionCount: number, activeWork: number, projects: Array<Record<string, unknown>>) {
  const risks = projects.filter((project) => project.status === "at-risk" || project.status === "blocked").length;
  if (attentionCount === 0 && risks === 0) return { tone: "clear", headline: "Everything important is moving", detail: `${activeWork} active work item${activeWork === 1 ? "" : "s"}; nothing currently needs your decision.` };
  return { tone: risks > 0 ? "watch" : "focus", headline: `${attentionCount} item${attentionCount === 1 ? "" : "s"} deserve your attention`, detail: `${activeWork} work item${activeWork === 1 ? " is" : "s are"} active. ${risks} project${risks === 1 ? " has" : "s have"} elevated risk.` };
}

function validateConnectorConfig(kind: string, config: Record<string, unknown>): void {
  if (["generic-webhook", "hermes-api", "t3-workspace"].includes(kind)) {
    if (typeof config.endpoint !== "string") throw new Error("Webhook endpoint is required");
    const url = new URL(config.endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Webhook endpoint must be a valid HTTP(S) URL");
    if (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Remote connections require HTTPS");
  }
  if (kind === "markdown-directory" && (typeof config.path !== "string" || !config.path.trim())) throw new Error("Directory path is required");
  if (kind === "openclaw-cli" && config.agentId !== undefined && typeof config.agentId !== "string") throw new Error("Agent id must be a string");
}

function updateConnectorHealth(db: ReturnType<typeof createDatabase>, id: string, status: string, latencyMs: number | null, error: string | null): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE connectors SET status=?,latency_ms=?,error=?,last_sync_at=?,updated_at=? WHERE id=?").run(status, latencyMs, error, now, now, id);
}

function safeError(error: unknown): string {
  if (error && typeof error === "object" && ("cmd" in error || "stdout" in error || "stderr" in error)) return "The local command did not complete. Check the runtime installation and source status.";
  if (error instanceof Error) return error.message.replaceAll(/(Bearer|token|password|secret)\s+[A-Za-z0-9._~+/-]+/gi, "$1 [redacted]").slice(0, 600);
  return "The connector did not complete the request";
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen({ host: config.host, port: config.port });
}
