import { describe, expect, it } from "vitest";
import { parseReportPresentation } from "./report-format.js";

const report = { summary: "A decision is ready", recommendation: "Inspect the source", sections: [{ title: "Finding", body: "One outstanding item" }], evidence: [{ label: "Source", href: "https://example.org/evidence" }], limits: "Claimed by the source, not verified" };
describe("runtime report format v1", () => {
  it("accepts bounded structured reports and fenced JSON", () => {
    expect(parseReportPresentation(JSON.stringify(report))).toEqual(report);
    expect(parseReportPresentation(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``)).toEqual(report);
  });
  it("rejects executable links, unknown fields and oversized output without inventing structure", () => {
    for (const body of ["plain runtime response", JSON.stringify({ ...report, tools: ["delete"] }), JSON.stringify({ ...report, evidence: [{ label: "Click", href: "javascript:alert(1)" }] }), "x".repeat(100001)]) expect(parseReportPresentation(body)).toBeUndefined();
  });
});
