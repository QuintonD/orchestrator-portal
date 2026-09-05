import { constants } from "node:fs";
import { lstat, open, opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export interface KnowledgeIndexResult {
  indexed: number;
  skipped: number;
  partial: boolean;
  warnings: string[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  body: string;
  uri: string;
  updatedAt: string;
}

const allowedExtensions = new Set([".md", ".mdx", ".txt", ".json"]);
export const localIndexLimits = { files: 10_000, entries: 50_000, depth: 32, fileBytes: 2 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 } as const;

export function replaceKnowledgeDocuments(db: DatabaseSync, connectorId: string, documents: KnowledgeDocument[]): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM knowledge_documents WHERE connector_id = ?").run(connectorId);
    const insert = db.prepare("INSERT INTO knowledge_documents (id,connector_id,title,body,uri,updated_at) VALUES (?,?,?,?,?,?)");
    for (const document of documents) insert.run(document.id, connectorId, document.title, document.body, document.uri, document.updatedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function indexDirectory(db: DatabaseSync, connectorId: string, configuredRoot: string, mode: "local" | "obsidian" = "local"): Promise<KnowledgeIndexResult> {
  const documents: KnowledgeDocument[] = [];
  const warnings = new Set<string>();
  let skipped = 0;
  let entriesSeen = 0;
  let totalBytes = 0;
  let root: string;
  try {
    root = await realpath(path.resolve(configuredRoot));
    if (!(await stat(root)).isDirectory()) throw new Error("Not a directory");
  } catch {
    // A missing or inaccessible source must not leave previously indexed content searchable.
    replaceKnowledgeDocuments(db, connectorId, []);
    throw new Error("Knowledge directory is unavailable; its cached documents were removed");
  }
  const withinRoot = (candidate: string) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  };
  const limited = () => documents.length >= localIndexLimits.files || entriesSeen >= localIndexLimits.entries || totalBytes >= localIndexLimits.totalBytes;
  const omit = (warning: string) => { skipped += 1; warnings.add(warning); };

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > localIndexLimits.depth) { omit("Directory depth limit reached"); return; }
    const resolvedDirectory = await realpath(directory);
    if (!withinRoot(resolvedDirectory) || resolvedDirectory !== directory || (await lstat(directory)).isSymbolicLink()) { omit("Symbolic links are excluded"); return; }
    // Stream directory entries: readdir would allocate an unbounded listing before applying limits.
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (limited()) { warnings.add("Local index size or traversal limit reached"); return; }
      entriesSeen += 1;
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) { omit("Symbolic links are excluded"); continue; }
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(candidate, depth + 1); continue; }
      const extension = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || !(mode === "obsidian" ? extension === ".md" : allowedExtensions.has(extension))) continue;
      const resolved = await realpath(candidate);
      if (!withinRoot(resolved) || resolved !== candidate || (await lstat(candidate)).isSymbolicLink()) { omit("Symbolic links are excluded"); continue; }
      const handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const fileStats = await handle.stat();
        if (!fileStats.isFile()) { omit("Non-regular files are excluded"); continue; }
        if (fileStats.size > localIndexLimits.fileBytes || totalBytes + fileStats.size > localIndexLimits.totalBytes) { omit("Local index byte limit reached"); continue; }
        // Bounded read also covers files growing after the size check.
        const buffer = Buffer.alloc(Math.min(fileStats.size + 1, localIndexLimits.fileBytes + 1));
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const read = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
          if (read.bytesRead === 0) break;
          bytesRead += read.bytesRead;
        }
        const currentStats = await stat(candidate);
        if (await realpath(candidate) !== resolved || currentStats.ino !== fileStats.ino || currentStats.dev !== fileStats.dev || currentStats.size !== fileStats.size || currentStats.mtimeMs !== fileStats.mtimeMs || bytesRead !== fileStats.size) {
          omit("Files changed during indexing and were excluded"); continue;
        }
        const body = buffer.subarray(0, bytesRead).toString("utf8");
        if (body.includes("\0")) { omit("Binary content is excluded"); continue; }
        totalBytes += bytesRead;
        const relative = path.relative(root, resolved).replaceAll("\\", "/");
        documents.push({ id: `${connectorId}:${relative}`, title: extractTitle(body) ?? path.basename(relative, extension), body, uri: pathToFileURL(resolved).href, updatedAt: fileStats.mtime.toISOString() });
      } finally { await handle.close(); }
    }
  }

  try { await walk(root, 0); }
  catch {
    // Do not retain a cache after a directory or file permission change mid-walk.
    replaceKnowledgeDocuments(db, connectorId, []);
    throw new Error("Knowledge directory could not be read; its cached documents were removed");
  }
  replaceKnowledgeDocuments(db, connectorId, documents);
  return { indexed: documents.length, skipped, partial: warnings.size > 0, warnings: [...warnings] };
}

function extractTitle(body: string): string | undefined {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading?.slice(0, 240);
}

export function ftsQuery(value: string): string {
  return value
    .normalize("NFKC")
    .split(/\s+/)
    .map((part) => part.replaceAll('"', "").trim())
    .filter((part) => part.length >= 2)
    .slice(0, 12)
    .map((part) => `"${part}"*`)
    .join(" AND ");
}
