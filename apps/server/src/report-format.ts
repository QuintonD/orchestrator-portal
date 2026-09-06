import { z } from "zod";
import type { ReportPresentation } from "@orchestrator/contracts";

const text = z.string().trim().min(1).max(4000);
const schema = z.object({
  summary: z.string().trim().min(1).max(500), recommendation: text,
  sections: z.array(z.object({ title: z.string().min(1).max(120), body: text }).strict()).max(8),
  evidence: z.array(z.object({ label: z.string().min(1).max(200), href: z.url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol)).optional(), detail: text.optional(), updatedAt: z.iso.datetime().optional() }).strict()).max(12),
  limits: text, changes: z.array(z.string().min(1).max(500)).max(8).optional(),
}).strict();

export const reportFormatV1 = `Report format v1: return one JSON object with summary (one sentence), recommendation, sections (up to 8 objects with title and body), evidence (up to 12 objects with label and optional http(s) href, detail and ISO updatedAt), limits, and optional changes (strings for a revision). Cite only references actually available to you. Do not invent links or claim verification. No Markdown wrapper is needed.`;

export function parseReportPresentation(body?: string): ReportPresentation | undefined {
  if (!body || body.length > 100_000) return;
  try {
    const candidate = body.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = schema.safeParse(JSON.parse(candidate));
    if (parsed.success) return parsed.data as ReportPresentation;
  } catch { /* Preserve unsupported output as literal report text. */ }
}
