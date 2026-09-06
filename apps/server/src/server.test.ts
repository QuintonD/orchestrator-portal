import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./server.js";

const apps: FastifyInstance[] = [];
const directories: string[] = [];

async function testApp(demo: boolean) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"));
  directories.push(dataDir);
  const app = await createApp({ dataDir, demo, host: "127.0.0.1", isLoopback: true });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("portal server", () => {
  it("serves a representative provider-neutral overview in demo mode", async () => {
    const app = await testApp(true);
    const response = await app.inject({ method: "GET", url: "/api/overview" });
    expect(response.statusCode).toBe(200);
    const overview = response.json();
    expect(overview.projects).toHaveLength(3);
    expect(overview.connectors[0].capabilities).toContain("message.send");
    expect(overview.layout.widgets.some((widget: { id: string }) => widget.id === "attention")).toBe(true);
  });

  it("keeps assistant receipt state explicit", async () => {
    const app = await testApp(true);
    const response = await app.inject({ method: "POST", url: "/api/messages", payload: { connectorId: "demo", body: "What is my priority?" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().message.state).toBe("claimed");
    expect(response.json().reply.body).toContain("launch positioning");
  });

  it("projects provider-neutral events into dashboard insight models", async () => {
    const app = await testApp(true);
    const keyResponse = await app.inject({ method: "POST", url: "/api/ingest-keys", payload: { name: "test runtime" } });
    const secret = keyResponse.json().secret as string;
    const event = async (payload: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/ingest/events", headers: { authorization: `Bearer ${secret}` }, payload });
    expect((await event({ source: "test", kind: "usage.daily", title: "Usage", metadata: { tokens: 1234, cost: 1.25, completed: 7, failed: 1, latencyMs: 450 } })).statusCode).toBe(202);
    expect((await event({ source: "test", kind: "attention.required", title: "Choose a launch date", summary: "Publishing is blocked.", metadata: { attentionId: "provider-attention", severity: "high" } })).statusCode).toBe(202);
    expect((await event({ source: "test", kind: "project.health", title: "Provider project", summary: "Reported by source.", projectId: "provider-project", metadata: { health: 64, progress: 38, status: "at-risk" } })).statusCode).toBe(202);
    expect((await event({ source: "test", kind: "mail.summary", title: "Mail", metadata: { waiting: 2, handled: 9, drafts: 1, urgent: 1 } })).statusCode).toBe(202);
    const overview = (await app.inject({ method: "GET", url: "/api/overview" })).json();
    expect(overview.latestMetric.tokens).toBe(1234);
    expect(overview.attention.some((item: { id: string }) => item.id === "provider-attention")).toBe(true);
    expect(overview.projects.some((project: { id: string; status: string }) => project.id === "provider-project" && project.status === "at-risk")).toBe(true);
    expect(overview.mail).toEqual({ waiting: 2, handled: 9, drafts: 1, urgent: 1 });
  });

  it("rejects cross-origin browser requests", async () => {
    const app = await testApp(true);
    const response = await app.inject({ method: "GET", url: "/api/overview", headers: { origin: "https://untrusted.example" } });
    expect(response.statusCode).toBe(403);
  });

  it("requires setup, authentication, and CSRF outside demo mode", async () => {
    const app = await testApp(false);
    expect((await app.inject({ method: "GET", url: "/api/setup/discovery" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/overview" })).statusCode).toBe(401);
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { displayName: "Owner", password: "a sufficiently long private passphrase" } });
    expect(setup.statusCode).toBe(201);
    const setCookies = setup.cookies;
    const session = setCookies.find((cookie) => cookie.name === "orchestrator_session");
    const csrf = setCookies.find((cookie) => cookie.name === "orchestrator_csrf");
    expect(session?.httpOnly).toBe(true);
    expect(csrf?.httpOnly).not.toBe(true);
    const cookieHeader = setCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const rejected = await app.inject({ method: "PUT", url: "/api/dashboard/layout", headers: { cookie: cookieHeader }, payload: { widgets: [{ id: "attention", visible: true, size: "compact" }] } });
    expect(rejected.statusCode).toBe(403);
    const accepted = await app.inject({ method: "PUT", url: "/api/dashboard/layout", headers: { cookie: cookieHeader, "x-csrf-token": csrf!.value }, payload: { widgets: [{ id: "attention", visible: true, size: "compact" }] } });
    expect(accepted.statusCode).toBe(200);
  });
});
