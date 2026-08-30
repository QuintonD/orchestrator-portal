import type { DatabaseSync } from "node:sqlite";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomToken, tokenHash } from "./crypto.js";

export const sessionCookie = "orchestrator_session";

interface SessionRow {
  id: string;
  user_id: string;
  display_name: string;
  csrf_hash: string;
  expires_at: string;
}

export interface Principal {
  userId: string;
  displayName: string;
  csrfToken?: string;
  demo: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export function createSession(db: DatabaseSync, userId: string): { token: string; csrf: string; expiresAt: string } {
  const token = randomToken();
  const csrf = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000).toISOString();
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?,?)").run(
    crypto.randomUUID(), userId, tokenHash(token), tokenHash(csrf), expiresAt, now.toISOString(), now.toISOString(),
  );
  return { token, csrf, expiresAt };
}

export function readSession(db: DatabaseSync, request: FastifyRequest): SessionRow | null {
  const token = request.cookies[sessionCookie];
  if (!token) return null;
  const row = db.prepare(`SELECT sessions.id, sessions.user_id, users.display_name, sessions.csrf_hash, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?`).get(tokenHash(token)) as SessionRow | undefined;
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return row;
}

export function requireAuth(db: DatabaseSync, demo: boolean) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (demo) {
      request.principal = { userId: "demo-user", displayName: "Quinn", demo: true };
      return;
    }
    const session = readSession(db, request);
    if (!session) return reply.code(401).send({ error: "Authentication required" });
    request.principal = { userId: session.user_id, displayName: session.display_name, demo: false };
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || tokenHash(csrf) !== session.csrf_hash) return reply.code(403).send({ error: "Invalid request token" });
    }
  };
}
