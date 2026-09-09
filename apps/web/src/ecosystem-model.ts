import type { EcosystemSnapshot } from "@orchestrator/contracts";
import { appendAssistant, buildNetwork, type PresenceState, type RigNode } from "./assistant-rig.js";

export const sourceIsStale = (source: EcosystemSnapshot["connectors"][number], now: number) => source.status !== "connected" || !source.lastSyncAt || !Number.isFinite(Date.parse(source.lastSyncAt)) || now - Date.parse(source.lastSyncAt) > 15 * 60_000;
const nodeId = (id: string, grouped: boolean) => `${grouped ? "source" : "member"}-${encodeURIComponent(id)}`;
const activity = (members: EcosystemSnapshot["assistants"]): RigNode["activity"] => members.some(a => a.state === "unknown") ? "unknown" : members.some(a => a.state === "running") ? "running" : members.every(a => a.state === "paused") ? "paused" : "ready";

/** Stable assistant identity, with source groups only when the scene becomes dense. */
export function ecosystemNetwork(previous: readonly RigNode[], snapshot: EcosystemSnapshot): RigNode[] {
  const grouped = snapshot.assistants.length > 18;
  const groups = new Map<string, EcosystemSnapshot["assistants"]>();
  for (const assistant of snapshot.assistants) {
    const key = nodeId(grouped ? assistant.connectorId : assistant.id, grouped);
    groups.set(key, [...(groups.get(key) ?? []), assistant]);
  }
  // More than 18 source groups retain their total in one explicit overflow group.
  if (groups.size > 18) {
    const overflow = [...groups.entries()].slice(17);
    for (const [id] of overflow) groups.delete(id);
    groups.set("other-sources", overflow.flatMap(([, members]) => members));
  }
  const retained = previous.filter(node => !node.parent || groups.has(node.id)).map(node => ({ ...node, members: node.parent ? 1 : 0 }));
  let nodes = retained.length ? retained : buildNetwork({ assistants: 0 });
  const hasRetainedMembers = nodes.length > 1;
  const initial = buildNetwork({ assistants: groups.size });
  let index = 1;
  for (const [id, members] of groups) {
    let node = nodes.find(n => n.id === id);
    if (!node) {
      if (!hasRetainedMembers) { node = { ...initial[index]!, id }; nodes.push(node); }
      else { nodes = appendAssistant(nodes); node = nodes.at(-1)!; node.id = id; }
    }
    node.members = members.length; node.activity = activity(members); index++;
  }
  return nodes;
}

export function ecosystemMood(snapshot: EcosystemSnapshot | null, unavailable: boolean, pending: boolean, now: number): { state: PresenceState; label: string; destination: string } {
  if (unavailable) return { state: "offline", label: "Snapshot unavailable", destination: "/connections" };
  if (!snapshot) return { state: "still", label: "Reading workspace", destination: "/" };
  const unknown = snapshot.assistants.filter(a => a.state === "unknown").length;
  const running = snapshot.assistants.filter(a => a.state === "running").length;
  if (unknown) return { state: "aware", label: `${unknown} uncertain ${unknown === 1 ? "outcome" : "outcomes"}`, destination: "/agents" };
  if (snapshot.attentionCount) return { state: "aware", label: `${snapshot.attentionCount} need you`, destination: "/attention" };
  if (running) return { state: "thinking", label: `${running} ${running === 1 ? "assistant" : "assistants"} working`, destination: "/agents" };
  if (pending || snapshot.connectors.some(c => c.status === "syncing")) return { state: "connecting", label: "Request in progress", destination: "/activity" };
  const stale = snapshot.connectors.filter(c => sourceIsStale(c, now)).length;
  if (stale) return { state: "offline", label: `${stale} ${stale === 1 ? "source needs" : "sources need"} a check`, destination: "/connections" };
  if (snapshot.dispatchPaused) return { state: "paused", label: "Dispatch paused", destination: "/agents" };
  if (snapshot.assistants.length && snapshot.assistants.every(a => a.state === "paused")) return { state: "paused", label: "Assistants paused", destination: "/agents" };
  return { state: "resting", label: snapshot.assistants.length ? "At ease" : "Ready to connect", destination: snapshot.assistants.length ? "/agents" : "/connections" };
}

export function ecosystemGesture(previous: EcosystemSnapshot, next: EcosystemSnapshot): PresenceState | null {
  const oldIds = new Set(previous.assistants.map(a => a.id));
  if (previous.assistants.length <= 18 && next.assistants.length > 18) return "consolidating";
  if (next.assistants.some(a => !oldIds.has(a.id))) return "growing";
  if (next.assistants.length < previous.assistants.length) return "consolidating";
  if (next.latestReport && next.latestReport.id !== previous.latestReport?.id && next.reportCount > previous.reportCount) return next.latestReport.state === "verified" ? "success" : "responding";
  return null;
}
