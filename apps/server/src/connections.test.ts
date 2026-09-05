import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./server.js";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const cleanup: Array<() => Promise<void> | void> = [];
const pageId = "11111111-1111-4111-8111-111111111111";
const blockId = "22222222-2222-4222-8222-222222222222";
const token = "ntn_synthetic_integration_secret";
const pageResponse = { object: "page", id: pageId, archived: false, in_trash: false, last_edited_time: "2026-09-01T00:00:00.000Z", properties: { Name: { type: "title", title: [{ plain_text: "Connection fixture" }] } } };
const paragraph = { object: "block", id: blockId, type: "paragraph", has_children: false, paragraph: { rich_text: [{ plain_text: "Synthetic searchable evidence" }] } };
const blockList = (results: unknown[] = [paragraph]) => ({ object: "list", results, has_more: false, next_cursor: null });
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "connection-api-test-"));
  cleanup.push(async () => {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("connection-api-test-")) throw new Error("Unsafe test cleanup path");
    await rm(directory, { recursive: true, force: true });
  });
  const source = path.join(directory, "notes");
  await mkdir(source);
  await writeFile(path.join(source, "note.md"), "# Connection fixture\nSynthetic searchable evidence");
  const dataDir = path.join(directory, "data");
  const app = await createApp({ dataDir, demo: false, host: "127.0.0.1", isLoopback: true });
  cleanup.push(() => app.close());
  const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { displayName: "Fixture owner", password: "synthetic fixture password long enough" } });
  expect(setup.statusCode).toBe(201);
  const cookie = setup.cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const csrf = setup.cookies.find((item) => item.name === "orchestrator_csrf")!.value;
  const headers = { cookie, "x-csrf-token": csrf };
  const db = new DatabaseSync(path.join(dataDir, "orchestrator.db"), { readOnly: true });
  cleanup.push(() => db.close());
  const create = (kind = "notion", config: Record<string, unknown> = { token, pages: pageId }) => app.inject({ method: "POST", url: "/api/connectors", headers, payload: { name: "Fixture source", kind, config } });
  return { app, db, source, headers, cookie, create };
}

