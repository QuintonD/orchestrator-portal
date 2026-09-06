import { z } from "zod";

export const personalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Use a real calendar date");
export const personalCurrency = z.enum(["EUR", "USD", "GBP", "CHF"]);
const text = (max: number) => z.string().trim().min(1).max(max);
export const projectInput = z.object({ title: text(120), objective: text(3000), criteria: text(2000), due: personalDate.nullable().default(null), kind: z.enum(["research", "software", "content", "general"]).default("general") }).strict();
export interface PersonalTask { id: string; title: string; instruction: string; state: "queued" | "running" | "review" | "accepted" | "unknown"; body: string; evidence: string; updatedAt: string; reportId?: string; history?: Array<{ body: string; evidence: string; state: string; updatedAt: string }> }
export interface PersonalProject extends z.infer<typeof projectInput> { id: string; version: number; createdAt: string; updatedAt: string; assistantId: string | null; automatic: boolean; mandate: string | null; issue: string; tasks: PersonalTask[] }
export const transactionSchema = z.object({ id: text(120), date: personalDate, description: text(300), amount: z.number().int().positive().max(100_000_000_000), type: z.enum(["income", "expense", "refund", "transfer"]), category: text(80), currency: personalCurrency }).strict();
export type Transaction = z.infer<typeof transactionSchema> & { source: string };
export const holdingSchema = z.object({ id: text(120), name: text(160), assetClass: text(80), value: z.number().int().nonnegative().max(100_000_000_000), currency: personalCurrency, asOf: personalDate }).strict();
export type Holding = z.infer<typeof holdingSchema> & { source: string };
export const moneySettingsSchema = z.object({ currency: personalCurrency.default("EUR"), limits: z.array(z.object({ category: text(80), amount: z.number().int().nonnegative().max(100_000_000_000) }).strict()).max(100), targets: z.array(z.object({ assetClass: text(80), percent: z.number().min(0).max(100) }).strict()).max(30), objective: z.string().trim().max(1000), horizon: z.string().trim().max(200), risk: z.enum(["unset", "low", "medium", "high"]) }).strict().superRefine((s, ctx) => {
  if (s.targets.length && Math.abs(s.targets.reduce((sum, t) => sum + t.percent, 0) - 100) > .001) ctx.addIssue({ code: "custom", message: "Allocation targets must total 100%" });
  for (const names of [s.limits.map((l) => l.category), s.targets.map((t) => t.assetClass)]) if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) ctx.addIssue({ code: "custom", message: "Categories must be unique" });
});
export type MoneySettings = z.infer<typeof moneySettingsSchema>;
export const goalInput = z.object({ title: text(120), why: text(1000), target: z.number().positive().max(1e9), unit: text(40), due: personalDate.nullable().default(null), weekly: z.number().positive().max(1e9).default(1) }).strict();
export interface PersonalGoal extends z.infer<typeof goalInput> { id: string; version: number; archived: boolean; createdAt: string; checkins: Array<{ id: string; date: string; value: number; note: string }> }
export const commitmentInput = z.object({ title: text(180), date: personalDate, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null), minutes: z.number().int().min(5).max(1440).default(30), goalId: z.string().max(100).nullable().default(null), note: z.string().trim().max(2000).default("") }).strict();
export interface Commitment extends z.infer<typeof commitmentInput> { id: string; version: number; done: boolean; source: string; createdAt: string }
export interface PersonalSignal { id: string; title: string; detail: string; area: "projects" | "money" | "life"; severity: "action" | "info" }
export interface MoneySummary { month: string; currency: string; income: number; spent: number; net: number; excluded: number; categories: Array<{ category: string; spent: number; limit: number | null }>; total: number; allocation: Array<{ assetClass: string; value: number; percent: number; target: number | null; drift: number | null }>; oldestHolding: string | null; latestTransaction: string | null }
export interface PersonalWorkspace { projects: PersonalProject[]; goals: PersonalGoal[]; commitments: Commitment[]; transactions: Transaction[]; holdings: Holding[]; settings: MoneySettings; money: MoneySummary; signals: PersonalSignal[]; today: string; demo: boolean; dispatchPaused: boolean; reflection: string[] }
