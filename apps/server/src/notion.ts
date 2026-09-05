import type { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { replaceKnowledgeDocuments, type KnowledgeDocument, type KnowledgeIndexResult } from "./knowledge.js";

export interface NotionConfig { token: string; pageIds: string[] }
export const notionIndexLimits = { pages: 25, requests: 100, depth: 16, responseBytes: 1024 * 1024, pageBytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024, timeoutMs: 60_000 } as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function pageId(value: string): string {
  let candidate = value.trim();
  if (candidate.startsWith("https://")) {
    let url: URL;
    try { url = new URL(candidate); } catch { throw new Error("Enter valid Notion page URLs or page IDs"); }
    if (url.username || url.password || url.port || !(url.hostname === "notion.so" || url.hostname.endsWith(".notion.so") || url.hostname === "notion.site" || url.hostname.endsWith(".notion.site"))) throw new Error("Enter valid Notion page URLs or page IDs");
    candidate = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    candidate = candidate.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1] ?? "";
  }
  if (/^[a-f0-9]{32}$/i.test(candidate)) candidate = `${candidate.slice(0, 8)}-${candidate.slice(8, 12)}-${candidate.slice(12, 16)}-${candidate.slice(16, 20)}-${candidate.slice(20)}`;
  if (!uuid.test(candidate)) throw new Error("Enter valid Notion page URLs or page IDs");
  return candidate.toLowerCase();
}

export function validateNotionConfig(config: Record<string, unknown>): NotionConfig {
  const token = typeof config.token === "string" ? config.token.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,512}$/.test(token)) throw new Error("Enter a valid Notion internal integration token");
  const pages = config.pageIds ?? config.pages;
  const values = typeof pages === "string" ? pages.trim().split(/[\s,]+/) : pages;
  if (!Array.isArray(values) || values.length < 1 || values.length > notionIndexLimits.pages || values.some((value) => typeof value !== "string" || value.length > 2048)) throw new Error("Select between 1 and 25 Notion page URLs or IDs");
  return { token, pageIds: [...new Set((values as string[]).map(pageId))] };
}

class NotionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
class CoverageLimit extends Error {}
const richText = z.array(z.object({ plain_text: z.string().optional(), text: z.object({ content: z.string() }).optional() }));
const blockSchema = z.object({ object: z.literal("block"), id: z.string().regex(uuid), type: z.string(), has_children: z.boolean(), archived: z.boolean().optional(), in_trash: z.boolean().optional() }).passthrough();
const listSchema = z.object({ object: z.literal("list"), results: z.array(blockSchema).max(100), has_more: z.boolean(), next_cursor: z.string().max(2048).nullable() });
const pageSchema = z.object({ object: z.literal("page"), id: z.string().regex(uuid), archived: z.boolean(), in_trash: z.boolean().optional(), last_edited_time: z.string().datetime(), properties: z.record(z.string(), z.unknown()) });
const textBlocks = new Set(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "code", "quote", "callout"]);
const containers = new Set(["column", "column_list", "table"]);
const ignored = new Set(["divider", "table_of_contents", "breadcrumb"]);
const excluded = new Set(["child_page", "child_database", "synced_block", "link_to_page"]);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new NotionError(0, "Notion returned an invalid response");
  return parsed.data;
}
function textValue(value: unknown): string {
  return parse(richText, value).map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

export async function indexNotion(db: DatabaseSync, connectorId: string, input: Record<string, unknown> | NotionConfig): Promise<KnowledgeIndexResult> {
  const config = validateNotionConfig(input as Record<string, unknown>);
  const documents: KnowledgeDocument[] = [];
  const warnings = new Set<string>();
  let skipped = 0;
  let requests = 0;
  let totalBytes = 0;
  const deadline = Date.now() + notionIndexLimits.timeoutMs;
  // Scope reductions apply even if a later remote request fails.
  const selected = config.pageIds.map((id) => `${connectorId}:${id}`);
  db.prepare(`DELETE FROM knowledge_documents WHERE connector_id = ? AND id NOT IN (${selected.map(() => "?").join(",")})`).run(connectorId, ...selected);

  async function request(endpoint: string): Promise<unknown> {
    if (requests >= notionIndexLimits.requests || Date.now() >= deadline) throw new CoverageLimit();
    if (requests > 0) await delay(350);
    requests += 1;
    try {
      const response = await fetch(`https://api.notion.com/v1/${endpoint}`, {
        method: "GET", redirect: "error",
        headers: { Authorization: `Bearer ${config.token}`, "Notion-Version": "2026-03-11", Accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now()))),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const message = response.status === 401 || response.status === 403 ? "Notion access was denied; cached documents were removed" : response.status === 404 ? "Selected Notion content is unavailable" : response.status === 429 ? "Notion rate limit reached; retry sync later" : "Notion request failed; retry sync later";
        throw new NotionError(response.status, message);
      }
      if (!response.body) throw new NotionError(0, "Notion returned an invalid response");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > notionIndexLimits.responseBytes) {
            await reader.cancel();
            throw new NotionError(0, "Notion response exceeded the safe size limit");
          }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof NotionError) throw error;
      // Never expose provider bodies, token-bearing request objects, or transport exceptions.
      throw new NotionError(0, "Notion request failed or timed out; retry sync later");
    }
  }

  try {
    for (const id of config.pageIds) {
      const documentId = `${connectorId}:${id}`;
      try {
        const page = parse(pageSchema, await request(`pages/${id}`));
        if (page.id.toLowerCase() !== id) throw new NotionError(0, "Notion returned an invalid page reference");
        if (page.archived || page.in_trash) throw new NotionError(404, "Selected Notion content is unavailable");
        let title = "Untitled Notion page";
        for (const property of Object.values(page.properties)) {
          if (property && typeof property === "object" && "type" in property && property.type === "title" && "title" in property) title = textValue(property.title).slice(0, 240) || title;
        }
        const parts: string[] = [];
        let pageBytes = 0;
        const visited = new Set<string>();
        const append = (value: string) => {
          const bytes = Buffer.byteLength(value) + 1;
          if (pageBytes + bytes > notionIndexLimits.pageBytes || totalBytes + bytes > notionIndexLimits.totalBytes) throw new CoverageLimit();
          parts.push(value); pageBytes += bytes; totalBytes += bytes;
        };
        async function children(blockId: string, depth: number): Promise<void> {
          if (depth > notionIndexLimits.depth) { warnings.add("Notion nesting limit reached"); return; }
          if (visited.has(blockId)) throw new NotionError(0, "Notion returned repeated block references");
          visited.add(blockId);
          let cursor: string | undefined;
          const cursors = new Set<string>();
          do {
            const query = new URLSearchParams({ page_size: "100" });
            if (cursor) query.set("start_cursor", cursor);
            const list = parse(listSchema, await request(`blocks/${blockId}/children?${query}`));
            for (const block of list.results) {
              if (block.archived || block.in_trash) continue;
              if (excluded.has(block.type)) { warnings.add("Child pages, databases, linked pages and synced blocks are excluded"); continue; }
              const data = block[block.type];
              if (!data || typeof data !== "object" || Array.isArray(data)) throw new NotionError(0, "Notion returned an invalid block");
              if (textBlocks.has(block.type)) append(textValue((data as Record<string, unknown>).rich_text));
              else if (block.type === "table_row") {
                const cells = parse(z.array(richText), (data as Record<string, unknown>).cells);
                append(cells.map((cell) => textValue(cell)).join(" | "));
              } else if (!containers.has(block.type) && !ignored.has(block.type)) { warnings.add("Attachments and unsupported Notion blocks are excluded"); continue; }
              if (block.has_children) await children(block.id, depth + 1);
            }
            if (!list.has_more) break;
            if (!list.next_cursor || cursors.has(list.next_cursor)) throw new NotionError(0, "Notion returned invalid pagination");
            cursor = list.next_cursor;
            cursors.add(cursor);
          } while (true);
        }
        try { await children(id, 0); }
        catch (error) { if (error instanceof CoverageLimit) warnings.add("Notion index size, request or time limit reached"); else throw error; }
        documents.push({ id: documentId, title, body: parts.join("\n"), uri: `https://www.notion.so/${id.replaceAll("-", "")}`, updatedAt: page.last_edited_time });
      } catch (error) {
        if (error instanceof NotionError && error.status === 404) {
          // Apply confirmed loss of access immediately, even if another page later fails.
          db.prepare("DELETE FROM knowledge_documents WHERE connector_id = ? AND id = ?").run(connectorId, documentId);
          skipped += 1;
          warnings.add("Unavailable or deleted Notion pages were removed from the index");
        } else if (error instanceof CoverageLimit) {
          skipped += config.pageIds.length - documents.length - skipped;
          warnings.add("Notion index size, request or time limit reached");
          break;
        } else throw error;
      }
    }
  } catch (error) {
    if (error instanceof NotionError && (error.status === 401 || error.status === 403)) replaceKnowledgeDocuments(db, connectorId, []);
    throw error;
  }
  replaceKnowledgeDocuments(db, connectorId, documents);
  return { indexed: documents.length, skipped, partial: warnings.size > 0, warnings: [...warnings] };
}
