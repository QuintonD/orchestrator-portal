# Assistant motion and sound

Open `index.html` for the offline preview. Select **Full motion** if your device
has reduced motion enabled. Each **Play with sound** button auditions one cycle;
**Mute sound** stops all voices immediately. The richer interactive studio is
at `/assistant-motion` in the application (`npm run dev`).

## Artwork

`original.png` is a byte-for-byte copy of the supplied transparent 1371 × 1148
PNG. `original.svg` embeds those exact pixels on a 1371 × 1148 SVG artboard;
it is a raster-backed SVG, not a vector trace. `still.svg` uses the same image
on the normalized animation artboard. None has a painted background.

The other SVGs use vector geometry measured from that transparent source, with
shading. They share its aspect ratio and centre. The live studio offers Ink
and Satin surfaces, and compares the original at the same display size. Satin
uses a separate moving light response for each node. Connections are masked at
the rings using the same animated geometry, including between exported samples.
Its vector rig is an approximation of the source's organic line edges; use
`original.png` or `original.svg` wherever exact source pixels are required.

## Studies

| Family | SVG files |
| --- | --- |
| Idle | `still`, `resting` (breathing), `drifting` (3D), `curious` |
| Active | `listening`, `thinking`, `connecting`, `responding` |
| Network | `growing`, `consolidating`, `delegating` |
| Personality | `playful` (jump), `jitter`, `aware` |
| Outcome | `success`, `error`, `paused`, `offline` |

Network actions, success and error play once. Other moving studies loop. Paused, disconnected
and the original are still. The manifest records each duration and sound motif.

These SVGs contain sampled geometry animation, without external resources or
scripts. Sound is in the HTML preview and application, not inside the SVG image
files. SVG animation works in supporting browsers; raster imports and some design
tools show only a frame. Embedded reduced-motion CSS switches to a still fallback.
Set `data-motion-policy="full"` on an inline SVG to explicitly preview movement,
or `still` to show the fallback. Call the SVG's `pauseAnimations()` and
`unpauseAnimations()` methods to pause/resume its clock.

Inline vector SVGs inherit `color`. SVGs loaded as `<img>` do not inherit the
embedding page's colour; set the root colour and `data-theme="dark"` for a
separate dark variant. The
offline preview handles dark surfaces and inverts the original monochrome PNG.

## Live application integration

The React rig supports assistant counts from 0–120, up to five layout leads,
and explicit graphs through the `network` prop. Every gesture uses the current
graph. `appendAssistant(network, parentId)` adds a node without moving existing
branches. `formSubteam` adds a lead and two adjacent assistants;
`consolidateNetwork` gathers existing members and preserves their total.
Growth starts at the chosen parent's rim. New children follow their lead's
arrival. Replay repeats the transition without adding more assistants.

Count-based layouts group above 18 direct assistants. Explicit additions keep
at most 21 visible nodes and increment a group when the scene is full. The
exported network studies are baked examples starting from the original five
branches. Use `PresenceField` for a live topology and `useAssistantSound` for
synchronized audio. `visual-review.html` shows six frozen poses per gesture.

Regenerate the SVGs, PNG copies (including the web app's public asset), manifest,
offline preview and visual review with
`npm run assets:assistant-motion`. Edit `apps/web/src/assistant-rig.ts`,
`assistant-rig-renderer.ts`, `assistant-mark.tsx`, `assistant-sound.ts` and
`scripts/export-assistant-motion.mts`; do not hand-edit generated exports.
This README is maintained separately.