function mockNotion(responses: unknown[] = [pageResponse, blockList()]) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("Unexpected fixture request");
    return next instanceof Response ? next : Response.json(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("source connection API", () => {
  it.each(["markdown-directory", "obsidian-vault", "notion"])("requires real authentication and CSRF throughout the %s lifecycle", async (kind) => {
    const { app, source, headers, cookie, create } = await fixture();
    const fetchMock = mockNotion();
    const config = kind === "notion" ? { token, pages: pageId } : { path: source };
    const payload = { name: "Fixture source", kind, config };
    expect((await app.inject({ method: "POST", url: "/api/connectors", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/connectors", headers: { cookie }, payload })).statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    const created = await create(kind, config);
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const syncUrl = `/api/connectors/${id}/sync`;
    const deleteUrl = `/api/connectors/${id}`;
    for (const [method, url] of [["POST", syncUrl], ["DELETE", deleteUrl]] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { cookie } })).statusCode).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const sync = await app.inject({ method: "POST", url: syncUrl, headers });
    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({ connector: { status: "connected" }, imported: { documents: 1 }, coverage: { indexed: 1, partial: false } });
    expect((await app.inject({ method: "GET", url: "/api/knowledge/documents" })).statusCode).toBe(401);
    const documents = (await app.inject({ method: "GET", url: "/api/knowledge/documents", headers })).json();
    expect(documents).toHaveLength(1);
    const detailUrl = `/api/knowledge/documents/${encodeURIComponent(documents[0].id)}`;
    expect((await app.inject({ method: "GET", url: detailUrl })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: detailUrl, headers })).json().body).toContain("Synthetic searchable evidence");
    expect((await app.inject({ method: "GET", url: "/api/knowledge/search?q=searchable", headers })).json().hits).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: deleteUrl, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/knowledge/documents", headers })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/knowledge/search?q=searchable", headers })).json().hits).toEqual([]);
    expect((await app.inject({ method: "GET", url: detailUrl, headers })).statusCode).toBe(404);
  });

  it("stores Notion credentials encrypted and omits source config from public responses and audit", async () => {
    const { app, db, headers, create } = await fixture();
    const fetchMock = mockNotion();
    const created = await create();
    const id = created.json().id as string;
    expect(created.json()).not.toHaveProperty("config");
    expect(created.body).not.toContain(token);
    const row = db.prepare("SELECT config_encrypted FROM connectors WHERE id=?").get(id)!;
    expect(row.config_encrypted).toMatch(/^v1\./);
    expect(row.config_encrypted).not.toContain(token);
    expect(row.config_encrypted).not.toContain(pageId);
    const sync = await app.inject({ method: "POST", url: `/api/connectors/${id}/sync`, headers });
    expect(sync.statusCode).toBe(200);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[1]).toMatchObject({ headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
    for (const url of ["/api/connectors", "/api/overview", "/api/audit"]) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain("config_encrypted");
    }
  });

  it("rejects malformed source scope before creating credentials or making requests", async () => {
    const { db, create } = await fixture();
    const fetchMock = mockNotion();
    for (const [kind, config] of [
      ["notion", { token, pages: `https://untrusted.example/${pageId}` }],
      ["notion", { token: `${token}\r\nHeader: injected`, pages: pageId }],
      ["obsidian-vault", { path: "relative/notes" }],
      ["markdown-directory", { path: "" }],
    ] as const) {
      const result = await create(kind, config);
      expect(result.statusCode).toBe(400);
      expect(result.body).not.toContain(token);
    }
    expect(db.prepare("SELECT COUNT(*) AS count FROM connectors").get()?.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists partial Notion coverage and searchable selected content", async () => {
    const { app, headers, create } = await fixture();
    const fetchMock = mockNotion([pageResponse, blockList([paragraph, { object: "block", id: pageId, type: "child_page", has_children: true, child_page: { title: "Unselected child" } }])]);
    const id = (await create()).json().id as string;
    const sync = await app.inject({ method: "POST", url: `/api/connectors/${id}/sync`, headers });
    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({ imported: { documents: 1 }, coverage: { indexed: 1, partial: true }, connector: { status: "degraded" } });
    expect(sync.json().connector.error).toContain("Child pages");
    const stored = (await app.inject({ method: "GET", url: "/api/connectors", headers })).json().connectors;
    expect(stored).toMatchObject([{ id, status: "degraded", error: sync.json().connector.error }]);
    expect((await app.inject({ method: "GET", url: "/api/knowledge/search?q=searchable", headers })).json().hits).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects concurrent sync and deletion until the active source check completes", async () => {
    const { app, headers, create } = await fixture();
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    let requested!: () => void;
    const started = new Promise<void>((resolve) => { requested = resolve; });
    const fetchMock = vi.fn().mockImplementationOnce(() => { requested(); return pending; }).mockResolvedValue(Response.json(blockList()));
    vi.stubGlobal("fetch", fetchMock);
    const id = (await create()).json().id as string;
    const url = `/api/connectors/${id}/sync`;
    const active = app.inject({ method: "POST", url, headers });
    await started;
    try {
      expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(409);
      expect((await app.inject({ method: "DELETE", url: `/api/connectors/${id}`, headers })).statusCode).toBe(409);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      release(Response.json(pageResponse));
      expect((await active).statusCode).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await app.inject({ method: "DELETE", url: `/api/connectors/${id}`, headers })).statusCode).toBe(204);
  });

  it("sanitizes transport errors, keeps the prior snapshot and releases the sync lock for retry", async () => {
    const { app, headers, create } = await fixture();
    mockNotion([pageResponse, blockList(), new Error(`transport leaked ${token}`), pageResponse, blockList()]);
    const id = (await create()).json().id as string;
    const url = `/api/connectors/${id}/sync`;
    expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(200);
    const failure = await app.inject({ method: "POST", url, headers });
    expect(failure.statusCode).toBe(502);
    expect(failure.json()).toEqual({ error: "Notion request failed or timed out; retry sync later" });
    const connectors = await app.inject({ method: "GET", url: "/api/connectors", headers });
    expect(connectors.body).not.toContain(token);
    expect(connectors.json().connectors[0]).toMatchObject({ status: "degraded", error: failure.json().error });
    expect((await app.inject({ method: "GET", url: "/api/knowledge/documents", headers })).json()).toHaveLength(1);
    expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(200);
  });

  it("purges indexed content when Notion access is revoked and never echoes provider errors", async () => {
    const { app, headers, create } = await fixture();
    mockNotion([pageResponse, blockList(), new Response(`provider echoed ${token}`, { status: 403 })]);
    const id = (await create()).json().id as string;
    const url = `/api/connectors/${id}/sync`;
    expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(200);
    const failure = await app.inject({ method: "POST", url, headers });
    expect(failure.statusCode).toBe(502);
    expect(failure.body).not.toContain(token);
    expect(failure.json().error).toContain("cached documents were removed");
    expect((await app.inject({ method: "GET", url: "/api/knowledge/documents", headers })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/knowledge/search?q=searchable", headers })).json().hits).toEqual([]);
  });
});
