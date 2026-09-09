import { edgePath, edgeSegment, type RigFrame, type PresenceState } from "./assistant-rig.js";

const ns = "http://www.w3.org/2000/svg";
const number = (value: number) => String(Number(value.toFixed(3)));
const attr = (el: Element, name: string, value: number | string) => el.setAttribute(name, typeof value === "number" ? number(value) : value);

/** Reuses SVG elements. No React renders, filters or allocations of audio per frame. */
export function createRigPainter(svg: SVGSVGElement, gradientId: string) {
  const links = svg.querySelector<SVGGElement>(".rig-links")!;
  const nodes = svg.querySelector<SVGGElement>(".rig-nodes")!;
  const halo = svg.querySelector<SVGCircleElement>(".rig-halo")!;
  const gradients = svg.querySelector(".rig-gradients")!;
  const cutouts = svg.querySelector(".rig-cutouts")!;
  const entries = new Map<string, { group: SVGGElement; ring: SVGCircleElement; shade: SVGRadialGradientElement; shadow: SVGStopElement; cutout: SVGCircleElement; label: SVGTextElement; symbol: SVGPathElement; edge: SVGPathElement; signal: SVGCircleElement }>();
  let previousOrder = "";
  return (frame: RigFrame, state: PresenceState) => {
    const ids = new Set(frame.nodes.map(n => n.id));
    for (const [id, entry] of entries) if (!ids.has(id)) { entry.group.remove(); entry.edge.remove(); entry.signal.remove(); entry.shade.remove(); entry.cutout.remove(); entries.delete(id); }
    const sorted = [...frame.nodes].sort((a, b) => a.z - b.z);
    const order = sorted.map(node => node.id).join("|");
    for (const node of sorted) {
      let entry = entries.get(node.id);
      if (!entry) {
        const group = document.createElementNS(ns, "g"); group.classList.add("assistant-mark__node"); group.dataset.node = node.id;
        const ring = document.createElementNS(ns, "circle"); ring.classList.add("rig-ring"); ring.setAttribute("fill", `url(#${gradientId}-${node.id})`);
        const shade = document.createElementNS(ns, "radialGradient"); shade.id = `${gradientId}-${node.id}`; attr(shade, "r", .85);
        let shadow!: SVGStopElement;
        for (const [offset, opacity] of [[0, 0], [.38, .025], [.73, .14], [1, .4]]) {
          shadow = document.createElementNS(ns, "stop"); attr(shadow, "offset", offset!); attr(shadow, "stop-color", "currentColor"); attr(shadow, "stop-opacity", opacity!); shade.append(shadow);
        }
        gradients.append(shade);
        const cutout = document.createElementNS(ns, "circle"); attr(cutout, "fill", "black"); attr(cutout, "stroke", "none"); cutouts.append(cutout);
        const label = document.createElementNS(ns, "text"); label.classList.add("rig-count"); attr(label, "text-anchor", "middle"); attr(label, "dominant-baseline", "central");
        const symbol = document.createElementNS(ns, "path"); symbol.classList.add("rig-symbol");
        group.append(ring, label, symbol); nodes.append(group);
        const edge = document.createElementNS(ns, "path"); edge.classList.add("assistant-mark__stem"); links.append(edge);
        const signal = document.createElementNS(ns, "circle"); signal.classList.add("rig-signal"); attr(signal, "r", 1.7); links.append(signal);
        entry = { group, ring, shade, shadow, cutout, label, symbol, edge, signal }; entries.set(node.id, entry);
      }
      attr(entry.group, "transform", `translate(${number(node.x)} ${number(node.y)})`);
      attr(entry.group, "opacity", node.opacity * Math.min(1, 1 + node.z / 200));
      attr(entry.group, "data-x", node.x); attr(entry.group, "data-y", node.y);
      attr(entry.group, "data-depth", node.z); attr(entry.group, "data-members", node.members);
      attr(entry.group, "data-parent", node.parent ?? "");
      attr(entry.ring, "r", Math.max(0, node.r));
      attr(entry.ring, "stroke-width", 2.6 * Math.min(1, Math.max(.55, node.r / 8)));
      attr(entry.shade, "cx", node.lightX ?? .3); attr(entry.shade, "cy", node.lightY ?? .2);
      entry.shade.style.setProperty("--rig-shade", number(node.shade ?? .4));
      attr(entry.shadow, "stop-opacity", node.shade ?? .4);
      attr(entry.cutout, "cx", node.x); attr(entry.cutout, "cy", node.y); attr(entry.cutout, "r", Math.max(0, node.r - .25));
      entry.label.textContent = node.members > 1 ? String(node.members) : "";
      attr(entry.label, "font-size", Math.min(8, node.r));
      const symbol = node.parent ? "none" : frame.symbol;
      attr(entry.symbol, "d", symbol === "check" ? "m-6 0 4 4 8-9" : symbol === "alert" ? "M0-6v7m0 4v.3" : symbol === "pause" ? "M-3-5V5M3-5V5" : "M0 0");
      attr(entry.symbol, "opacity", symbol === "none" ? 0 : 1);
      const parent = frame.nodes.find(n => n.id === node.parent);
      if (parent) {
        const segment = edgeSegment(parent, node);
        attr(entry.edge, "d", edgePath(parent, node));
        attr(entry.edge, "data-child", node.id);
        attr(entry.edge, "opacity", segment.visible ? Math.min(parent.opacity, node.opacity) * Math.min(1, 1 + node.z / 250) : 0);
        attr(entry.edge, "stroke-dasharray", state === "offline" ? "2 4" : "none");
        const p = state === "thinking" || state === "listening" ? 1 - frame.pulse : frame.pulse;
        attr(entry.signal, "cx", segment.x1 + (segment.x2 - segment.x1) * p); attr(entry.signal, "cy", segment.y1 + (segment.y2 - segment.y1) * p);
        attr(entry.signal, "opacity", segment.visible && ["thinking", "connecting", "responding", "listening"].includes(state) ? node.opacity * Math.sin(p * Math.PI) : 0);
      } else { attr(entry.edge, "opacity", 0); attr(entry.signal, "opacity", 0); }
      // Sorting the small node layer makes depth crossings visually consistent.
      if (order !== previousOrder) nodes.append(entry.group);
    }
    const centre = frame.nodes[0]!;
    attr(halo, "cx", centre.x); attr(halo, "cy", centre.y);
    attr(halo, "r", centre.r + Math.max(0, frame.halo) * 35);
    attr(halo, "opacity", frame.halo < 0 ? 0 : (1 - frame.halo) * .22);
    previousOrder = order;
  };
}
