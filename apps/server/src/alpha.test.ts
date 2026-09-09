import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./server.js";
import { runtimeAdapters } from "./adapters.js";
import * as adapters from "./adapters.js";

const apps: FastifyInstance[] = [], directories: string[] = [];
async function setup(demo = true) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "portal-alpha-")); directories.push(dataDir);
  const app = await createApp({ dataDir, demo, host: "127.0.0.1", isLoopback: true }); apps.push(app); return app;
}
const profile = (extra = {}) => ({ name: "Project partner", purpose: "Review active projects and identify blockers", connectorId: "demo", cadence: "manual", providerPolicy: "local", spendingLimit: 0, scope: [], criteria: "Source-linked blockers and next steps", runtimePolicyConfirmed: true, ...extra });
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("alpha workflows and authority boundaries", () => {
  it("protects all new workspace data with authentication", async () => {
    const app = await setup(false);
    for (const route of ["assistants", "reports", "councils", "activity", "watches", "broker/grants", "knowledge/documents", "handoffs"])
      expect((await app.inject(`/api/${route}`)).statusCode).toBe(401);
    expect((await app.inject("/api/broker/knowledge")).statusCode).toBe(401);
  });
  it("creates an assistant, requests a report and retains the original after correction", async () => {
    const app = await setup();
    const create = await app.inject({ method: "POST", url: "/api/assistants", payload: profile() });
    expect(create.statusCode).toBe(201);
    const key = create.json().id;
    const run = await app.inject({ method: "POST", url: `/api/assistants/${key}/run` });
    expect(run.statusCode).toBe(201); expect(run.json().state).toBe("claimed");
    const report = run.json();
    await app.inject({ method: "PATCH", url: `/api/reports/${report.id}`, payload: { review: "needs-work", correction: "Include the missing source dates" } });
    const correction = await app.inject({ method: "POST", url: `/api/reports/${report.id}/correct` });
    expect(correction.statusCode).toBe(201); expect(correction.json().id).not.toBe(report.id);
    const all = (await app.inject("/api/reports")).json();
    expect(all.find((r: { id: string }) => r.id === report.id).body).toBe(report.body);
    expect(all.find((r: { id: string }) => r.id === report.id).review).toBe("needs-work");
  });
  it("blocks metered use, missing mandates and paused dispatch before the adapter runs", async () => {
    const app = await setup();
    const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage");
    for (const extra of [{ name: "Paid", providerPolicy: "metered", spendingLimit: 10 }, { name: "Unconfirmed", runtimePolicyConfirmed: false }]) {
      const created = (await app.inject({ method: "POST", url: "/api/assistants", payload: profile(extra) })).json();
      expect((await app.inject({ method: "POST", url: `/api/assistants/${created.id}/run` })).statusCode).toBe(409);
    }
    await app.inject({ method: "PUT", url: "/api/dispatch", payload: { paused: true } });
    expect((await app.inject({ method: "POST", url: "/api/assistants/atlas/run" })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/messages", payload: { connectorId: "demo", body: "hello" } })).statusCode).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects duplicate profiles, schema expansion and arbitrary record IDs", async () => {
    const app = await setup();
    expect((await app.inject({ method: "POST", url: "/api/assistants", payload: profile({ name: "Atlas" }) })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/assistants", payload: profile({ grantAllTools: true }) })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/assistants/demo-report/run" })).statusCode).toBe(404);
  });
  it("requires the assistant policy to match a compatible model connection", async () => {
    const app = await setup();
    const config = { endpoint: "http://127.0.0.1:8317/v1", model: "fixture-model", token: "synthetic-key", accessMode: "subscription", policyConfirmed: true };
    const source = await app.inject({ method: "POST", url: "/api/connectors", payload: { name: "Subscription source", kind: "openai-compatible", config } });
    expect(source.statusCode).toBe(201);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id: config.model }] })).mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Source-backed draft" } }] }));
    vi.stubGlobal("fetch", fetch);
    await app.inject({ method: "POST", url: `/api/connectors/${source.json().id}/sync` });
    const make = async (providerPolicy: string) => (await app.inject({ method: "POST", url: "/api/assistants", payload: profile({ name: `Profile ${providerPolicy}`, connectorId: source.json().id, providerPolicy }) })).json();
    const mismatch = await make("local");
    const blocked = await app.inject({ method: "POST", url: `/api/assistants/${mismatch.id}/run` });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toContain("must match");
    expect(fetch).toHaveBeenCalledTimes(1);
    const matching = await make("subscription");
    const result = await app.inject({ method: "POST", url: `/api/assistants/${matching.id}/run` });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({ state: "claimed", body: "Source-backed draft" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("retains ambiguous timeouts and blocks silent retry", async () => {
    const app = await setup();
    vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockRejectedValue(new Error("secret token must not leak"));
    const run = await app.inject({ method: "POST", url: "/api/assistants/atlas/run" });
    expect(run.json().state).toBe("unknown"); expect(run.body).not.toContain("secret token");
    expect((await app.inject({ method: "POST", url: "/api/assistants/atlas/run" })).statusCode).toBe(409);
    const message = await app.inject({ method: "POST", url: "/api/messages", payload: { connectorId: "demo", body: "hello" } });
    expect(message.json().message.state).toBe("unknown");
  });
  it("prevents concurrent dispatch through pause and resume", async () => {
    const app = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockImplementation(async () => { started(); await gate; return { state: "claimed", reply: "fixture result" }; });
    const run = app.inject({ method: "POST", url: "/api/assistants/atlas/run" }).then((r) => r);
    await start;
    expect((await app.inject({ method: "PATCH", url: "/api/assistants/atlas", payload: { state: "paused" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PATCH", url: "/api/assistants/atlas", payload: { state: "ready" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/assistants/atlas/run" })).statusCode).toBe(409);
    release(); await run;
    expect((await app.inject("/api/assistants")).json().assistants.find((p: { id: string }) => p.id === "atlas").state).toBe("paused");
  });
  it("requires council sharing consent and preserves independent assessments", async () => {
    const app = await setup();
    const question = "Which project should receive attention first?";
    expect((await app.inject({ method: "POST", url: "/api/councils", payload: { question, assistantIds: ["atlas", "sage"], shareContext: false } })).statusCode).toBe(400);
    const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockResolvedValue({ state: "claimed", reply: "Source-linked assessment with uncertainty" });
    const result = await app.inject({ method: "POST", url: "/api/councils", payload: { question, assistantIds: ["atlas", "sage"], shareContext: true } });
    expect(result.statusCode).toBe(201); expect(result.json().contributions).toHaveLength(2); expect(result.json().state).toBe("claimed");
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]![1]).not.toContain("Source-linked assessment");
    expect(send.mock.calls[2]![1]).toContain("Source-linked assessment");
  });
  it("returns a partial council when a participant goes offline", async () => {
    const app = await setup();
    vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockResolvedValueOnce({ state: "claimed", reply: "First view" }).mockRejectedValueOnce(new Error("offline"));
    const result = await app.inject({ method: "POST", url: "/api/councils", payload: { question: "Which project should receive attention first?", assistantIds: ["atlas", "sage"], shareContext: true } });
    expect(result.json().state).toBe("partial"); expect(result.json().contributions[1].state).toBe("unknown");
  });
  it("binds knowledge access to a scoped identity, denies escalation, and rechecks revocation", async () => {
    const app = await setup();
    const result = await app.inject({ method: "POST", url: "/api/broker/grants", payload: { assistantId: "atlas", connectorId: "demo", expiresAt: new Date(Date.now() + 86400000).toISOString() } });
    expect(result.statusCode).toBe(201);
    const { secret, id } = result.json(); const headers = { authorization: `Bearer ${secret}` };
    expect((await app.inject({ url: "/api/broker/knowledge?q=portal", headers })).json().documents.length).toBeGreaterThan(0);
    expect((await app.inject({ url: "/api/broker/knowledge?connectorId=elsewhere", headers })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/broker/knowledge", headers: { authorization: "Bearer atlas" } })).statusCode).toBe(401);
    expect((await app.inject("/api/broker/grants")).body).not.toContain(secret);
    await app.inject({ method: "DELETE", url: `/api/broker/grants/${id}` });
    expect((await app.inject({ url: "/api/broker/knowledge", headers })).statusCode).toBe(401);
  });
  it("persists watches and restores the previous dashboard layout", async () => {
    const app = await setup();
    await app.inject({ method: "POST", url: "/api/watches", payload: { name: "Atlas updates", query: "Atlas" } });
    expect((await app.inject("/api/activity")).json().feed.some((entry: { watched: boolean }) => entry.watched)).toBe(true);
    const prior = (await app.inject("/api/overview")).json().layout;
    await app.inject({ method: "PUT", url: "/api/dashboard/layout", payload: { widgets: [{ id: "attention", visible: true, size: "wide" }] } });
    expect((await app.inject({ method: "POST", url: "/api/layout/undo" })).json()).toEqual(prior);
  });
  it("does not reopen acknowledged items when the same event is replayed", async () => {
    const app = await setup();
    const key = (await app.inject({ method: "POST", url: "/api/ingest-keys", payload: { name: "Replay fixture" } })).json().secret;
    const payload = { id: "replay-event", source: "fixture", kind: "attention.required", title: "Review source", metadata: { attentionId: "replay-item" } };
    const ingest = () => app.inject({ method: "POST", url: "/api/ingest/events", headers: { authorization: `Bearer ${key}` }, payload });
    await ingest(); await app.inject({ method: "POST", url: "/api/attention/replay-item/resolve" }); await ingest();
    expect((await app.inject("/api/attention")).json().find((i: { id: string }) => i.id === "replay-item").resolvedAt).not.toBeNull();
  });
  it("keeps unknown workspace state honest before the first connection", async () => {
    const app = await setup(false);
    const response = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { displayName: "Founder", password: "a sufficiently long test passphrase" } });
    const cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const overview = (await app.inject({ url: "/api/overview", headers: { cookie } })).json();
    expect(overview.brief.tone).toBe("unknown"); expect(overview.activeWork).toBe(0);
  });
  it("commits source-owned schedules once and imports source reports without upgrading evidence", async () => {
    const app = await setup();
    const connector = (await app.inject({ method: "POST", url: "/api/connectors", payload: { name: "OpenClaw fixture", kind: "openclaw-cli", config: { agentId: "main" } } })).json();
    vi.spyOn(runtimeAdapters.get("openclaw-cli")!, "sync").mockResolvedValue({ status: "connected", latencyMs: 1, events: [] });
    await app.inject({ method: "POST", url: `/api/connectors/${connector.id}/sync` });
    const assistant = (await app.inject({ method: "POST", url: "/api/assistants", payload: profile({ connectorId: connector.id, cadence: "daily" }) })).json();
    const cli = vi.spyOn(adapters, "runOpenClaw").mockResolvedValueOnce({ id: "source-job" });
    const schedule = await app.inject({ method: "POST", url: `/api/assistants/${assistant.id}/schedule` });
    expect(schedule.json().state).toBe("committed");
    expect(cli.mock.calls[0]![0]).toContain("--no-deliver");
    expect(cli.mock.calls[0]![0]).toContain("--declaration-key");
    expect(cli.mock.calls[0]![0]).toContain("read");
    expect((await app.inject({ method: "POST", url: `/api/assistants/${assistant.id}/schedule` })).statusCode).toBe(409);
    cli.mockResolvedValue({ entries: [{ ts: Date.now(), runAtMs: Date.now() - 1000, status: "ok", summary: "Scheduled source findings", deliveryStatus: "not-requested" }] });
    const sync = () => app.inject({ method: "POST", url: `/api/assistants/${assistant.id}/schedule/sync` });
    expect((await sync()).json().imported).toBe(1);
    expect((await sync()).json().imported).toBe(0);
    const report = (await app.inject("/api/reports")).json().find((r: { body: string }) => r.body === "Scheduled source findings");
    expect(report.state).toBe("claimed"); expect(report.source).toContain("source-job");
  });
});
