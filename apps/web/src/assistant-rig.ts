/** All coordinates share the transparent source PNG's 1371 × 1148 artboard. */
export const rigWidth = 1371 / 5.74;
export const rigHeight = 200;
export const rigCentre = { x: 718.006 / 5.74, y: 654.654 / 5.74, r: 85 / 5.74 };
const referenceNodes = [
  { x: 536.523 / 5.74, y: 302.151 / 5.74, r: 58 / 5.74 },
  { x: 1132.132 / 5.74, y: 140.931 / 5.74, r: 89 / 5.74 },
  { x: 1120.097 / 5.74, y: 1032.825 / 5.74, r: 95 / 5.74 },
  { x: 540.533 / 5.74, y: 889.561 / 5.74, r: 54 / 5.74 },
  { x: 197.105 / 5.74, y: 642.196 / 5.74, r: 61 / 5.74 },
];

export const assistantMotions = [
  { id: "still", name: "Original", group: "Idle", detail: "The original pose. Your supplied PNG is used for the five-branch team.", duration: 0, sound: "Silent" },
  { id: "resting", name: "Breathe", group: "Idle", detail: "The branches stretch and settle with a slow breath.", duration: 5.6, sound: "Warm, soft breath" },
  { id: "drifting", name: "Drift in 3D", group: "Idle", detail: "Nodes pass in front of and behind the centre.", duration: 9, sound: "Air and glass" },
  { id: "curious", name: "Curious", group: "Idle", detail: "A small lean, a look around, then back to you.", duration: 6, sound: "A questioning pair" },
  { id: "listening", name: "Listening", group: "Active", detail: "The network leans inward to catch the next signal.", duration: 3.2, sound: "Soft inward shimmer" },
  { id: "thinking", name: "Thinking", group: "Active", detail: "A turning constellation, with signals travelling between nodes.", duration: 4.8, sound: "Measured plucks" },
  { id: "connecting", name: "Connecting", group: "Active", detail: "Branches reach outward and make contact in sequence.", duration: 3.6, sound: "Rising connection notes" },
  { id: "responding", name: "Responding", group: "Active", detail: "A wave moves from the centre out through the team.", duration: 2.8, sound: "An open, warm chord" },
  { id: "growing", name: "Grow a team", group: "Network", detail: "One new branch grows from your chosen parent. The existing team stays in place.", duration: 4.5, sound: "A note for each arrival" },
  { id: "consolidating", name: "Consolidate", group: "Network", detail: "The current team gathers into fewer, counted groups.", duration: 5, sound: "Many notes resolve into one" },
  { id: "delegating", name: "Form subteams", group: "Network", detail: "A new lead grows from your chosen parent, followed by two adjacent assistants.", duration: 5, sound: "Call and response" },
  { id: "playful", name: "Little jump", group: "Personality", detail: "A squash, a light jump, and a springy landing.", duration: 4, sound: "Rounded pop and landing" },
  { id: "jitter", name: "Jitter", group: "Personality", detail: "A quick shiver runs along the branches, then releases.", duration: 3, sound: "A short textured flutter" },
  { id: "aware", name: "Needs you", group: "Personality", detail: "The upper node gives a small nudge to catch your attention.", duration: 5.2, sound: "A gentle double tap" },
  { id: "success", name: "Complete", group: "Outcome", detail: "One buoyant lift settles into a check.", duration: 1.5, sound: "A resolved three-note chord" },
  { id: "error", name: "Interrupted", group: "Outcome", detail: "A brief recoil, then a held point of attention.", duration: 1, sound: "A low, soft knock" },
  { id: "paused", name: "Paused", group: "Outcome", detail: "The network holds until you are ready.", duration: 0, sound: "Silent" },
  { id: "offline", name: "Disconnected", group: "Outcome", detail: "Open connections show a source that needs a check.", duration: 0, sound: "Silent" },
] as const;
export type PresenceState = typeof assistantMotions[number]["id"];
export type MotionPolicy = "system" | "full" | "still";
export type MarkMaterial = "ink" | "satin";
export interface NetworkOptions { assistants?: number; leads?: number; network?: readonly RigNode[] | undefined; }
export interface RigNode { id: string; parent: string | null; x: number; y: number; z: number; r: number; opacity: number; members: number; lightX?: number; lightY?: number; shade?: number; }
export interface RigFrame { nodes: RigNode[]; pulse: number; halo: number; symbol: "check" | "alert" | "pause" | "none"; }
export const animatedPresenceStates = new Set<PresenceState>(assistantMotions.filter(m => m.duration > 0).map(m => m.id));
export const motionDefinition = (state: PresenceState) => assistantMotions.find(m => m.id === state)!;
export const finiteMotion = (state: PresenceState) => ["success", "error", "growing", "consolidating", "delegating"].includes(state);
const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
export function safeCount(value: number | undefined, fallback: number, max = 120) {
  return value === undefined || !Number.isFinite(value) ? fallback : clamp(Math.round(value), 0, max);
}
const ease = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

