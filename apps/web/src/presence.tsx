import { useEffect, useRef } from "react";
import { cx } from "./lib.js";
import { useIconAppearance } from "./icon-appearance.js";
import { iconRow } from "./icon-themes.js";
import { AssistantSprite } from "./sprite.js";

// Stable identities remain recognizable when the list is sorted or filtered.
export function AssistantSigil({ name, state = "ready", icon }: { name: string; state?: string; icon?: number | undefined }) {
  const { theme } = useIconAppearance();
  return <span className="assistant-sigil" aria-hidden="true"><AssistantSprite theme={theme} row={icon ?? iconRow(name)} active={state === "running"} /></span>;
}

export type PresenceState = "resting" | "aware" | "thinking" | "connecting";

interface Node { angle: number; radius: number; size: number; phase: number; speed: number; spin: number }

// A fixed seed keeps the field identical between renders so it reads as one system, not noise.
function seededNodes(count: number, seed = 7): Node[] {
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  return Array.from({ length: count }, (_, index) => ({
    angle: random() * Math.PI * 2,
    radius: index < 4 ? 0.12 + random() * 0.14 : Math.sqrt(random()) * 0.92 + 0.06,
    size: index % 5 === 0 ? 2.1 : 1 + random() * 0.9,
    phase: random() * Math.PI * 2,
    speed: 0.35 + random() * 0.5,
    spin: random() < 0.5 ? -1 : 1,
  }));
}

const nodes = seededNodes(34);

/**
 * The AI presence: a node field that only moves while the system is working.
 * Resting draws once; thinking tightens the field and reveals hairline links;
 * connecting keeps the links while the field settles. Reduced motion stays static.
 */
export function PresenceField({ active = false, state }: { active?: boolean; state?: PresenceState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mode: PresenceState = state ?? (active ? "thinking" : "resting");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animated = !reduced && mode !== "resting";
    const started = performance.now();
    let frame = 0;

    function draw(now: number) {
      if (!canvas || !context) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const ink = getComputedStyle(canvas).color;
      const t = (now - started) / 1000;
      const cx0 = width / 2, cy0 = height / 2;
      const reach = Math.min(width, height) / 2 - 6;
      const tighten = mode === "thinking" ? 0.74 : mode === "connecting" ? 0.84 : mode === "aware" ? 0.94 : 1;
      const points = nodes.map((node) => {
        const drift = animated ? Math.sin(t * node.speed + node.phase) * (mode === "aware" ? 1.5 : 3) : 0;
        const angle = node.angle + (animated && mode === "thinking" ? t * 0.06 * node.spin : 0);
        const radius = node.radius * reach * tighten + drift;
        return { x: cx0 + Math.cos(angle) * radius, y: cy0 + Math.sin(angle) * radius * 0.88, size: node.size };
      });

      context.strokeStyle = ink;
      context.fillStyle = ink;
      context.lineWidth = 0.6;
      if (mode === "thinking" || mode === "connecting") {
        // Each node links to its two nearest neighbours: relationships, not a wallpaper mesh.
        context.globalAlpha = mode === "connecting" ? 0.28 : 0.16 + (animated ? (Math.sin(t * 1.2) + 1) * 0.05 : 0.06);
        context.beginPath();
        points.forEach((point, index) => {
          const nearest = points.map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(other.x - point.x, other.y - point.y) }))
            .filter((entry) => entry.otherIndex > index).sort((a, b) => a.distance - b.distance).slice(0, 2);
          for (const { otherIndex } of nearest) { context.moveTo(point.x, point.y); context.lineTo(points[otherIndex]!.x, points[otherIndex]!.y); }
        });
        context.stroke();
      }
      context.globalAlpha = mode === "resting" ? 0.42 : 0.78;
      for (const point of points) { context.beginPath(); context.arc(point.x, point.y, point.size, 0, Math.PI * 2); context.fill(); }

      // Focal point: a ring that only breathes while thinking.
      context.globalAlpha = 1;
      context.lineWidth = 1;
      context.beginPath(); context.arc(cx0, cy0, 3, 0, Math.PI * 2); context.fill();
      const halo = mode === "thinking" && animated ? 9 + (Math.sin(t * 1.6) + 1) * 4 : mode === "resting" ? 8 : 10;
      context.globalAlpha = mode === "resting" ? 0.5 : 0.9;
      context.beginPath(); context.arc(cx0, cy0, halo, 0, Math.PI * 2); context.stroke();
      if (animated) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(() => { if (!animated) draw(performance.now()); });
    observer.observe(canvas);
    const themeObserver = new MutationObserver(() => { if (!animated) draw(performance.now()); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); themeObserver.disconnect(); };
  }, [mode]);

  return <div className={cx("presence-field", active && "is-working")} data-state={mode} aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
