import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexNotion, notionIndexLimits, validateNotionConfig } from "./notion.js";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const pageA = "11111111-1111-4111-8111-111111111111";
const pageB = "22222222-2222-4222-8222-222222222222";
const child = "33333333-3333-4333-8333-333333333333";
const token = "ntn_test_very_secret_value";
const databases: DatabaseSync[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close(); });

function fixture(responses: Array<unknown | Response | Error>) {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec("CREATE TABLE knowledge_documents (id TEXT PRIMARY KEY, connector_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, uri TEXT, updated_at TEXT NOT NULL)");
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("Unexpected fixture request");
    return next instanceof Response ? next : Response.json(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  const rows = () => db.prepare("SELECT * FROM knowledge_documents ORDER BY id").all();
  const seed = (id: string) => db.prepare("INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?)").run(`notion:${id}`, "notion", "Old title", "old private content", `https://www.notion.so/${id}`, "2026-09-01T00:00:00.000Z");
  return { db, fetchMock, rows, seed };
}
function page(id = pageA) {
  return { object: "page", id, archived: false, in_trash: false, last_edited_time: "2026-09-01T00:00:00.000Z", properties: { Name: { type: "title", title: [{ plain_text: "Plan" }] } } };
}
function block(text: string, id = child) { return { object: "block", id, type: "paragraph", has_children: false, paragraph: { rich_text: [{ plain_text: text }] } }; }
function list(results: unknown[], cursor: string | null = null) { return { object: "list", results, has_more: cursor !== null, next_cursor: cursor }; }

describe("Notion configuration", () => {
  it("normalizes selected URLs and IDs, deduplicating the scope", () => {
    expect(validateNotionConfig({ token, pages: `https://www.notion.so/My-plan-${pageA.replaceAll("-", "")}?v=ignored\n${pageA}` })).toEqual({ token, pageIds: [pageA] });
  });
  it.each([
    { token, pages: "https://evil.example/11111111111141118111111111111111" },
    { token, pages: `https://notion.so.evil.example/${pageA}` },
    { token: "secret\r\nAuthorization: bad", pages: pageA },
    { token, pages: [] },
    { token, pageIds: Array(26).fill(pageA) },
    { token, pageIds: ["../users/me"] },
  ])("rejects malformed scope or token before any request", (config) => {
    expect(() => validateNotionConfig(config)).toThrow();
  });
});

describe("Notion indexing", () => {
  it("paginates selected page content and retains source references", async () => {
    const { db, fetchMock, rows } = fixture([page(), list([block("First")], "next/+?"), list([block("Second", pageB)])]);
    expect(await indexNotion(db, "notion", { token, pageIds: [pageA] })).toMatchObject({ indexed: 1, partial: false });
    expect(rows()[0]).toMatchObject({ body: "First\nSecond", title: "Plan", uri: `https://www.notion.so/${pageA.replaceAll("-", "")}` });
    expect(fetchMock.mock.calls).toHaveLength(3);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[2]?.[0]).toContain("start_cursor=next%2F%2B%3F");
    for (const [url, options] of calls) {
      expect(new URL(url).origin).toBe("https://api.notion.com");
      expect(options).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2026-03-11" } });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("does not traverse child pages, databases, linked pages or synced blocks", async () => {
    const excluded = ["child_page", "child_database", "link_to_page", "synced_block"].map((type) => ({ object: "block", id: child, type, has_children: true, [type]: {} }));
    const { db, fetchMock, rows } = fixture([page(), list([block("Selected"), ...excluded])]);
    expect(await indexNotion(db, "notion", { token, pages: pageA })).toMatchObject({ indexed: 1, partial: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows()[0]?.body).toBe("Selected");
  });

  it("reads ordinary nested text blocks", async () => {
    const parent = { ...block("Parent"), has_children: true };
    const { db, rows } = fixture([page(), list([parent]), list([block("Nested", pageB)])]);
    expect(await indexNotion(db, "notion", { token, pages: pageA })).toMatchObject({ indexed: 1, partial: false });
    expect(rows()[0]?.body).toBe("Parent\nNested");
  });

  it.each([401, 403])("purges stale content after HTTP %s without exposing provider errors", async (status) => {
    const { db, seed, rows } = fixture([new Response(`provider echoed ${token}`, { status })]);
    seed(pageA); seed(pageB);
    await expect(indexNotion(db, "notion", { token, pageIds: [pageA, pageB] })).rejects.toThrow("Notion access was denied; cached documents were removed");
    expect(rows()).toEqual([]);
  });

  it("removes revoked pages even if a subsequent request fails", async () => {
    const { db, seed, rows } = fixture([new Response("private", { status: 404 }), new Response("private", { status: 500 })]);
    seed(pageA); seed(pageB);
    await expect(indexNotion(db, "notion", { token, pageIds: [pageA, pageB] })).rejects.toThrow("Notion request failed");
    expect(rows()).toMatchObject([{ id: `notion:${pageB}`, body: "old private content" }]);
  });

  it("removes archived pages and reports incomplete scope", async () => {
    const { db, seed, rows } = fixture([{ ...page(), archived: true }]);
    seed(pageA);
    expect(await indexNotion(db, "notion", { token, pages: pageA })).toMatchObject({ indexed: 0, skipped: 1, partial: true });
    expect(rows()).toEqual([]);
  });

  it("retains the previous snapshot on malformed pagination", async () => {
    const { db, seed, rows } = fixture([page(), list([block("New")], "same"), list([], "same")]);
    seed(pageA);
    await expect(indexNotion(db, "notion", { token, pages: pageA })).rejects.toThrow("invalid pagination");
    expect(rows()[0]?.body).toBe("old private content");
  });

  it("does not partly commit new content when a later page is malformed", async () => {
    const { db, seed, rows } = fixture([page(), list([block("new")]), { ...page(pageB), properties: null }]);
    seed(pageA); seed(pageB);
    await expect(indexNotion(db, "notion", { token, pageIds: [pageA, pageB] })).rejects.toThrow("invalid response");
    expect(rows().map((row) => row.body)).toEqual(["old private content", "old private content"]);
  });

  it("applies a smaller selected scope even when the remaining page fails", async () => {
    const { db, seed, rows } = fixture([new Error(`transport echoed ${token}`)]);
    seed(pageA); seed(pageB);
    await expect(indexNotion(db, "notion", { token, pages: pageA })).rejects.toThrow("Notion request failed or timed out; retry sync later");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.id).toBe(`notion:${pageA}`);
  });

  it("bounds pagination and reports partial content", async () => {
    const responses = [page(), ...Array.from({ length: notionIndexLimits.requests - 1 }, (_, i) => list([block(`Part ${i}`)], `cursor-${i}`))];
    const { db, fetchMock, rows } = fixture(responses);
    expect(await indexNotion(db, "notion", { token, pages: pageA })).toMatchObject({ indexed: 1, partial: true, warnings: ["Notion index size, request or time limit reached"] });
    expect(fetchMock).toHaveBeenCalledTimes(notionIndexLimits.requests);
    expect(String(rows()[0]?.body)).toContain("Part 98");
  });

  it("rejects oversized streaming responses without replacing the index", async () => {
    const response = new Response("a".repeat(notionIndexLimits.responseBytes + 1));
    const { db, seed, rows } = fixture([response]);
    seed(pageA);
    await expect(indexNotion(db, "notion", { token, pages: pageA })).rejects.toThrow("safe size limit");
    expect(rows()[0]?.body).toBe("old private content");
  });
});
