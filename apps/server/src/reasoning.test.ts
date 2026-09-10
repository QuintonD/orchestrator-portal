import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { reasoningControl, reasoningEffortSchema, type AssistantProfile } from "@orchestrator/contracts";
import { runtimeAdapters } from "./adapters.js";
import * as adapters from "./adapters.js";
import { compatibleApi } from "./compatible-api.js";
import { createApp } from "./server.js";

const apps: FastifyInstance[] = [], dirs: string[] = [];
const completion = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Synthetic result" } }] };
const config = { endpoint: "http://127.0.0.1:8317/v1", model: "fixture-model", accessMode: "local", policyConfirmed: true };
const profile = (connectorId: string, extra = {}) => ({ connectorId, name: "Reasoning fixture", purpose: "Review synthetic task evidence", criteria: "State supported findings", cadence: "manual", providerPolicy: "local", runtimePolicyConfirmed: true, ...extra });
const post = (app: FastifyInstance, url: string, payload?: object) => app.inject({ method: "POST", url, ...(payload ? { payload } : {}) });
const put = (app: FastifyInstance, id: string, effort: unknown, extra = {}) => app.inject({ method: "PUT", url: `/api/assistants/${id}/reasoning`, payload: { effort, ...extra } });
async function directory() { const dir = await mkdtemp(path.join(os.tmpdir(), "portal-reasoning-")); dirs.push(dir); return dir; }
async function setup(existing?: string, demo = true) {
  const dataDir = existing ?? await directory();
  const app = await createApp({ dataDir, demo, host: "127.0.0.1", isLoopback: true }); apps.push(app);
  return { app, dataDir };
}
async function source(app: FastifyInstance) {
  const created = await post(app, "/api/connectors", { name: "Synthetic model", kind: "openai-compatible", config });
  expect(created.statusCode).toBe(201);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: config.model }] })));
  expect((await post(app, `/api/connectors/${created.json().id}/sync`)).statusCode).toBe(200);
  return created.json().id as string;
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("reasoning source contracts", () => {
  it.each(reasoningEffortSchema.options)("sends requested %s through each documented HTTP path", async (effort) => {
    const fetch = vi.fn().mockImplementation(async () => Response.json(completion)); vi.stubGlobal("fetch", fetch);
    await compatibleApi.sendMessage!({ connectorId: "fixture", config, reasoningEffort: effort }, "Synthetic question");
    const apiBody = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(apiBody.model).toBe(config.model);
    if (effort === "default") {
      expect(apiBody.reasoning_effort).toBeUndefined(); expect(apiBody.max_tokens).toBe(4096); expect(apiBody.max_completion_tokens).toBeUndefined();
    } else {
      expect(apiBody.reasoning_effort).toBe(effort); expect(apiBody.max_completion_tokens).toBe(4096); expect(apiBody.max_tokens).toBeUndefined();
    }
    await runtimeAdapters.get("hermes-api")!.sendMessage!({ connectorId: "fixture", config: { endpoint: config.endpoint }, reasoningEffort: effort }, "Synthetic question");
    const hermesBody = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(hermesBody.model).toBe("hermes-agent"); expect(hermesBody.reasoning_effort).toBeUndefined();
    expect(hermesBody.model_options).toEqual(effort === "default" ? undefined : { reasoning_effort: effort });
  });
  it("passes OpenClaw an allowlisted flag and preserves the native agent and session", async () => {
    const entry = path.join(await directory(), "openclaw-fixture.mjs");
    await writeFile(entry, 'console.log(JSON.stringify({payloads:[{text:JSON.stringify(process.argv.slice(2))}]}));');
    vi.stubEnv("ORCHESTRATOR_OPENCLAW_ENTRY", entry);
    if (process.platform !== "win32") {
      // POSIX launches the executable on PATH; the explicit JS entry is Windows-only.
      const executable = path.join(path.dirname(entry), "openclaw");
      await writeFile(executable, '#!/usr/bin/env node\nconsole.log(JSON.stringify({payloads:[{text:JSON.stringify(process.argv.slice(2))}]}));\n');
      await chmod(executable, 0o755);
      vi.stubEnv("PATH", `${path.dirname(entry)}${path.delimiter}${process.env.PATH ?? ""}`);
    }
    const adapter = runtimeAdapters.get("openclaw-cli")!;
    for (const effort of [undefined, "default", "none", "high"] as const) {
      const result = await adapter.sendMessage!({ connectorId: "fixture", config: { agentId: "chosen-agent" }, ...(effort ? { reasoningEffort: effort } : {}) }, "Synthetic question", "portal-fixture");
      expect(JSON.parse(result.reply!)).toEqual(["agent", "--agent", "chosen-agent", "--message", "Synthetic question", "--json", ...(effort && effort !== "default" ? ["--thinking", effort === "none" ? "off" : effort] : []), "--session-key", "portal-fixture"]);
    }
    await expect(adapter.sendMessage!({ connectorId: "fixture", config: {}, reasoningEffort: "high --agent attacker" as never }, "Synthetic")).rejects.toThrow();
  });
  it("does not invent inference controls for local guides, handoffs, demo or webhooks", () => {
    for (const kind of ["demo", "generic-webhook", "markdown-directory", "obsidian-vault", "notion", "gbrain-cli", "t3-workspace", "removed"]) expect(reasoningControl(kind).available).toBe(false);
    for (const mode of ["workspace", "index", "handoff"]) expect(reasoningControl("openai-compatible", mode).available).toBe(false);
    expect(reasoningControl("workspace", "handoff").guidance).toContain("copy this prepared task");
    expect(reasoningControl("openclaw-cli").guidance).toContain("/think default");
  });
  it("rejects an unsupported model level without retry, fallback, or exposing provider text", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("private provider body", { status: 400 })); vi.stubGlobal("fetch", fetch);
    await expect(compatibleApi.sendMessage!({ connectorId: "fixture", config, reasoningEffort: "max" }, "Synthetic")).rejects.toThrow("HTTP 400");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]![1].body).reasoning_effort).toBe("max");
  });
});

