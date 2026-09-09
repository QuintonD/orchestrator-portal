# Main assistant motion and sound

## Living ecosystem: application integration, 9 September 2026

The avatar now follows the authenticated workspace across every application view.
The Portal shows it beside the system pulse. When that area leaves the viewport,
or another destination opens, a compact avatar appears in the sticky header.
Either opens the same ecosystem panel, with counts, the next relevant destination,
motion preference, sound toggle and volume. Native dialog behavior retains focus,
Escape and Android Back. Audio starts only after an explicit gesture.

An authenticated, uncached `/api/presence` snapshot supplies assistant identity,
source identity/health, recorded activity, unresolved attention, dispatch pause,
and the latest report identifier/state. It excludes names, mandates, report bodies,
messages, connection settings and credentials. Portal events and request lifecycle
changes trigger debounced refreshes; visible clients also refresh every 15 seconds.
Requests are serialized and time out after 10 seconds. Hidden clients suspend the
stream, polling, animation and audio. Network failures retain the last graph and
explicitly show that its current activity is unavailable.

Each assistant retains its node and position through sorting, navigation, additions
and removals. Working members pulse individually; paused members dim; uncertain
outcomes carry an alert. Above 18 members, branches group assistants sharing a
source and preserve total membership. This grouping does not invent a delegation
hierarchy. Source relationships are not yet available as authoritative data;
adjacent subteam choreography remains available in the studio for future adapters.

Growth and consolidation reflect actual membership changes. New reports receive
an acknowledgment, with success reserved for an explicitly verified receipt.
Attention, uncertainty and unavailable state take priority over decorative
gestures. Pausing dispatch does not imply that already-running source work stopped.
The restrained idle breath makes the ecosystem present without fabricating work.
Satin lighting follows each node through depth; all branches use the same geometry
for nodes, edges and travelling signals. The original supplied artwork remains
available unchanged in the motion studio and portable export.

Model tests cover identity, counts, large source groups and evidence semantics.
Browser journeys cover navigation, growth, disabled motion, focus, network failure
and retry at desktop and mobile widths. The Android suite adds a native Back and
motion-preference journey. See [alpha 5 validation](../alpha-5-validation.md).

## Study 03: refinement, 9 September 2026

Ink is now the default surface; the texture surface has been removed. Satin
uses an individual gradient per node, computed from a fixed point light and the
node's position and depth. The camera follows wide poses enough to keep every
ring within the shared source artboard, including in exported SVG images.

The blank original was reproduced with a stopped preview server and a cached
page whose image had zero natural dimensions. The server was restarted as a
hidden background process. The export command now copies the exact transparent
PNG to `apps/web/public/assistant-original.png` so rendering uses a normal app
asset URL. Its visible ink, transparency and dimensions are verified. Original
uses the supplied pixels for the unchanged five-branch team; custom graphs keep
their neutral pose. Compare original always shows the supplied image at the
same display dimensions. The moving vector linework remains an approximation;
the PNG and raster-backed `original.svg` preserve the exact source pixels.

Every gesture accepts the current graph through the `network` prop. Choosing
an idle, active, personality or outcome gesture preserves that topology.
`appendAssistant(network, parentId)` grows a branch from the selected parent's
rim without rearranging existing nodes. `formSubteam` adds a lead and then two
adjacent assistants. `consolidateNetwork` gathers existing members and conserves
their total. Network actions play once and hold; replay repeats the transition
without adding more assistants. Load 36 assistants is a separate, explicit
team preset. Count-based layouts preserve the five original branch positions
when adding a sixth assistant. Explicit additions keep at most 21 visible nodes
and increment a group when the scene is full.

Stems and rings share the same posed geometry. Stems are trimmed at ring radii,
suppressed when circles overlap, and masked inside every ring. Travelling
signals use the trimmed segment. Exported SVG masks and circles use identical
interpolation, so stems cannot overshoot between sampled frames. Masks remain
opaque when disconnected nodes fade. Live updates happen before paint; switching
from Original no longer briefly flashes a completed graph. Pausing freezes the
current interpolated pose. Ordinary transitions take 0.85 seconds; network
transitions take 1.8 seconds, with delayed growth for adjacent assistants.

### Visual passes

The generated [six-pose review](../../assets/assistant-motion/visual-review.html)
uses the application's geometry sampler. Browser inspection covered the
original, satin drift, growth, consolidation, subteams and personality gestures.
The review found and corrected nodes appearing inside hollow parents, a new
subteam stem crossing an existing branch, and outer rings clipping during wide
gestures. Branch placement now penalizes crossings with existing connections.

Curiosity now leans and holds, listening settles inward, the jump has a crouch
and landing, and attention gives two taps followed by quiet time. Jitter remains
a short shiver. Sound cues now coincide with branch arrivals, attention taps,
and the jump's landing. These are visual design judgments, not a user study of
perceived emotion. The intent is an attentive, restrained personality.

### Validation for Study 03

The production build, TypeScript and 12 web unit tests passed. Unit cases cover
the original geometry, count limits, all gestures on original/grown/grouped/
hierarchical graphs, parent-rim growth, exact edge attachment, bounded framing,
changing illumination and bounded sound scores. Browser checks cover visible
source ink, transparency and size, dynamic light gradients, stem endpoint error
below 0.003 artboard units, pause during growth, replay, topology persistence,
reduced motion, offscreen suspension, real audio waveform and mute, exported
SVGs, and desktop/mobile light and dark layouts. Release identity and diff
checks passed. No new dependency or downloaded tool was added. This remains an
unreleased web change; native Android, upgrades and physical-device sound
perception were not tested.

