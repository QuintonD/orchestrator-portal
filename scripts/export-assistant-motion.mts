import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { appendAssistant, assistantMotions, blendFrames, buildNetwork, consolidateNetwork, finiteMotion, formSubteam, rigWidth, sampleRig, type RigFrame, type PresenceState } from "../apps/web/src/assistant-rig.js";

const destination = new URL("../assets/assistant-motion/", import.meta.url);
await mkdir(destination, { recursive: true });
const source = new URL("../assets/Main_agent_assets/file_000000007eec81f5b3371bdf2befa371.png", import.meta.url);
const original = `data:image/png;base64,${(await readFile(source)).toString("base64")}`;
await copyFile(source, new URL("original.png", destination));
await mkdir(new URL("../apps/web/public/", import.meta.url), { recursive: true });
await copyFile(source, new URL("../apps/web/public/assistant-original.png", import.meta.url));
const css = `.assistant-export{width:100%;height:100%;color:inherit}.motion-fallback{display:none}.assistant-export[data-motion-policy="still"] .motion-scene{display:none}.assistant-export[data-motion-policy="still"] .motion-fallback{display:inline}:is(.dark .assistant-export,.assistant-export[data-theme="dark"]) stop:nth-of-type(1){stop-opacity:.4}:is(.dark .assistant-export,.assistant-export[data-theme="dark"]) stop:nth-of-type(2){stop-opacity:.18}:is(.dark .assistant-export,.assistant-export[data-theme="dark"]) stop:nth-of-type(3){stop-opacity:.055}:is(.dark .assistant-export,.assistant-export[data-theme="dark"]) stop:nth-of-type(4){stop-opacity:0}@media(prefers-reduced-motion:reduce){.assistant-export:not([data-motion-policy="full"]) .motion-scene{display:none}.assistant-export:not([data-motion-policy="full"]) .motion-fallback{display:inline}}`;
const n = (value: number) => String(Number(value.toFixed(3)));
const studies: string[] = [];
const review: string[] = [];
for (const motion of assistantMotions) {
  const state = motion.id as PresenceState;
  const originalNetwork = buildNetwork();
  const network = state === "growing" ? appendAssistant(originalNetwork) : state === "delegating" ? formSubteam(originalNetwork) : state === "consolidating" ? consolidateNetwork(originalNetwork) : originalNetwork;
  const from = sampleRig("still", 0);
  const sample = (time: number) => {
    const target = sampleRig(state, time, { network });
    return ["growing", "delegating", "consolidating"].includes(state) ? blendFrames(from, target, time / 1.8) : target;
  };
  const frames = Array.from({ length: motion.duration ? 121 : 1 }, (_, i) => sample(motion.duration * i / 120));
  const base = frames[0]!;
  const animation = (attribute: string, values: string[]) => motion.duration ? `<${attribute === "transform" ? 'animateTransform type="translate"' : "animate"} attributeName="${attribute}" values="${values.map(value => attribute === "transform" ? value.replace(/translate\(|\)/g, "") : value).join(";")}" dur="${motion.duration}s" repeatCount="${finiteMotion(state) ? 1 : "indefinite"}" fill="freeze" />` : "";
  const draw = (animated: boolean, heldTime?: number) => {
    const still = sample(heldTime ?? (finiteMotion(state) ? motion.duration : 0));
    const start = animated ? base : still;
    const list = animated ? frames : [still];
    const anim = (attribute: string, values: string[]) => animated ? animation(attribute, values) : "";
    const ids = [...new Map(list.flatMap(frame => frame.nodes.map(node => [node.id, node] as const))).values()];
    const resolve = (frame: RigFrame, id: string) => frame.nodes.find(node => node.id === id) ?? { ...ids.find(node => node.id === id)!, r: 0, opacity: 0 };
    const key = `${state}-${animated ? "moving" : `held-${heldTime ?? "end"}`}`;
    let gradients = "", cutouts = "", edges = "", nodes = "";
    for (const identity of ids) {
      const values = list.map(frame => resolve(frame, identity.id)), node = values[0]!;
      const geometry = ["x", "y", "r", "opacity"] as const;
      const attributes = geometry.map(a => `${a === "x" ? "cx" : a === "y" ? "cy" : a}="${n(node[a])}"`).join(" ");
      const animations = geometry.map(a => anim(a === "x" ? "cx" : a === "y" ? "cy" : a, values.map(v => n(v[a])))).join("");
      const shade = `${key}-${node.id}`;
      gradients += `<radialGradient id="${shade}" cx="${n(node.lightX ?? .3)}" cy="${n(node.lightY ?? .2)}" r=".85">${anim("cx", values.map(v => n(v.lightX ?? .3)))}${anim("cy", values.map(v => n(v.lightY ?? .2)))}<stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset=".38" stop-color="currentColor" stop-opacity=".025"/><stop offset=".73" stop-color="currentColor" stop-opacity=".14"/><stop offset="1" stop-color="currentColor" stop-opacity="${n(node.shade ?? .4)}">${anim("stop-opacity", values.map(v => n(v.shade ?? .4)))}</stop></radialGradient>`;
      // The mask and rings use identical interpolated geometry. Edges cannot slide past them between baked samples.
      cutouts += `<circle cx="${n(node.x)}" cy="${n(node.y)}" r="${n(node.r)}" fill="black" stroke="none">${(["x", "y", "r"] as const).map(a => anim(a === "x" ? "cx" : a === "y" ? "cy" : a, values.map(v => n(v[a])))).join("")}</circle>`;
      if (node.parent) {
        const paths = list.map(frame => { const child = resolve(frame, node.id), parent = resolve(frame, child.parent!); return `M${n(parent.x)} ${n(parent.y)}L${n(child.x)} ${n(child.y)}`; });
        edges += `<path d="${paths[0]}" opacity="${n(node.opacity)}" ${state === "offline" ? 'stroke-dasharray="2 4"' : ""}>${anim("d", paths)}${anim("opacity", values.map(v => n(v.opacity)))}</path>`;
      }
      nodes += `<circle class="rig-ring" ${attributes} fill="url(#${shade})">${animations}</circle>`;
      if (identity.members > 1) nodes += `<text x="${n(node.x)}" y="${n(node.y)}" text-anchor="middle" dominant-baseline="central" font-size="7" font-family="monospace" fill="currentColor" stroke="none" opacity="${n(node.opacity)}">${identity.members}${anim("x", values.map(v => n(v.x)))}${anim("y", values.map(v => n(v.y)))}${anim("opacity", values.map(v => n(v.opacity)))}</text>`;
      if (!node.parent && start.symbol !== "none") nodes += `<path transform="translate(${n(node.x)} ${n(node.y)})" d="${start.symbol === "check" ? "m-6 0 4 4 8-9" : start.symbol === "pause" ? "M-3-5V5M3-5V5" : "M0-6v7m0 4v.3"}" stroke-width="1.8">${anim("transform", values.map(v => `translate(${n(v.x)} ${n(v.y)})`))}</path>`;
    }
    return `<defs>${gradients}<mask id="${key}-mask" maskUnits="userSpaceOnUse" x="-100" y="-100" width="440" height="400"><rect x="-100" y="-100" width="440" height="400" fill="white" stroke="none"/>${cutouts}</mask></defs><g mask="url(#${key}-mask)" stroke-linecap="butt">${edges}</g>${nodes}`;
  };
  const png = `<image width="${rigWidth}" height="200" href="${original}" />`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="assistant-export" data-state="${state}" viewBox="0 0 ${rigWidth} 200" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" role="img"><title>${motion.name}</title><desc>${motion.detail}</desc><style>${css}</style>${state === "still" ? png : `<g class="motion-scene">${draw(true)}</g><g class="motion-fallback">${draw(false)}</g>`}</svg>`;
  await writeFile(new URL(`${state}.svg`, destination), `${svg}\n`);
  studies.push(`<article><div class="art">${svg}</div><h2>${motion.name}</h2><p>${motion.detail}</p><small>${motion.duration ? `${motion.duration}s` : "Still"} · ${motion.group}</small>${motion.duration ? `<button data-audition="${state}">Play with sound</button>` : ""}</article>`);
  if (motion.duration) {
    const phases = state === "playful" ? [0, .19, .29, .35, .5, .65] : state === "aware" ? [0, .2, .3, .39, .5, .8] : finiteMotion(state) ? [0, .1, .2, .3, .4, 1] : [0, .15, .3, .45, .65, .85];
    review.push(`<section><h2>${motion.name}</h2><p>${motion.detail}</p><div class="frames">${phases.map(phase => `<figure><svg viewBox="0 0 ${rigWidth} 200" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${draw(false, motion.duration * phase)}</svg><figcaption>${(motion.duration * phase).toFixed(2)}s</figcaption></figure>`).join("")}</div></section>`);
  }
}
await writeFile(new URL("visual-review.html", destination), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistant motion · visual review</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f7f6f2;color:#111;font:13px system-ui}h1{font-weight:450}h2{font-size:16px;margin:0}p{font-size:12px;color:#666;margin:6px 0}.frames{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}section{padding:18px 0;border-top:1px solid #ccc}figure{margin:0}svg{display:block;width:100%;height:150px}figcaption{font:10px monospace;text-align:center;color:#666}</style><h1>Assistant motion · visual review</h1><p>Frozen poses from the same geometry used in the application. Read left to right.</p>${review.join("")}</html>`);
await writeFile(new URL("original.svg", destination), `<svg xmlns="http://www.w3.org/2000/svg" width="1371" height="1148" viewBox="0 0 1371 1148" role="img"><title>Original assistant artwork</title><desc>The exact supplied transparent PNG embedded in an SVG container.</desc><image width="1371" height="1148" href="${original}" /></svg>\n`);
const script = await build({ stdin: { contents: `
import { AssistantSound } from './apps/web/src/assistant-sound.ts';
import { motionDefinition } from './apps/web/src/assistant-rig.ts';
const sound = new AssistantSound(); let handle = 0, release = 0;
const stop = () => { cancelAnimationFrame(handle); clearTimeout(release); sound.mute(); document.querySelector('#mute').textContent = 'Sound off'; };
document.querySelector('#mute').onclick = stop;
document.querySelector('#motion').onchange = e => document.querySelectorAll('svg').forEach(svg => svg.dataset.motionPolicy = e.target.value);
document.querySelector('#pause').onchange = e => { document.querySelectorAll('svg').forEach(svg => e.target.checked ? svg.pauseAnimations() : svg.unpauseAnimations()); if(e.target.checked) stop(); };
document.querySelector('#dark').onchange = e => document.body.classList.toggle('dark', e.target.checked);
document.querySelectorAll('[data-audition]').forEach(button => button.onclick = async () => {
 stop(); document.querySelector('#pause').checked = false;
 const svg = button.closest('article').querySelector('svg'); svg.dataset.motionPolicy='full'; svg.unpauseAnimations(); svg.setCurrentTime(0);
 const state=button.dataset.audition; try { await sound.enable(.25); sound.activity(true); document.querySelector('#mute').textContent='Mute sound';
 const start=performance.now(); const tick=now=>{ const time=(now-start)/1000; sound.tick(state,time); if(time < motionDefinition(state).duration)handle=requestAnimationFrame(tick); else release=setTimeout(stop,1800); }; handle=requestAnimationFrame(tick);
 } catch { document.querySelector('#mute').textContent='Audio unavailable'; }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
`, resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" }, bundle: true, write: false, minify: true, format: "iife", platform: "browser" });
await writeFile(new URL("index.html", destination), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistant motion and sound</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.6 system-ui,sans-serif;background:#f7f6f2;color:#111}main{padding:36px}h1{font-size:38px;letter-spacing:-.04em;font-weight:450;margin:12px 0}header p{opacity:.65}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));border:1px solid #8885;margin-top:28px}article{padding:22px;border:1px solid #8883}h2{font-size:16px;font-weight:500}article p{font-size:12px;min-height:58px;opacity:.7}small{font:10px monospace;opacity:.65}.art{height:210px}nav{display:flex;gap:18px;flex-wrap:wrap;align-items:center}button,select{background:transparent;color:inherit;border:1px solid #8886;border-radius:5px;padding:8px;font:inherit}article button{display:block;margin-top:14px;font-size:12px}body.dark{background:#111;color:#f4f3ef}.dark svg image{filter:invert(1)}@media(max-width:600px){main{padding:20px}}
</style></head><body><main><header><small>ORCHESTRATOR / MOTION & SOUND</small><h1>A presence of its own.</h1><p>18 studies. Actual node movement, dynamic teams, and locally synthesized sound.</p></header><nav><label>Motion <select id="motion"><option value="system">Device setting</option><option value="full">Full motion</option><option value="still">Still</option></select></label><label><input id="dark" type="checkbox"> Dark surface</label><label><input id="pause" type="checkbox"> Pause all</label><button id="mute">Sound off</button></nav><p>If your device reduces motion, choose Full motion to see these studies. Sound starts only when you select Play with sound.</p><section>${studies.join("")}</section></main><script>${script.outputFiles[0]!.text}</script></body></html>\n`);
await writeFile(new URL("manifest.json", destination), `${JSON.stringify({ source: "../Main_agent_assets/file_000000007eec81f5b3371bdf2befa371.png", sourceSize: [1371, 1148], generator: "npm run assets:assistant-motion", viewBox: `0 0 ${rigWidth} 200`, format: "Transparent SVG with sampled geometry animation; original PNG and raster-backed original.svg preserve the supplied pixels", states: assistantMotions }, null, 2)}\n`);
console.log(`Exported ${assistantMotions.length} studies, the original PNG, and the offline sound preview.`);