describe("assistant reasoning preferences", () => {
  it("persists a preference without dispatch, isolates assistants and inherits for legacy profiles", async () => {
    const { app, dataDir } = await setup(); const connectorId = await source(app);
    const first = (await post(app, "/api/assistants", profile(connectorId))).json();
    const second = (await post(app, "/api/assistants", profile(connectorId, { name: "Second" }))).json();
    const send = vi.spyOn(compatibleApi, "sendMessage").mockResolvedValue({ state: "claimed", reply: "Synthetic result" });
    expect((await app.inject(`/api/assistants/${first.id}/reasoning`)).json()).toEqual({ kind: "openai-compatible", effort: "default" });
    expect((await put(app, first.id, "high")).statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect((await app.inject(`/api/assistants/${second.id}/reasoning`)).json().effort).toBe("default");
    await post(app, `/api/assistants/${first.id}/messages`, { body: "Synthetic request" });
    expect(send.mock.calls[0]![0].reasoningEffort).toBe("high");
    expect((await app.inject(`/api/assistants/${first.id}/reasoning`)).headers["cache-control"]).toBe("no-store");
    await app.close(); apps.splice(apps.indexOf(app), 1);
    const restarted = (await setup(dataDir)).app;
    expect((await restarted.inject(`/api/assistants/${first.id}/reasoning`)).json().effort).toBe("high");
    expect((await put(restarted, first.id, "default")).statusCode).toBe(200);
    await post(restarted, `/api/assistants/${first.id}/run`);
    expect(send.mock.calls.at(-1)![0].reasoningEffort).toBe("default");
  });
  it("validates creation, install and edits before side effects and preserves existing installs", async () => {
    const { app } = await setup(); const connectorId = await source(app);
    for (const effort of [null, "ultra", "high --agent injected", {}, 10]) expect((await put(app, "atlas", effort)).statusCode).toBe(400);
    expect((await put(app, "atlas", "high")).statusCode).toBe(400);
    expect((await put(app, "atlas", "default", { model: "different" })).statusCode).toBe(400);
    expect((await put(app, "missing", "high")).statusCode).toBe(404);
    expect((await post(app, "/api/assistants", profile("demo", { reasoningEffort: "high" }))).statusCode).toBe(400);
    expect((await post(app, "/api/team/install", { connectorId: "workspace", templateIds: ["research-analyst"], reasoningEffort: "high" })).statusCode).toBe(400);
    const payload = { connectorId, templateIds: ["code-reviewer"], runtimePolicyConfirmed: true, reasoningEffort: "high" };
    const installed = await post(app, "/api/team/install", payload);
    expect(installed.statusCode).toBe(201); expect(installed.json().assistants[0].reasoningEffort).toBe("high");
    expect((await post(app, "/api/team/install", { ...payload, reasoningEffort: "low" })).json().assistants[0].reasoningEffort).toBe("high");
    const direct = await post(app, "/api/assistants", profile(connectorId, { reasoningEffort: "medium" }));
    expect(direct.statusCode).toBe(201); expect(direct.json().reasoningEffort).toBe("medium");
  });
  it("blocks edits during a turn, preserves paused/unknown state, and never retries a rejected level", async () => {
    const { app } = await setup(); const connectorId = await source(app);
    const created = (await post(app, "/api/assistants", profile(connectorId, { reasoningEffort: "high" }))).json();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    const send = vi.spyOn(compatibleApi, "sendMessage").mockImplementation(async () => { started(); await gate; throw new Error("private provider error"); });
    const run = post(app, `/api/assistants/${created.id}/run`).then((result) => result);
    await start;
    try { expect((await put(app, created.id, "low")).statusCode).toBe(409); } finally { release(); }
    const result = await run;
    expect(result.json().state).toBe("unknown"); expect(result.body).toContain("reasoning level"); expect(result.body).not.toContain("private provider");
    expect((await put(app, created.id, "low")).statusCode).toBe(200);
    expect((await post(app, `/api/assistants/${created.id}/run`)).statusCode).toBe(409);
    expect(send).toHaveBeenCalledTimes(1);
    await app.inject({ method: "PATCH", url: `/api/assistants/${created.id}`, payload: { state: "paused" } });
    await put(app, created.id, "medium");
    expect((await app.inject("/api/assistants")).json().assistants.find((p: AssistantProfile) => p.id === created.id).state).toBe("paused");
  });
  it("requires authentication for both reads and preference writes", async () => {
    const { app } = await setup(undefined, false);
    expect((await app.inject("/api/assistants/missing/reasoning")).statusCode).toBe(401);
    expect((await put(app, "missing", "high")).statusCode).toBe(401);
  });
  it("preserves a preference changed while native scheduled results are being fetched", async () => {
    const { app } = await setup();
    const connection = (await post(app, "/api/connectors", { name: "Native fixture", kind: "openclaw-cli", config: { agentId: "main" } })).json();
    vi.spyOn(runtimeAdapters.get("openclaw-cli")!, "sync").mockResolvedValue({ status: "connected", latencyMs: 1, events: [] });
    await post(app, `/api/connectors/${connection.id}/sync`);
    const created = (await post(app, "/api/assistants", profile(connection.id, { cadence: "daily", reasoningEffort: "low" }))).json();
    const cli = vi.spyOn(adapters, "runOpenClaw").mockResolvedValueOnce({ id: "synthetic-job" });
    expect((await post(app, `/api/assistants/${created.id}/schedule`)).json().state).toBe("committed");
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    cli.mockImplementationOnce(async () => { started(); await gate; return { entries: [{ ts: Date.now(), status: "ok", summary: "Synthetic scheduled result" }] }; });
    const sync = post(app, `/api/assistants/${created.id}/schedule/sync`).then((result) => result);
    await start;
    try { expect((await put(app, created.id, "high")).statusCode).toBe(200); } finally { release(); }
    expect((await sync).json().imported).toBe(1);
    expect((await app.inject(`/api/assistants/${created.id}/reasoning`)).json().effort).toBe("high");
  });
  it("uses an updated queued council preference without overwriting it with the old snapshot", async () => {
    const { app } = await setup(); const connectorId = await source(app);
    const first = (await post(app, "/api/assistants", profile(connectorId, { reasoningEffort: "low" }))).json();
    const second = (await post(app, "/api/assistants", profile(connectorId, { name: "Queued member", reasoningEffort: "low" }))).json();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    const send = vi.spyOn(compatibleApi, "sendMessage").mockResolvedValue({ state: "claimed", reply: "Synthetic result" });
    send.mockImplementationOnce(async () => { started(); await gate; return { state: "claimed", reply: "Synthetic first result" }; });
    const council = post(app, "/api/councils", { question: "Compare these synthetic proposals", assistantIds: [first.id, second.id], shareContext: true }).then((result) => result);
    await start;
    try { expect((await put(app, second.id, "high")).statusCode).toBe(200); } finally { release(); }
    expect((await council).statusCode).toBe(201);
    expect(send.mock.calls.map(([context]) => context.reasoningEffort)).toEqual(["low", "high", "low"]);
    expect((await app.inject(`/api/assistants/${second.id}/reasoning`)).json().effort).toBe("high");
  });
});
