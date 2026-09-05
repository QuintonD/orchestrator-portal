import { mkdtemp, mkdir, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ftsQuery, indexDirectory, localIndexLimits, replaceKnowledgeDocuments } from "./knowledge.js";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-test-"));
  cleanup.push(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("knowledge-test-")) throw new Error("Unsafe cleanup path");
    await rm(root, { recursive: true, force: true });
  });
  const db = new DatabaseSync(":memory:");
  cleanup.push(() => db.close());
  db.exec("CREATE TABLE knowledge_documents (id TEXT PRIMARY KEY, connector_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, uri TEXT, updated_at TEXT NOT NULL)");
  return { root, db, rows: () => db.prepare("SELECT * FROM knowledge_documents ORDER BY id").all() };
}

describe("knowledge search", () => {
  it("turns user text into a bounded literal prefix query", () => {
    expect(ftsQuery('portal "strategy" launch')).toBe('"portal"* AND "strategy"* AND "launch"*');
  });

  it("ignores tiny and empty terms", () => {
    expect(ftsQuery(" a   an useful ")).toBe('"an"* AND "useful"*');
  });
});

describe("local knowledge indexing", () => {
  it("indexes supported files and encoded source URLs, then removes deleted sources", async () => {
    const { root, db, rows } = await fixture();
    const note = path.join(root, "plan #1%.md");
    await writeFile(note, "# Planning\nA useful note");
    await writeFile(path.join(root, "other.txt"), "Other text");
    await writeFile(path.join(root, "ignored.html"), "private");
    expect(await indexDirectory(db, "local", root)).toMatchObject({ indexed: 2, partial: false });
    expect(rows().find((row) => row.title === "Planning")).toMatchObject({ uri: pathToFileURL(note).href, body: "# Planning\nA useful note" });
    await rm(note);
    expect(await indexDirectory(db, "local", root)).toMatchObject({ indexed: 1 });
    expect(rows().some((row) => row.title === "Planning")).toBe(false);
  });

  it("limits Obsidian scope to Markdown and excludes vault config and linked directories", async () => {
    const { root, db, rows } = await fixture();
    const vault = path.join(root, "vault");
    const outside = path.join(root, "outside");
    await mkdir(path.join(vault, ".obsidian"), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(vault, "note.md"), "# Note");
    await writeFile(path.join(vault, "other.txt"), "outside scope");
    await writeFile(path.join(vault, ".obsidian", "secret.md"), "vault config");
    await writeFile(path.join(outside, "private.md"), "outside scope");
    await symlink(outside, path.join(vault, "linked"), process.platform === "win32" ? "junction" : "dir");
    expect(await indexDirectory(db, "obsidian", vault, "obsidian")).toMatchObject({ indexed: 1, partial: true });
    expect(rows()[0]?.body).toBe("# Note");
  });

  it("reports oversized and binary omissions without reading unbounded content", async () => {
    const { root, db, rows } = await fixture();
    await writeFile(path.join(root, "large.md"), Buffer.alloc(localIndexLimits.fileBytes + 1, 65));
    await writeFile(path.join(root, "binary.txt"), "binary\0content");
    await writeFile(path.join(root, "small.md"), "# Small");
    expect(await indexDirectory(db, "local", root)).toMatchObject({ indexed: 1, skipped: 2, partial: true });
    expect(rows()[0]?.title).toBe("Small");
  });

  it("clears cached content when its configured root disappears", async () => {
    const { root, db, rows } = await fixture();
    const source = path.join(root, "source");
    await mkdir(source);
    await writeFile(path.join(source, "note.md"), "old content");
    await indexDirectory(db, "local", source);
    await rm(path.join(source, "note.md"));
    await rmdir(source);
    await expect(indexDirectory(db, "local", source)).rejects.toThrow("cached documents were removed");
    expect(rows()).toEqual([]);
  });

  it("rolls back replacement failures without losing the previous snapshot", async () => {
    const { db, rows } = await fixture();
    const document = { id: "old", title: "Existing", body: "keep", uri: "file:///note.md", updatedAt: new Date().toISOString() };
    replaceKnowledgeDocuments(db, "local", [document]);
    expect(() => replaceKnowledgeDocuments(db, "local", [{ ...document, id: "new" }, { ...document, id: "new" }])).toThrow();
    expect(rows()).toMatchObject([{ id: "old", body: "keep" }]);
  });

  it("bounds directory depth and reports the unvisited subtree", async () => {
    const { root, db, rows } = await fixture();
    const deep = path.join(root, ...Array(localIndexLimits.depth + 1).fill("d"));
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(deep, "deep.md"), "Beyond traversal scope");
    expect(await indexDirectory(db, "local", root)).toMatchObject({ indexed: 0, partial: true, warnings: ["Directory depth limit reached"] });
    expect(rows()).toEqual([]);
  });
});