export function buildNetwork(options: NetworkOptions = {}): RigNode[] {
  if (options.network) return options.network.map(node => ({ ...node }));
  const count = safeCount(options.assistants, 5);
  const leads = Math.min(count, safeCount(options.leads, 0, 5));
  const nodes: RigNode[] = [{ id: "centre", parent: null, ...rigCentre, z: 0, opacity: 1, members: 0 }];
  if (!count) return nodes;
  const grouped = count > 18 && !leads;
  const roots = leads || (grouped ? 5 : count);
  for (let i = 0; i < roots; i++) {
    const ref = referenceNodes[i] ?? branchPosition(nodes, nodes[0]!, 8);
    const id = `assistant-${i}`;
    nodes.push({ id, parent: "centre", ...ref, z: 0, opacity: 1, members: grouped ? Math.floor(count / 5) + (i < count % 5 ? 1 : 0) : 1 });
    if (leads) {
      const children = Math.floor((count - leads) / leads) + (i < (count - leads) % leads ? 1 : 0);
      const visibleChildren = Math.min(children, 3);
      for (let j = 0; j < visibleChildren; j++) {
        const { x, y } = branchPosition(nodes, nodes.find(node => node.id === id)!, 5.2);
        nodes.push({ id: `${id}-child-${j}`, parent: id, x, y, z: 0, r: 5.2, opacity: 1, members: Math.floor(children / visibleChildren) + (j < children % visibleChildren ? 1 : 0) });
      }
    }
  }
  return nodes;
}

/** Find open space without moving any established node. */
function branchPosition(nodes: readonly RigNode[], parent: RigNode, r: number) {
  let best = { x: rigCentre.x, y: 35, r }, score = -Infinity;
  const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const edges = nodes.filter(node => node.parent && node.id !== parent.id && node.parent !== parent.id).map(node => [nodes.find(p => p.id === node.parent)!, node] as const);
  for (const distance of [34, 46, 60, 76, 94]) for (let i = 0; i < 48; i++) {
    const angle = -Math.PI / 2 + i * tau / 48;
    const x = parent.x + Math.cos(angle) * distance, y = parent.y + Math.sin(angle) * distance;
    if (x < r + 9 || x > rigWidth - r - 9 || y < r + 9 || y > 191 - r) continue;
    const clearance = Math.min(...nodes.map(node => Math.hypot(x - node.x, y - node.y) - node.r - r));
    const crossings = edges.filter(([a, b]) => cross(parent.x, parent.y, x, y, a.x, a.y) * cross(parent.x, parent.y, x, y, b.x, b.y) < 0 && cross(a.x, a.y, b.x, b.y, parent.x, parent.y) * cross(a.x, a.y, b.x, b.y, x, y) < 0).length;
    const candidate = Math.min(clearance, 24) - Math.abs(distance - (parent.parent ? 40 : 65)) * .15 - crossings * 60;
    if (candidate > score) { score = candidate; best = { x, y, r }; }
  }
  return best;
}

export const networkCount = (nodes: readonly RigNode[]) => nodes.reduce((sum, node) => sum + node.members, 0);

export function appendAssistant(network: readonly RigNode[], parentId = "centre"): RigNode[] {
  const nodes = network.map(node => ({ ...node }));
  if (networkCount(nodes) >= 120) return nodes;
  const parent = nodes.find(node => node.id === parentId) ?? nodes[0]!;
  // Keep dense scenes readable. Counts preserve the source total.
  if (nodes.length >= 21) {
    const group = parent.parent ? parent : nodes.slice(1).reduce((a, b) => a.members < b.members ? a : b);
    group.members++; return nodes;
  }
  let index = 0; while (nodes.some(node => node.id === `assistant-${index}`)) index++;
  const r = parent.parent ? 6 : 8;
  nodes.push({ id: `assistant-${index}`, parent: parent.id, ...branchPosition(nodes, parent, r), z: 0, opacity: 1, members: 1 });
  return nodes;
}

export function formSubteam(network: readonly RigNode[], parent = "centre") {
  const next = appendAssistant(network, parent);
  const lead = next.length > network.length ? next.at(-1)!.id : parent;
  return appendAssistant(appendAssistant(next, lead), lead);
}

