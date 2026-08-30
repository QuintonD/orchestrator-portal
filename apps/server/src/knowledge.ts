import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

const allowedExtensions = new Set([".md", ".mdx", ".txt", ".json"]);
const maxFiles = 10_000;
const maxFileBytes = 2 * 1024 * 1024;

export async function indexDirectory(db: DatabaseSync, connectorId: string, configuredRoot: string): Promise<number> {
  const root = await realpath(path.resolve(configuredRoot));
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error("Knowledge path is not a directory");
  const documents: Array<{ id: string; title: string; body: string; uri: string; updatedAt: string }> = [];

  async function walk(directory: string): Promise<void> {
    if (documents.length >= maxFiles) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (documents.length >= maxFiles || entry.name.startsWith(".")) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(candidate);
        continue;
      }
      if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const resolved = await realpath(candidate);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) continue;
      const fileStats = await stat(resolved);
      if (fileStats.size > maxFileBytes) continue;
      const body = await readFile(resolved, "utf8");
      const relative = path.relative(root, resolved).replaceAll("\\", "/");
      documents.push({
        id: `${connectorId}:${relative}`,
        title: extractTitle(body) ?? path.basename(relative, path.extname(relative)),
        body,
        uri: `file://${resolved.replaceAll("\\", "/")}`,
        updatedAt: fileStats.mtime.toISOString(),
      });
    }
  }

  await walk(root);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM knowledge_documents WHERE connector_id = ?").run(connectorId);
    const insert = db.prepare("INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?)");
    for (const document of documents) insert.run(document.id, connectorId, document.title, document.body, document.uri, document.updatedAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return documents.length;
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
