import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DashboardLayout } from "@orchestrator/contracts";

export const defaultDashboard: DashboardLayout = {
  widgets: [
    { id: "attention", visible: true, size: "compact" },
    { id: "active-work", visible: true, size: "compact" },
    { id: "daily-brief", visible: true, size: "wide" },
    { id: "projects", visible: true, size: "wide" },
    { id: "recurring", visible: true, size: "wide" },
    { id: "usage", visible: true, size: "wide" },
    { id: "mail", visible: true, size: "compact" },
    { id: "providers", visible: true, size: "compact" },
  ],
};

export function createDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "orchestrator.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
      capabilities_json TEXT NOT NULL, config_encrypted TEXT NOT NULL, last_sync_at TEXT,
      latency_ms INTEGER, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
      role TEXT NOT NULL, body_encrypted TEXT NOT NULL, state TEXT NOT NULL, correlation_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL, status TEXT NOT NULL, occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL, project_id TEXT, metadata_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_occurred_at ON events(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
      health INTEGER NOT NULL, progress INTEGER NOT NULL, due_at TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attention_items (
      id TEXT PRIMARY KEY, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL,
      source TEXT NOT NULL, created_at TEXT NOT NULL, due_at TEXT, resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS recurring_tasks (
      id TEXT PRIMARY KEY, remote_id TEXT NOT NULL, title TEXT NOT NULL, schedule TEXT NOT NULL,
      next_run_at TEXT, last_state TEXT NOT NULL, connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
      UNIQUE(connector_id, remote_id)
    );
    CREATE TABLE IF NOT EXISTS metrics_daily (
      date TEXT PRIMARY KEY, tokens INTEGER NOT NULL, cost REAL NOT NULL, completed INTEGER NOT NULL,
      failed INTEGER NOT NULL, latency_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dashboard_layouts (
      user_id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY, connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, uri TEXT, updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, body, content='knowledge_documents', content_rowid='rowid');
    CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge_documents BEGIN
      INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge_documents BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge_documents BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
      INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;
    CREATE TABLE IF NOT EXISTS ingest_keys (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, secret_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
      detail_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  return db;
}

const iso = (offsetHours = 0) => new Date(Date.now() + offsetHours * 3_600_000).toISOString();

export function seedDemo(db: DatabaseSync, seal: (value: unknown) => string): void {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM connectors").get() as { count: number };
  if (existing.count > 0) return;
  const now = iso();
  db.prepare(`INSERT INTO connectors
    (id,name,kind,status,capabilities_json,config_encrypted,last_sync_at,latency_ms,error,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      "demo", "Atlas", "demo", "connected",
      JSON.stringify(["message.send","message.stream","work.read","schedule.read","knowledge.search","usage.read","health.read"]),
      seal({}), now, 184, null, now, now,
    );
  const projects = [
    ["portal", "Assistant portal", "Ship the secure local-first command centre", "on-track", 91, 72, iso(24 * 8)],
    ["launch", "Studio launch", "Positioning, website, and launch operations", "at-risk", 68, 54, iso(24 * 4)],
    ["home", "Home operations", "Recurring personal admin and household tasks", "on-track", 86, 81, null],
  ];
  const projectInsert = db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)");
  for (const project of projects) projectInsert.run(...project, now);
  const attention = [
    ["attn-1", "high", "Launch copy needs your decision", "Two positioning options are ready. Choose one before tomorrow's publishing window.", "Atlas", iso(-1), iso(18), null],
    ["attn-2", "medium", "Calendar conflict on Thursday", "The research review overlaps the product check-in by 25 minutes.", "Calendar", iso(-3), iso(44), null],
    ["attn-3", "low", "Usage is trending above baseline", "Seven-day token use is 18% above the prior week, driven by research runs.", "Insights", iso(-8), null, null],
  ];
  const attentionInsert = db.prepare("INSERT INTO attention_items VALUES (?,?,?,?,?,?,?,?)");
  for (const item of attention) attentionInsert.run(...item);
  const recurring = [
    ["task-1", "morning-brief", "Morning brief", "Weekdays · 07:30", iso(13), "succeeded", "demo"],
    ["task-2", "mail-triage", "Inbox triage", "Every 2 hours", iso(1.2), "running", "demo"],
    ["task-3", "project-review", "Project health review", "Fridays · 16:00", iso(24 * 4), "succeeded", "demo"],
    ["task-4", "backup-check", "Knowledge backup check", "Daily · 23:00", iso(5), "succeeded", "demo"],
  ];
  const recurringInsert = db.prepare("INSERT INTO recurring_tasks VALUES (?,?,?,?,?,?,?)");
  for (const task of recurring) recurringInsert.run(...task);
  const metricInsert = db.prepare("INSERT INTO metrics_daily VALUES (?,?,?,?,?,?)");
  for (let days = 13; days >= 0; days -= 1) {
    const date = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const wave = Math.sin(days * 1.3);
    metricInsert.run(date, Math.round(780_000 + wave * 240_000 + (13 - days) * 18_000), 3.8 + wave * 0.9, 19 + ((13 - days) % 7), days % 6 === 0 ? 2 : 0, Math.round(820 + wave * 180));
  }
  const messages: Array<[string, string, string, string, string]> = [
    ["msg-1", "assistant", "Good morning. I cleared 14 routine items overnight. There are two decisions worth your attention; the launch copy is the only time-sensitive one.", "verified", iso(-7)],
    ["msg-2", "user", "What should I focus on first?", "accepted", iso(-6.8)],
    ["msg-3", "assistant", "Choose the launch positioning, then review Thursday's calendar conflict. I can handle the remaining inbox and project follow-ups without you.", "verified", iso(-6.7)],
  ];
  const messageInsert = db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?)");
  for (const [id, role, body, state, createdAt] of messages) messageInsert.run(id, "demo", role, seal(body), state, null, createdAt);
  const events = [
    ["evt-1", "Atlas", "mail.summary", "Inbox triage complete", "Archived 21 messages and drafted 3 replies.", "verified", iso(-0.7), iso(-0.7), null, '{"waiting":4,"handled":21,"drafts":3,"urgent":1}'],
    ["evt-2", "Atlas", "work.running", "Market scan in progress", "Comparing 12 adjacent products and open-source projects.", "observed", iso(-0.25), iso(-0.25), "portal", "{}"],
    ["evt-3", "Calendar", "schedule.conflict", "Conflict detected", "Two events overlap on Thursday afternoon.", "observed", iso(-3), iso(-3), null, "{}"],
    ["evt-4", "Atlas", "work.completed", "Weekly review prepared", "Project risks and next actions are summarized.", "verified", iso(-22), iso(-22), "launch", "{}"],
  ];
  const eventInsert = db.prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const event of events) eventInsert.run(...event);
  const docs = [
    ["doc-1", "demo", "Operating principles", "Protect attention. Automate routine work. Escalate decisions with context, options, and a recommendation. Never imply verification without evidence.", "memory://principles", now],
    ["doc-2", "demo", "Portal project brief", "Build a provider-agnostic portal that replaces chat tools and shows active work, recurring tasks, outcomes, token usage, project health, and areas needing attention.", "memory://projects/portal", now],
    ["doc-3", "demo", "Communication preferences", "Prefer concise daily briefs. Interrupt only for irreversible actions, security issues, deadlines inside 24 hours, or decisions blocking multiple tasks.", "memory://preferences/comms", now],
  ];
  const docInsert = db.prepare("INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?)");
  for (const doc of docs) docInsert.run(...doc);
}

export function audit(db: DatabaseSync, actor: string, action: string, target: string | null, detail: Record<string, unknown> = {}): void {
  db.prepare("INSERT INTO audit_log VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(), actor, action, target, JSON.stringify(detail), new Date().toISOString());
}