export function consolidateNetwork(network: readonly RigNode[]): RigNode[] {
  const members = network.filter(node => node.parent);
  if (members.length < 2) return network.map(node => ({ ...node }));
  const roots = members.filter(node => node.parent === "centre");
  const groups = roots.slice(0, Math.max(1, Math.min(5, Math.ceil(roots.length / 2)))).map(node => ({ ...node, members: 0 }));
  for (const node of members) {
    const nearest = groups.reduce((a, b) => Math.hypot(a.x - node.x, a.y - node.y) < Math.hypot(b.x - node.x, b.y - node.y) ? a : b);
    nearest.members += node.members;
  }
  return [{ ...network[0]! }, ...groups];
}

/** Pure, seekable motion. Shared by the live SVG rig and baked SVG exports. */
export function sampleRig(state: PresenceState, seconds: number, options: NetworkOptions = {}): RigFrame {
  const definition = motionDefinition(state);
  const duration = definition.duration || 1;
  const t = Math.max(0, seconds);
  const phase = finiteMotion(state) ? Math.min(t / duration, 1) : (t % duration) / duration;
  const a = phase * tau;
  const scene = buildNetwork(options);
  const beat = (start: number, attack: number, hold: number, release: number) => ease((phase - start) / attack) * (1 - ease((phase - start - attack - hold) / release));
  let turn = 0, tilt = 0, scale = 1, lift = 0, lean = 0;
  if (state === "resting") { scale = 1 + (beat(.03, .3, .07, .48) - .12) * .055; tilt = Math.sin(a) * .055; }
  if (state === "drifting") { turn = Math.sin(a) * .78; tilt = Math.sin(a) * .22; }
  if (state === "curious") { const look = beat(.1, .17, .2, .26); turn = look * .45; lean = look * 8; lift = -look * 3; tilt = beat(.37, .06, .08, .16) * -.13; }
  if (state === "thinking") { turn = Math.sin(a) * .65; tilt = Math.sin(a * 2) * .32; }
  if (state === "listening") { const attend = beat(.03, .22, .3, .36); scale = 1 - attend * .075; tilt = attend * .16; lean = attend * -3; }
  if (state === "responding") scale = 1 + Math.sin(a) * .075;
  if (state === "playful") {
    const flight = clamp((phase - .22) / .26, 0, 1), jump = 4 * flight * (1 - flight);
    lift = -17 * jump + beat(.12, .07, 0, .04) * 3;
    scale = 1 - beat(.12, .07, 0, .04) * .09 - jump * .04 - beat(.48, .025, 0, .09) * .075 + beat(.57, .05, 0, .11) * .025;
    lean = 3 * jump; tilt = jump * -.1;
  }
  if (state === "jitter") lean = Math.sin(a * 23) * 2.8 * Math.exp(-(((phase - .3) * 7) ** 2));
  if (state === "success") { lift = -7 * Math.sin(phase * Math.PI); scale = 1 + Math.sin(phase * Math.PI) * .02; }
  if (state === "error") lean = Math.sin(phase * Math.PI * 6) * 4 * (1 - phase) ** 2;

  const nodes = scene.map((node, index) => {
    let dx = (node.x - rigCentre.x) * scale, dy = (node.y - rigCentre.y) * scale;
    let size = node.r, opacity = node.opacity;
    if (index) {
      if (state === "thinking") { dx += (Math.sin(a + index * 1.7) - Math.sin(index * 1.7)) * 2; dy += (Math.cos(a + index * 1.3) - Math.cos(index * 1.3)) * 2; }
      if (state === "connecting") { const reach = Math.sin(a - index * .75); dx *= 1 + reach * .10; dy *= 1 + reach * .10; }
      if (state === "aware" && index === Math.min(2, scene.length - 1)) { dy -= (beat(.12, .06, .05, .08) + beat(.34, .045, .025, .09) * .6) * 8; }
      if (state === "jitter") { dx += Math.sin(a * 17 + index) * Math.exp(-(((phase - .34) * 8) ** 2)) * 3; }
      if (state === "consolidating" && node.members > 1) size *= 1 + beat(.3, .08, 0, .25) * .07;
    }
    // Rigid rotation, followed by perspective. Rings and stems share this pose.
    const rotatedX = dx * Math.cos(turn), rotatedZ = dx * Math.sin(turn);
    const rotatedY = dy * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
    const depth = (rotatedZ * Math.cos(tilt) + dy * Math.sin(tilt)) || 0;
    const perspective = 420 / (420 - depth);
    const light = { x: -55 - rotatedX - lean, y: -100 - rotatedY - lift, z: 125 - depth };
    const length = Math.hypot(light.x, light.y, light.z);
    return { ...node, x: rigCentre.x + rotatedX * perspective + lean, y: rigCentre.y + rotatedY * perspective + lift, z: depth, r: size * perspective, opacity: opacity * (state === "offline" ? .55 : 1), lightX: .5 + light.x / length * .43, lightY: .5 + light.y / length * .43, shade: .3 + (1 - light.z / length) * .25 };
  });
  // Follow the pose with the camera when needed; the shared source artboard never clips a ring.
  const left = Math.min(...nodes.map(n => n.x - n.r - 1.4)), right = Math.max(...nodes.map(n => n.x + n.r + 1.4));
  const top = Math.min(...nodes.map(n => n.y - n.r - 1.4)), bottom = Math.max(...nodes.map(n => n.y + n.r + 1.4));
  const zoom = Math.min(1, (rigWidth - 2) / (right - left), 198 / (bottom - top));
  const offsetX = Math.max(0, 1 - left * zoom) - Math.max(0, right * zoom - rigWidth + 1);
  const offsetY = Math.max(0, 1 - top * zoom) - Math.max(0, bottom * zoom - 199);
  if (zoom < 1 || offsetX || offsetY) for (const node of nodes) { node.x = node.x * zoom + offsetX; node.y = node.y * zoom + offsetY; node.r *= zoom; }
  return { nodes, pulse: phase, halo: ["listening", "responding", "success"].includes(state) ? phase : -1,
    symbol: state === "success" ? "check" : state === "error" ? "alert" : state === "paused" ? "pause" : "none" };
}

