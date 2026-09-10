# Visual system

The web app follows the Invisible OS direction: monochrome first, hairlines
instead of cards, editorial type, and motion only while the system is working.

Implementation lives in `apps/web/src/app.css` and the shell/presence components.
Eight earlier stylesheets were folded into that file.

## Surfaces

- Warm off-white (`#f7f6f2`) and near-black (`#111111`) in light; the inverse in dark.
- Inter Variable is self-hosted via `@fontsource-variable/inter`. Tabular data uses the system monospace stack.
- Layout uses type, spacing, and 1px rules. Section blocks keep a `card` class for structure, without boxed chrome.
- Status is a short label plus a small monochrome marker (filled, dashed, or thicker for danger). Colour is not the only signal.
- Charts are hairline ink on a faint fill. The usage spark marks only the latest point.

## Presence field

The former `presence.png` illustration is a canvas node field in
`apps/web/src/presence.tsx`. States are `resting`, `aware`, `thinking`, and
`connecting`. Resting draws once; thinking tightens the field and shows neighbour
links; connecting keeps the links while the field settles. `prefers-reduced-motion: reduce`
stays static. The field is decorative (`aria-hidden`).

Assistant identities remain the sprite atlases documented in
[assistant sprites and demo](assistant-sprites-and-demo.md).

## Recapture

After `npm run build`:

```text
node tests/design-capture.mjs
```

The script starts a synthetic gateway on loopback port 4417, captures twelve
routes in both themes at phone and desktop sizes, checks horizontal overflow and
page errors, and writes `test-results/design-review/`. Playwright e2e saves its
screenshots in each test's output directory under `test-results/web/`. Routine
QA does not overwrite tracked documentation images; copy reviewed captures into
`docs/assets/` explicitly when updating the documentation.
