import { describe, expect, it } from "vitest";
import type { EcosystemSnapshot } from "@orchestrator/contracts";
import { buildNetwork, networkCount } from "./assistant-rig.js";
import { ecosystemGesture, ecosystemMood, ecosystemNetwork } from "./ecosystem-model.js";

const now = Date.parse("2026-09-09T12:00:00Z");
function snapshot(count = 5): EcosystemSnapshot {
  return { version: 1, assistants: Array.from({ length: count }, (_, i) => ({ id: `a-${i}`, connectorId: "local", state: "ready" })), connectors: [{ id: "local", status: "connected", lastSyncAt: new Date(now).toISOString() }], attentionCount: 0, dispatchPaused: false, reportCount: 0, latestReport: null };
}
describe("living ecosystem", () => {
  it("keeps identity and coordinates through reorder, growth and removal", () => {
    const original = ecosystemNetwork([], snapshot());
    expect(original.map(n => [n.x, n.y, n.r])).toEqual(buildNetwork().map(n => [n.x, n.y, n.r]));
    const next = snapshot(6); next.assistants.reverse();
    const grown = ecosystemNetwork(original, next);
    expect(grown.slice(0, original.length)).toEqual(original);
    const fewer = snapshot(6); fewer.assistants.splice(2, 1);
    const removed = ecosystemNetwork(grown, fewer);
    expect(removed).toEqual(grown.filter(n => n.id !== "member-a-2"));
    expect(networkCount(removed)).toBe(5);
  });
  it("conserves members and valid edges while grouping many sources", () => {
    for (const count of [0, 1, 18, 19, 60, 120]) {
      const data = snapshot(count);
      data.assistants.forEach((a, i) => a.connectorId = `source-${i % 24}`);
      const graph = ecosystemNetwork(ecosystemNetwork([], snapshot(60)), data);
      expect(networkCount(graph)).toBe(count);
      expect(graph.length).toBeLessThanOrEqual(19);
      expect(new Set(graph.map(n => n.id)).size).toBe(graph.length);
      for (const node of graph.slice(1)) expect(graph.some(n => n.id === node.parent)).toBe(true);
    }
  });
  it("prioritizes uncertainty, preserves running source work during dispatch pause, and exposes stale data", () => {
    const data = snapshot(); data.assistants[0]!.state = "running"; data.dispatchPaused = true;
    expect(ecosystemMood(data, false, false, now).state).toBe("thinking");
    data.assistants[1]!.state = "unknown";
    expect(ecosystemMood(data, false, true, now).label).toBe("1 uncertain outcome");
    expect(ecosystemMood(data, true, true, now).state).toBe("offline");
    expect(ecosystemMood(snapshot(), false, false, now + 16 * 60_000).state).toBe("offline");
    expect(ecosystemMood(snapshot(0), false, false, now).label).toBe("Ready to connect");
  });
  it("responds once to new reports without celebrating unverified claims", () => {
    const before = snapshot(), after = snapshot();
    after.reportCount = 1; after.latestReport = { id: "report", state: "claimed" };
    expect(ecosystemGesture(before, after)).toBe("responding");
    expect(ecosystemGesture(after, after)).toBe(null);
    after.latestReport.state = "verified";
    expect(ecosystemGesture(before, after)).toBe("success");
    expect(ecosystemGesture(snapshot(), snapshot(6))).toBe("growing");
    expect(ecosystemGesture(snapshot(18), snapshot(19))).toBe("consolidating");
  });
});
