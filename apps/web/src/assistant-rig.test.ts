import { describe, expect, it } from "vitest";
import { appendAssistant, assistantMotions, blendFrames, buildNetwork, consolidateNetwork, edgePath, edgeSegment, formSubteam, networkCount, rigWidth, sampleRig } from "./assistant-rig.js";
import { soundScore } from "./assistant-sound.js";

describe("assistant rig", () => {
  it("preserves the transparent source artboard and measured centre", () => {
    const nodes = buildNetwork();
    expect(nodes).toHaveLength(6);
    expect(nodes[0]!.x * 5.74).toBeCloseTo(718.006, 2);
    expect(nodes[2]!.y * 5.74).toBeCloseTo(140.931, 2);
  });
  it("conserves assistant counts through grouping and lead hierarchies", () => {
    for (const assistants of [0, 1, 5, 12, 19, 36, 120]) for (const leads of [0, 1, 3, 5]) {
      const nodes = buildNetwork({ assistants, leads });
      expect(nodes.reduce((count, node) => count + node.members, 0)).toBe(assistants);
      expect(nodes.length).toBeLessThanOrEqual(21);
      expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
      for (const node of nodes.slice(1)) expect(nodes.some(parent => parent.id === node.parent)).toBe(true);
    }
  });
  it("bounds untrusted counts and rejects non-finite values", () => {
    for (const count of [NaN, Infinity, -100, 1e9]) {
      const nodes = buildNetwork({ assistants: count, leads: count });
      expect(nodes.length).toBeLessThanOrEqual(21);
      expect(nodes.every(node => [node.x, node.y, node.r].every(Number.isFinite))).toBe(true);
    }
  });
  it("moves nodes substantially through depth in idle and active motions", () => {
    for (const state of ["drifting", "thinking"] as const) {
      const initial = sampleRig(state, 0), later = sampleRig(state, 1.4);
      expect(later.nodes.some((node, i) => Math.hypot(node.x - initial.nodes[i]!.x, node.y - initial.nodes[i]!.y) > 8)).toBe(true);
      expect(later.nodes.some(node => Math.abs(node.z) > 25)).toBe(true);
    }
  });
  it("sprouts new identities at their parent before reaching their destinations", () => {
    const from = sampleRig("resting", 0, { assistants: 5 }), to = sampleRig("resting", 0, { assistants: 6 });
    const beginning = blendFrames(from, to, 0).nodes.find(n => n.id === "assistant-5")!;
    expect(beginning.r).toBe(0);
    expect(Math.hypot(beginning.x - from.nodes[0]!.x, beginning.y - from.nodes[0]!.y)).toBeCloseTo(from.nodes[0]!.r);
    expect(blendFrames(from, to, 1)).toEqual(to);
  });
  it("preserves every original branch when adding a direct or adjacent assistant", () => {
    const original = buildNetwork();
    for (const parent of original) {
      const next = appendAssistant(original, parent.id);
      expect(next.slice(0, original.length)).toEqual(original);
      expect(next.at(-1)!.parent).toBe(parent.id);
      const from = sampleRig("still", 0, { network: original }), target = sampleRig("growing", 0, { network: next });
      for (const progress of [0, .2, .5, .8, 1]) {
        const frame = blendFrames(from, target, progress);
        expect(frame.nodes.slice(0, original.length)).toEqual(from.nodes);
        const child = frame.nodes.at(-1)!, anchor = frame.nodes.find(n => n.id === child.parent)!;
        expect(Math.hypot(child.x - anchor.x, child.y - anchor.y)).toBeGreaterThanOrEqual(anchor.r + child.r - .001);
      }
    }
    expect(buildNetwork({ assistants: 6 }).slice(0, 6)).toEqual(original);
  });
  it("keeps every gesture applicable to original, grown, grouped, and hierarchical teams", () => {
    for (const network of [buildNetwork({ assistants: 0 }), buildNetwork(), appendAssistant(buildNetwork(), "assistant-1"), formSubteam(buildNetwork()), buildNetwork({ assistants: 36 }), buildNetwork({ assistants: 120, leads: 5 }), consolidateNetwork(buildNetwork())]) {
      for (const motion of assistantMotions) for (const t of [0, .25, .8, 1.7, 3, 7]) {
        const frame = sampleRig(motion.id, t, { network });
        expect(frame.nodes.map(n => [n.id, n.parent, n.members])).toEqual(network.map(n => [n.id, n.parent, n.members]));
        for (const node of frame.nodes) {
          expect(node.x - node.r).toBeGreaterThanOrEqual(0);
          expect(node.x + node.r).toBeLessThanOrEqual(rigWidth);
          expect(node.y - node.r).toBeGreaterThanOrEqual(0);
          expect(node.y + node.r).toBeLessThanOrEqual(200);
        }
        for (const child of frame.nodes.filter(n => n.parent)) {
          const parent = frame.nodes.find(n => n.id === child.parent)!;
          const edge = edgeSegment(parent, child);
          if (edge.visible) {
            expect(Math.hypot(edge.x1 - parent.x, edge.y1 - parent.y)).toBeCloseTo(parent.r, 8);
            expect(Math.hypot(edge.x2 - child.x, edge.y2 - child.y)).toBeCloseTo(child.r, 8);
          } else expect(edgePath(parent, child)).toBe("M0 0");
        }
      }
      expect(networkCount(consolidateNetwork(network))).toBe(networkCount(network));
      expect(networkCount(formSubteam(network))).toBe(Math.min(120, networkCount(network) + 3));
    }
  });
  it("moves satin illumination with position and depth under one fixed light", () => {
    const first = sampleRig("drifting", 0), turned = sampleRig("drifting", 2.25);
    expect(turned.nodes.filter((node, i) => Math.abs(node.lightX! - first.nodes[i]!.lightX!) + Math.abs(node.lightY! - first.nodes[i]!.lightY!) > .02).length).toBeGreaterThanOrEqual(4);
    expect(new Set(turned.nodes.map(n => `${n.lightX},${n.lightY}`)).size).toBe(6);
    expect(sampleRig("drifting", 9)).toEqual(first);
  });
  it("keeps geometry finite through every study and topology boundary", () => {
    for (const motion of assistantMotions) for (const assistants of [0, 5, 36, 120]) for (const time of [0, .2, 1, 5, 31]) {
      const frame = sampleRig(motion.id, time, { assistants, leads: motion.id === "delegating" ? 3 : 0 });
      expect(frame.nodes.length).toBeLessThanOrEqual(36);
      for (const node of frame.nodes) {
        expect([node.x, node.y, node.z, node.r, node.opacity].every(Number.isFinite)).toBe(true);
        expect(node.r).toBeGreaterThanOrEqual(0);
        if (node.parent) expect(edgePath(frame.nodes.find(n => n.id === node.parent)!, node)).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it("keeps sound quiet, bounded, and silent for held states", () => {
    for (const state of ["still", "paused", "offline"] as const) expect(soundScore(state)).toEqual([]);
    for (const motion of assistantMotions) for (const note of soundScore(motion.id)) {
      expect(note.gain).toBeLessThanOrEqual(.12);
      expect(note.at).toBeLessThan(motion.duration);
      expect(note.duration).toBeLessThanOrEqual(1.8);
      expect(note.frequency).toBeGreaterThan(100);
    }
  });
});