export function edgeSegment(parent: RigNode, child: RigNode) {
  const dx = child.x - parent.x, dy = child.y - parent.y, length = Math.hypot(dx, dy) || 1;
  return { x1: parent.x + dx / length * parent.r, y1: parent.y + dy / length * parent.r, x2: child.x - dx / length * child.r, y2: child.y - dy / length * child.r, visible: length > parent.r + child.r };
}
export function edgePath(parent: RigNode, child: RigNode) {
  const edge = edgeSegment(parent, child);
  return edge.visible ? `M${edge.x1.toFixed(3)} ${edge.y1.toFixed(3)}L${edge.x2.toFixed(3)} ${edge.y2.toFixed(3)}` : "M0 0";
}

/** Smooth topology changes with stable identities; newcomers sprout at their parent. */
export function blendFrames(previous: RigFrame, next: RigFrame, progress: number): RigFrame {
  if (progress >= 1) return next;
  const p = ease(progress);
  const old = new Map(previous.nodes.map(n => [n.id, n]));
  const target = new Map(next.nodes.map(n => [n.id, n]));
  const nodes: RigNode[] = [];
  for (const n of next.nodes) {
    if (!old.has(n.id) && n.parent) {
      const parent = nodes.find(node => node.id === n.parent) ?? next.nodes[0]!;
      const destination = target.get(n.parent)!;
      const arrival = old.has(n.parent) ? p : ease((progress - .35) / .65);
      const dx = n.x - destination.x, dy = n.y - destination.y, length = Math.hypot(dx, dy) || 1;
      const reach = parent.r + (length - parent.r) * arrival;
      nodes.push({ ...n, x: parent.x + dx / length * reach, y: parent.y + dy / length * reach, z: parent.z + (n.z - destination.z) * arrival, r: n.r * arrival, opacity: n.opacity * Math.min(1, arrival * 2) });
      continue;
    }
    const from = old.get(n.id) ?? { ...(old.get(n.parent ?? "") ?? next.nodes[0]!), r: 0, opacity: 0 };
    nodes.push({ ...n, x: from.x + (n.x - from.x) * p, y: from.y + (n.y - from.y) * p, z: from.z + (n.z - from.z) * p, r: from.r + (n.r - from.r) * p, opacity: from.opacity + (n.opacity - from.opacity) * p, lightX: (from.lightX ?? .3) + ((n.lightX ?? .3) - (from.lightX ?? .3)) * p, lightY: (from.lightY ?? .2) + ((n.lightY ?? .2) - (from.lightY ?? .2)) * p });
  }
  for (const n of previous.nodes) if (!target.has(n.id)) {
    const parent = next.nodes.filter(node => node.parent).reduce<RigNode>((closest, node) => Math.hypot(node.x - n.x, node.y - n.y) < Math.hypot(closest.x - n.x, closest.y - n.y) ? node : closest, target.get(n.parent ?? "") ?? next.nodes[0]!);
    nodes.push({ ...n, x: n.x + (parent.x - n.x) * p, y: n.y + (parent.y - n.y) * p, r: n.r * (1 - p), opacity: n.opacity * (1 - p) });
  }
  return { ...next, nodes };
}
