import { holdingSchema, transactionSchema, commitmentInput, type Holding, type MoneySettings, type MoneySummary, type Transaction } from "@orchestrator/contracts";

export const invalid = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };

// Deliberately small RFC 4180 reader: no guessed columns, locale or number format.
export function csvRows(csv: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (quoted) { if (c === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === '"') { if (cell || closed) invalid("Unexpected quote in CSV"); quoted = true; }
    else if (c === ",") { row.push(cell); cell = ""; closed = false; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && csv[i + 1] === "\n") i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; closed = false; }
    else { if (closed) invalid("Unexpected text after CSV quote"); cell += c; }
  }
  if (quoted) invalid("Unclosed CSV quote");
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((s, i) => (i === 0 ? s.replace(/^\uFEFF/, "") : s).trim()) ?? [];
  if (!header.length || new Set(header).size !== header.length || rows.length < 1 || rows.length > 1000) invalid("Use unique column names and 1–1,000 data rows");
  return rows.map((r, i) => { if (r.length !== header.length) invalid(`CSV row ${i + 2} has the wrong number of columns`); return Object.fromEntries(header.map((h, n) => [h, r[n]!.trim()])); });
}

export function minorUnits(value: string | undefined): number {
  if (!value || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) invalid("Amounts must be non-negative decimals, with at most two decimal places and no currency symbols");
  const [whole, fraction = ""] = value!.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function parsePersonalImport(kind: "transactions" | "holdings" | "calendar", csv: string) {
  return csvRows(csv).map((row, i) => {
    try {
      if (kind === "transactions") return transactionSchema.parse({ ...row, amount: minorUnits(row.amount) });
      if (kind === "holdings") return holdingSchema.parse({ ...row, value: minorUnits(row.value) });
      const { id, ...rest } = row;
      if (!id || id.length > 120) invalid("Calendar rows need a stable id");
      return { id: id!, ...commitmentInput.parse({ ...rest, time: row.time || null, minutes: Number(row.minutes), goalId: null }) };
    } catch { return invalid(`Check CSV row ${i + 2}: column names, dates, amounts and required values must match the template.`); }
  });
}

export function summarizeMoney(transactions: Transaction[], holdings: Holding[], settings: MoneySettings, month: string): MoneySummary {
  const categoryNames = new Map(settings.limits.map((l) => [l.category.toLowerCase(), l.category]));
  const assetNames = new Map(settings.targets.map((t) => [t.assetClass.toLowerCase(), t.assetClass]));
  const labelFor = (labels: Map<string, string>, name: string) => { const key = name.toLowerCase(); if (!labels.has(key)) labels.set(key, name); return labels.get(key)!; };
  const selected = transactions.filter((t) => t.currency === settings.currency && t.date.startsWith(month));
  const totals = new Map<string, number>(); let income = 0, spent = 0;
  for (const t of selected) {
    if (t.type === "income") income += t.amount;
    if (t.type === "expense" || t.type === "refund") { const amount = t.amount * (t.type === "refund" ? -1 : 1), category = labelFor(categoryNames, t.category); spent += amount; totals.set(category, (totals.get(category) ?? 0) + amount); }
  }
  for (const l of settings.limits) if (!totals.has(l.category)) totals.set(l.category, 0);
  const owned = holdings.filter((h) => h.currency === settings.currency), total = owned.reduce((s, h) => s + h.value, 0);
  const assets = new Map<string, number>();
  for (const h of owned) { const assetClass = labelFor(assetNames, h.assetClass); assets.set(assetClass, (assets.get(assetClass) ?? 0) + h.value); }
  for (const t of settings.targets) if (!assets.has(t.assetClass)) assets.set(t.assetClass, 0);
  return { month, currency: settings.currency, income, spent, net: income - spent, excluded: transactions.filter((t) => t.currency !== settings.currency).length + holdings.filter((h) => h.currency !== settings.currency).length,
    categories: [...totals].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, spent: amount, limit: settings.limits.find((l) => l.category === category)?.amount ?? null })),
    total, allocation: [...assets].map(([assetClass, value]) => { const target = settings.targets.find((t) => t.assetClass === assetClass)?.percent ?? null, percent = total ? value / total * 100 : 0; return { assetClass, value, percent, target, drift: target === null || !total ? null : percent - target }; }),
    oldestHolding: owned.map((h) => h.asOf).sort()[0] ?? null, latestTransaction: transactions.filter((t) => t.currency === settings.currency).map((t) => t.date).sort().at(-1) ?? null };
}

export function calendarText(items: Array<{ id: string; title: string; date: string; time: string | null; minutes: number; note: string }>) {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orchestrator//Personal v1//EN"];
  for (const item of items) {
    lines.push("BEGIN:VEVENT", `UID:${escape(item.id)}@orchestrator.local`, `DTSTAMP:${stamp}`, `SUMMARY:${escape(item.title)}`, `DESCRIPTION:${escape(item.note)}`);
    if (item.time) { lines.push(`DTSTART:${item.date.replace(/-/g, "")}T${item.time.replace(":", "")}00`, `DURATION:PT${item.minutes}M`); }
    else lines.push(`DTSTART;VALUE=DATE:${item.date.replace(/-/g, "")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Fold by UTF-8 octets without splitting a Unicode code point.
  return lines.map((line) => { let out = "", count = 0; for (const c of line) { const size = Buffer.byteLength(c); if (count + size > 75) { out += "\r\n "; count = 1; } out += c; count += size; } return out; }).join("\r\n") + "\r\n";
}