The final scoped browser run covers 36 cases: 18 motion/presence cases and 18
existing refinement regressions across desktop Chromium and Pixel 7 emulation.
The initial run exposed a case-sensitive surface test locator and the growth
start/pause timing issue; both were corrected and their suites rerun. A later
four-case satin/export check also passed after correcting dark-mode light
direction. The bright side of a satin node now faces the same light in either
theme. Screenshots include the original and both materials in both themes.

## Study 02 record

The following records the preceding iteration; Study 03 above supersedes its
surface choices, network transitions and static gradient implementation.

Study 02, 9 September 2026, replaces the earlier pulse-only suite following the
owner's request for visible movement, faithful artwork, dynamic teams and sound.

## Findings and corrections

The collaborative browser reports `prefers-reduced-motion: reduce`. The first
studio silently disabled its animations. The new studio explains that condition
and provides Device setting, Full motion and Still controls. A Full motion choice
is explicit and saved for the preview; the Portal has its own motion preference.

The old original-view toggle displayed the opaque, square reference PNG at a
different size from the SVG. It now displays the actual transparent PNG,
`file_000000007eec81f5b3371bdf2befa371.png`, at the same artboard size as the rig.
Its dimensions are 1371 × 1148. Node centres and radii were measured from that
file's alpha geometry. The source PNG is preserved byte-for-byte in the exports.
`original.svg` embeds those same pixels; moving vectors approximate their line
edges and provide optional shading/texture.

## Motion and topology

`assistant-rig.ts` defines 18 studies and a pure, seekable geometry sampler.
The renderer projects node positions through depth, adjusts size and opacity,
and updates connecting paths as nodes move. Idle variants breathe, drift and look
around; active variants gather, reach and respond. Personality variants jump,
shiver and nudge. Completion and interruption play once and settle.

`AssistantMark` uses one animation-frame loop and updates existing SVG elements
without per-frame React renders. Reordering occurs only when depth order changes.
The wrapper stops the loop when paused, offscreen, hidden or motion-disabled.
Finite animations stop at completion; paused frames preserve their pose.
CSS transitions are disabled inside the rig because the app's global
reduced-motion rule otherwise introduced extra interpolation for SVG attributes.
Development remount cleanup captures the actual element to avoid duplicate
stationary nodes after React clears its ref.

The network model bounds assistant counts to 0–120 and leads to 0–5, preserves
stable node IDs, and interpolates topology changes over 0.85 seconds. Above 18
direct assistants it groups the team into five counted clusters. Leads can own
satellite groups; at most three are visible per lead. Group counts conserve the
total. The consolidation study adds temporary gathering particles, reaching a
maximum of 36 rendered nodes. Non-finite and negative counts are handled at the
model boundary.

The Portal feeds its source-reported assistant count into the rig. A pending
refresh selects Connecting; stale data selects Disconnected; attention selects
Needs you; otherwise the assistant breathes. Lead relationships are available
to the component and preview; no source hierarchy is fabricated in the Portal.
The preview's team controls are labelled as a study and make no workspace calls.
Adjacent source text remains authoritative; the decorative rig does not establish
delivery, completion or verification.

```tsx
const sound = useAssistantSound();
<PresenceField
  state="thinking"
  assistants={12}
  leads={3}
  material="ink"
  policy="system"
  onFrame={sound.tick}
  onActivity={sound.activity}
/>
<AssistantSoundControls sound={sound} />
```

## Sound

`assistant-sound.ts` defines short pentatonic motifs, stereo placement, glides
and envelopes. The browser synthesizes these locally with sine fundamentals and
a faint overtone; no audio download, microphone or service is involved. Audio
starts only through the Sound control, has an immediate mute and a volume slider,
and suspends when the rig stops or leaves view. Resuming skips missed notes.
Volume is remembered; sound requires a new gesture after loading the page.

The implementation follows the browser's
[AudioContext resume model](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)
and [autoplay requirements](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
Motion lifecycle handling follows the
[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## Deliverables and validation

The [portable suite](../../assets/assistant-motion/README.md) contains the
original PNG/SVG, 18 study SVGs, manifest and an offline preview with sound.
SVGs bake samples of the geometry; dynamic counts and material selection remain
features of the live component. No new dependency or downloaded tool was added.

Validation on 9 September 2026:

- Full production build and TypeScript passed.
- 9 web unit tests passed, including measured geometry, finite coordinates,
  count conservation, invalid counts, visible depth displacement, identity
  growth, and bounded sound scores.
- 34 browser cases passed across desktop Chromium and Pixel 7 emulation
  (motion/presence and existing refinement suites). Checks cover all studies,
  actual changing coordinates, explicit reduced-motion override, pause/resume,
  finite replay, source PNG alpha and dimensions, team growth and hierarchy,
  standalone SVG animation, original-file byte equality, and 320px layout.
- Audio tests measured a real nonzero waveform after activation, silence at
  zero volume, suspension offscreen and after mute, and resumption on return.
- T3 collaborative browser inspection confirmed motion, count growth,
  consolidation and subteams. A short frame-timing sample while recording
  measured approximately 18ms median and 19ms 95th-percentile intervals for
  both six-node drift and the 36-node consolidation study on this machine.
  This is a local sample, not a device performance guarantee.
- Desktop/mobile screenshots inspected in both themes. Release identity and
  diff checks passed; application version remains `0.1.0-alpha.3`.
- Native Android, physical-device audio and upgrade QA were not run for this
  unreleased web change. Audio output depends on the selected device and volume;
  automated validation checks the waveform, not perceived loudness or timbre.

Screenshots: [desktop light](assistant-motion/desktop-light.png),
[desktop dark](assistant-motion/desktop-dark.png),
[mobile light](assistant-motion/mobile-light.png),
[mobile dark](assistant-motion/mobile-dark.png).
