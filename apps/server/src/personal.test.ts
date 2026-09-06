import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PersonalProject, PersonalWorkspace } from "@orchestrator/contracts";
import { createApp } from "./server.js";
import { runtimeAdapters } from "./adapters.js";
import { calendarText, csvRows, minorUnits } from "./personal-data.js";
import { DatabaseSync } from "node:sqlite";
import { Vault } from "./crypto.js";

const apps: FastifyInstance[] = [], dirs: string[] = [];
async function setup(demo = true, existing?: string) { const dataDir = existing ?? await mkdtemp(path.join(os.tmpdir(), "portal-personal-")); if (!existing) dirs.push(dataDir); const app = await createApp({ dataDir, demo, host: "127.0.0.1", isLoopback: true }); apps.push(app); return { app, dataDir }; }
const request = (app: FastifyInstance, url: string, payload?: unknown, method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST") => app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
const state = async (app: FastifyInstance) => (await app.inject("/api/personal")).json<PersonalWorkspace>();
const createProject = async (app: FastifyInstance) => (await request(app, "/api/personal/projects", { title: "Private research project", objective: "Prepare a comparison of two local workflows", criteria: "Cite sources and state missing measurements", kind: "research" })).json<PersonalProject>();
const authorize = async (app: FastifyInstance, p: PersonalProject) => request(app, `/api/personal/projects/${p.id}/automation`, { version: p.version, enabled: true, assistantId: "atlas", confirmed: true });
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await Promise.all(apps.splice(0).map((a) => a.close())); await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

describe("personal workflows", () => {
  it("advances authorized projects from the gateway timer without a browser or repeated requests", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const { app } = await setup(); const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockResolvedValue({ state: "claimed", reply: "A source-produced draft" });
    const p = await createProject(app); await authorize(app, p);
    await vi.advanceTimersByTimeAsync(90_000);
    const complete = (await state(app)).projects.find((r) => r.id === p.id)!;
    expect(send).toHaveBeenCalledTimes(3); expect(complete.tasks.every((t) => t.state === "review")).toBe(true); expect(complete.automatic).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000); expect(send).toHaveBeenCalledTimes(3);
  });
  it("keeps sensitive briefs scoped, idempotent and encrypted, and isolates project source sessions", async () => {
    const { app, dataDir } = await setup(); const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockResolvedValue({ state: "claimed", reply: "A bounded personal response" });
    const b = { id: crypto.randomUUID(), area: "money", assistantId: "atlas", question: "Explain gaps in my plan", confirmed: true };
    expect((await request(app, "/api/personal/brief", { ...b, confirmed: false })).statusCode).toBe(400);
    const result = await request(app, "/api/personal/brief", b); expect(result.statusCode).toBe(200); expect(result.json().state).toBe("claimed");
    await request(app, "/api/personal/brief", b); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toContain("cash flow"); expect(send.mock.calls[0]![1]).not.toContain("Sample groceries"); expect(send.mock.calls[0]![1]).not.toContain("Protect time for deep work"); expect(send.mock.calls[0]![2]).toBe(`portal-personal-${b.id}`);
    expect((await request(app, "/api/personal/brief", { ...b, area: "coach" })).statusCode).toBe(409);
    const p = await createProject(app); await authorize(app, p); await request(app, `/api/personal/projects/${p.id}/advance`); expect(send.mock.calls[1]![2]).toBe(`portal-project-${p.id}`);
    await app.close(); const bytes = await readFile(path.join(dataDir, "orchestrator.db")); expect(bytes.includes(Buffer.from("Private research project"))).toBe(false); expect(bytes.includes(Buffer.from("A bounded personal response"))).toBe(false);
  });
  it("recovers a persisted running task as unknown after restart without dispatch", async () => {
    const { app, dataDir } = await setup(); const p = await createProject(app); await app.close();
    const db = new DatabaseSync(path.join(dataDir, "orchestrator.db")), vault = new Vault(dataDir);
    db.prepare("UPDATE alpha_records SET payload=? WHERE id=?").run(vault.seal({ ...p, automatic: true, tasks: p.tasks.map((t, i) => i ? t : { ...t, state: "running" }) }), p.id); db.close();
    const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage"); const next = (await setup(true, dataDir)).app; const restored = (await state(next)).projects.find((r) => r.id === p.id)!; expect(restored.tasks[0]!.state).toBe("unknown"); expect(restored.automatic).toBe(false); expect(send).not.toHaveBeenCalled();
  });
  it("imports calendar snapshots once and detects commitments that overlap midnight", async () => {
    const { app } = await setup(); const csv = "id,title,date,time,minutes,note\nnight,Evening work,2026-09-06,23:45,60,Prepare notes\nmorning,Early call,2026-09-07,00:15,30,Read the brief";
    const p = (await request(app, "/api/personal/import/preview", { kind: "calendar", source: "Local calendar", csv })).json();
    expect((await request(app, `/api/personal/import/${p.id}/commit`)).json().added).toBe(2); await request(app, `/api/personal/import/${p.id}/commit`);
    const w = await state(app); expect(w.commitments.filter((c) => c.source === "Local calendar")).toHaveLength(2); expect(w.signals.some((s) => s.title === "Two commitments overlap" && s.detail.includes("Evening work"))).toBe(true);
  });
  it("requires authentication and keeps new private workspaces empty", async () => { const { app } = await setup(false); expect((await app.inject("/api/personal")).statusCode).toBe(401); expect((await request(app, "/api/personal/projects", {})).statusCode).toBe(401); });
  it("prepares a bounded plan, produces distinct drafts once and requires acceptance evidence", async () => {
    const { app } = await setup(); const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage"); let p = await createProject(app);
    expect(p.tasks).toHaveLength(3); expect(send).not.toHaveBeenCalled();
    expect((await request(app, `/api/personal/projects/${p.id}/automation`, { version: p.version, enabled: true, assistantId: "atlas" })).statusCode).toBe(400);
    expect((await authorize(app, p)).statusCode).toBe(200);
    for (let i = 0; i < 3; i++) p = (await request(app, `/api/personal/projects/${p.id}/advance`)).json();
    expect(p.tasks.map((t) => t.state)).toEqual(["review", "review", "review"]); expect(p.automatic).toBe(false); expect(new Set(p.tasks.map((t) => t.body)).size).toBe(3);
    await request(app, `/api/personal/projects/${p.id}/advance`); expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]![1]).not.toContain("Sample income"); expect(send.mock.calls[0]![1]).not.toContain("Protect time for deep work");
    const url = `/api/personal/projects/${p.id}/tasks/${p.tasks[0]!.id}/review`;
    expect((await request(app, url, { version: p.version, action: "accept", evidence: "" })).statusCode).toBe(400);
    const accepted = await request(app, url, { version: p.version, action: "accept", evidence: "Inspected the three steps against the recorded criteria." }); expect(accepted.json().tasks[0].state).toBe("accepted");
    expect((await request(app, url, { version: p.version, action: "accept", evidence: "stale" })).statusCode).toBe(409);
  });
  it("honors pause and revokes automation when the approved assistant changes", async () => {
    const { app } = await setup(); const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage"); const p = await createProject(app); await authorize(app, p);
    await request(app, "/api/dispatch", { paused: true }, "PUT"); await request(app, `/api/personal/projects/${p.id}/advance`); expect(send).not.toHaveBeenCalled();
    await request(app, "/api/dispatch", { paused: false }, "PUT");
    await request(app, "/api/assistants/atlas/profile", { name: "Atlas", purpose: "A changed assistant mandate", criteria: "New explicit criteria" }, "PUT");
    const updated = (await request(app, `/api/personal/projects/${p.id}/advance`)).json(); expect(updated.automatic).toBe(false); expect(updated.issue).toContain("changed"); expect(send).not.toHaveBeenCalled();
  });
  it("keeps prior draft evidence on correction and invalidates dependent stages", async () => {
    const { app } = await setup(); vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockResolvedValue({ state: "claimed", reply: "A draft for inspection" }); let p = await createProject(app); await authorize(app, p);
    for (let i = 0; i < 3; i++) p = (await request(app, `/api/personal/projects/${p.id}/advance`)).json();
    p = (await request(app, `/api/personal/projects/${p.id}/tasks/${p.tasks[2]!.id}/review`, { version: p.version, action: "accept", evidence: "Checked the review before identifying a new requirement." })).json();
    const revised = (await request(app, `/api/personal/projects/${p.id}/tasks/${p.tasks[1]!.id}/review`, { version: p.version, action: "revise", evidence: "Include a counterbalanced trial order." })).json<PersonalProject>();
    expect(revised.tasks.map((t) => t.state)).toEqual(["review", "queued", "queued"]); expect(revised.tasks[2]!.history?.[0]?.state).toBe("accepted"); expect(revised.tasks[1]!.instruction).toContain("counterbalanced"); expect(revised.automatic).toBe(false); expect(revised.mandate).toBeNull();
  });
  it("removes a mistaken financial source without other records and permits a corrected reimport", async () => {
    const { app } = await setup(); const body = { kind: "transactions", source: "Mistaken source", csv: "id,date,description,amount,type,category,currency\na,2026-01-01,Wrong amount,10,expense,Food,EUR" };
    const p = (await request(app, "/api/personal/import/preview", body)).json(); await request(app, `/api/personal/import/${p.id}/commit`);
    expect((await request(app, "/api/personal/imported-source", { kind: body.kind, source: body.source, confirmed: false }, "DELETE")).statusCode).toBe(400);
    expect((await request(app, "/api/personal/imported-source", { kind: body.kind, source: body.source, confirmed: true }, "DELETE")).json().removed).toBe(1);
    expect((await state(app)).transactions.some((t) => t.source === "Synthetic example")).toBe(true);
    const corrected = (await request(app, "/api/personal/import/preview", { ...body, csv: body.csv.replace(",10,", ",15,") })).json(); expect(corrected.added).toBe(1);
  });
  it("persists uncertain delivery, prevents parallel/repeated dispatch and reconciles explicitly", async () => {
    const { app, dataDir } = await setup(); let resolve!: (v: { state: "unknown"; reply: string }) => void;
    const send = vi.spyOn(runtimeAdapters.get("demo")!, "sendMessage").mockImplementation(() => new Promise((r) => { resolve = r; }));
    let p = await createProject(app); await authorize(app, p); const first = request(app, `/api/personal/projects/${p.id}/advance`); const executing = first.then((r) => r);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const during = (await state(app)).projects.find((r) => r.id === p.id)!; expect(during.tasks[0]!.state).toBe("running");
    await request(app, `/api/personal/projects/${p.id}/advance`); expect(send).toHaveBeenCalledTimes(1);
    resolve({ state: "unknown", reply: "Uncertain receipt" }); p = (await executing).json(); expect(p.tasks[0]!.state).toBe("unknown");
    await request(app, `/api/personal/projects/${p.id}/advance`); expect(send).toHaveBeenCalledTimes(1);
    await app.close(); const next = (await setup(true, dataDir)).app; const restored = (await state(next)).projects.find((r) => r.id === p.id)!; expect(restored.tasks[0]!.state).toBe("unknown");
    expect((await authorize(next, restored)).statusCode).toBe(409);
    const reconciled = await request(next, `/api/personal/projects/${p.id}/tasks/${p.tasks[0]!.id}/review`, { version: restored.version, action: "reconcile-result", evidence: "Source session portal-atlas returned the complete draft. Operator inspected it." }); expect(reconciled.json().tasks[0].state).toBe("review"); expect(send).toHaveBeenCalledTimes(1);
  });
  it("imports financial rows atomically, handles refunds/transfers, protects currency and replay", async () => {
    const { app } = await setup(); const date = new Date().toISOString().slice(0, 10);
    const csv = `id,date,description,amount,type,category,currency\na,${date},Salary,100.10,income,Pay,USD\nb,${date},Food,30.01,expense,Food,USD\nc,${date},Refund,5.02,refund,Food,USD\nd,${date},Move,80.00,transfer,Transfer,USD`;
    const preview = await request(app, "/api/personal/import/preview", { kind: "transactions", source: "Test bank", csv }); expect(preview.statusCode).toBe(200); expect(preview.json().added).toBe(4);
    const url = `/api/personal/import/${preview.json().id}/commit`; expect((await request(app, url)).json().added).toBe(4); expect((await request(app, url)).json().added).toBe(0);
    const repeated = await request(app, "/api/personal/import/preview", { kind: "transactions", source: "Test bank", csv }); expect(repeated.json().duplicate).toBe(4);
    await request(app, "/api/personal/money/settings", { currency: "USD", limits: [{ category: "Food", amount: 2000 }], targets: [], objective: "", horizon: "", risk: "unset" }, "PUT");
    const w = await state(app); expect(w.money.income).toBe(10010); expect(w.money.spent).toBe(2499); expect(w.money.net).toBe(7511); expect(w.money.excluded).toBeGreaterThan(0); expect(w.signals.some((s) => s.id === "budget-Food")).toBe(true);
    expect((await request(app, "/api/personal/import/preview", { kind: "transactions", source: "Test bank", csv: csv.replace("100.10", "100.11") })).statusCode).toBe(409);
    expect((await request(app, "/api/personal/import/preview", { kind: "transactions", source: "Test bank", csv: csv + `\ne,2026-02-30,Bad,50,expense,Food,USD` })).statusCode).toBe(400);
    expect((await state(app)).transactions.filter((t) => t.source === "Test bank")).toHaveLength(4);
  });
  it("rejects stale holding snapshots and invalid target totals; calculates drift from current records", async () => {
    const { app } = await setup(); const importCsv = async (csv: string) => { const p = await request(app, "/api/personal/import/preview", { kind: "holdings", source: "Test broker", csv }); if (p.statusCode !== 200) return p; return request(app, `/api/personal/import/${p.json().id}/commit`); };
    const header = "id,name,assetClass,value,currency,asOf\n";
    expect((await importCsv(header + "a,Fund A,Equities,100,USD,2026-01-01")).statusCode).toBe(200);
    expect((await importCsv(header + "a,Fund A,Equities,120,USD,2026-01-02")).json().updated).toBe(1);
    expect((await importCsv(header + "a,Fund A,Equities,90,USD,2026-01-01")).statusCode).toBe(409);
    const prefs = { currency: "USD", limits: [], targets: [{ assetClass: "Equities", percent: 60 }, { assetClass: "Cash", percent: 40 }], objective: "Retirement", horizon: "20 years", risk: "medium" };
    expect((await request(app, "/api/personal/money/settings", { ...prefs, targets: [{ assetClass: "Equities", percent: 60 }] }, "PUT")).statusCode).toBe(400);
    await request(app, "/api/personal/money/settings", prefs, "PUT"); const w = await state(app); expect(w.money.total).toBe(12000); expect(w.money.allocation.find((a) => a.assetClass === "Equities")?.drift).toBe(40); expect(w.holdings.filter((h) => h.source === "Test broker")).toHaveLength(1);
  });
  it("preserves local corrections across identical imports and rejects conflicting previews at commit", async () => {
    const { app } = await setup(); const csv = "id,date,description,amount,type,category,currency\na,2026-01-01,Secret merchant,10,expense,Other,EUR";
    const preview = async (value: string) => (await request(app, "/api/personal/import/preview", { kind: "transactions", source: "Private statement", csv: value })).json();
    const first = await preview(csv), conflicting = await preview(csv.replace(",10,", ",11,"));
    await request(app, `/api/personal/import/${first.id}/commit`); expect((await request(app, `/api/personal/import/${conflicting.id}/commit`)).statusCode).toBe(409);
    const t = (await state(app)).transactions.find((t) => t.source === "Private statement")!;
    await request(app, `/api/personal/transactions/${t.id}`, { category: "Food", type: "expense" }, "PATCH");
    await request(app, `/api/personal/import/${(await preview(csv)).id}/commit`); expect((await state(app)).transactions.find((r) => r.id === t.id)?.category).toBe("Food");
  });
  it("links goals and commitments, detects overlaps, deduplicates check-ins and supports undo", async () => {
    const { app } = await setup(); const date = new Date().toISOString().slice(0, 10);
    const g = (await request(app, "/api/personal/goals", { title: "Read", why: "Understand more", target: 10, unit: "chapters", weekly: 2 })).json();
    const c = (await request(app, "/api/personal/commitments", { title: "Reading", date, time: "09:00", minutes: 60, goalId: g.id })).json();
    await request(app, "/api/personal/commitments", { title: "Call", date, time: "09:30", minutes: 30 }); expect((await state(app)).signals.some((s) => s.id.startsWith("conflict-"))).toBe(true);
    const b = { id: crypto.randomUUID(), date, value: 2, note: "Focused well" };
    await request(app, `/api/personal/goals/${g.id}/checkins`, b); await request(app, `/api/personal/goals/${g.id}/checkins`, b); expect((await state(app)).goals.find((r) => r.id === g.id)?.checkins).toHaveLength(1);
    expect((await request(app, `/api/personal/goals/${g.id}/checkins`, { ...b, value: 3 })).statusCode).toBe(409);
    expect((await request(app, `/api/personal/goals/${g.id}/checkins`, { ...b, id: crypto.randomUUID(), date: "2099-01-01" })).statusCode).toBe(400);
    await request(app, `/api/personal/goals/${g.id}/checkins/${b.id}`, undefined, "DELETE"); expect((await state(app)).goals.find((r) => r.id === g.id)?.checkins).toHaveLength(0);
    const payload = { title: c.title, date, time: c.time, minutes: c.minutes, goalId: g.id, note: "", version: c.version, done: true };
    expect((await request(app, `/api/personal/commitments/${c.id}`, payload, "PUT")).statusCode).toBe(200); expect((await request(app, `/api/personal/commitments/${c.id}`, payload, "PUT")).statusCode).toBe(409);
    const ics = await app.inject("/api/personal/calendar.ics"); expect(ics.headers["content-type"]).toContain("text/calendar"); expect(ics.body).not.toContain("SUMMARY:Reading"); expect(ics.body).toContain("SUMMARY:Call");
  });
  it("uses the prior completed month for baseline and never fabricates an account balance", async () => {
    const { app } = await setup(); const baseline = (await app.inject("/api/personal/money/baseline")).json(); expect(baseline.limits).toEqual([]); expect(baseline.month).not.toBe((await state(app)).money.month); expect(baseline.note).toContain("full month");
  });
  it("handles quoted CSV and calendar escaping without formula execution or event injection", () => {
    expect(csvRows('id,description\r\na,"one, two"\r\nb,"a ""quote""\nline"')).toEqual([{ id: "a", description: "one, two" }, { id: "b", description: 'a "quote"\nline' }]);
    for (const csv of ['a,a\nx,y', 'a,b\nx', 'a\n"unclosed', 'a\n"x"bad']) expect(() => csvRows(csv)).toThrow();
    expect(minorUnits("100.09")).toBe(10009); for (const amount of ["1,00", "1e5", "-1", "1.001", "=CMD()"]) expect(() => minorUnits(amount)).toThrow();
    const calendar = calendarText([{ id: "safe", title: "Hi\nBEGIN:VEVENT", date: "2026-09-06", time: "09:00", minutes: 30, note: "a,b;c" }]); expect(calendar.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1); expect(calendar).toContain("SUMMARY:Hi\\nBEGIN:VEVENT"); expect(calendar).toContain("DTSTART:20260906T090000");
  });
});
