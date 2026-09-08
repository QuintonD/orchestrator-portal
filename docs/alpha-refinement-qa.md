# Alpha refinement and visual QA

The September 2026 pass brings the alpha closer to the approved Invisible OS
reference: a monochrome presence field, a small number of primary destinations,
and useful information before supporting detail.

The subsequent [sprite, demo and usability pass](assistant-sprites-and-demo.md)
adds three themed atlases and extends visual QA to all 12 routes.

## Experience changes

| Journey | Change |
| --- | --- |
| Open Portal | The next decision and its action fit in the initial phone viewport. Pulse, decisions and recent signals replace repeated summary cards. |
| Start an empty workspace | A clear source setup entry replaces empty metrics. Supporting widgets appear only when source data exists. |
| Connect existing tools | Connections detects OpenClaw and gbrain in known executable locations on the gateway and preselects the source. Detection does not execute tools, scan personal folders, read credentials, or grant access. |
| Get a first result | A connected assistant gets a prepared oversight role and review criteria. The operator chooses the runtime policy; **Start my brief** saves the profile and requests one report. Delivery uncertainty remains explicit, with no automatic retry. |
| Search notes | A successful connection offers **Search knowledge** directly. Windows paths copied with surrounding quotes are accepted. |
| Recognize assistants | Stable geometric identities distinguish assistants. Motion follows running requests and respects reduced motion. |
| Review outcomes | A delivery-state distribution and review count precede reports. Source claims remain claims. |
| Navigate | Five primary destinations remain visible. Secondary destinations are available in the navigation drawer. Phone navigation uses the tested bottom-bar fallback. |

The source health indicator uses the existing 15-minute freshness threshold.
Work-update counts describe running updates reported in the last 24 hours, not
proof that those jobs are still executing. Attention totals include the whole
unresolved queue even though the overview retrieves only six item previews.

Customization controls supporting widgets; pulse, decisions and latest signals
stay in view. Existing widget order and size preferences remain available.
The portal does not automatically connect a detected runtime or claim to enforce
its provider, tool or data restrictions.

## Visual review procedure

Run `npm run build`, then `node tests/design-capture.mjs`. The script starts a
fresh synthetic gateway on loopback port 4417, captures Portal, Assistants,
Reports and Connections in both themes at phone and desktop sizes, checks
horizontal overflow and browser exceptions, and stops its gateway. It writes
16 full-page screenshots plus two phone viewport screenshots under
`test-results/design-review/`.

Inspect the screenshots, not just the assertions. This pass caught the original
low-contrast brief, a hard edge on generated artwork, and report metadata that
squeezed mobile titles into a narrow column. The fixes remove the repeated brief,
blend the artwork into the canvas, and give mobile report text its own row.

Use `npm run test:e2e` for scripted usability journeys, including first-brief
setup, editable command routing, discovery failure/retry, stale-source recovery,
empty workspaces, reduced motion and narrow screens. Use `npm run test:android`
on a dedicated QA emulator for native setup, real WebView interaction, keyboard,
rotation, larger text, attachments, source setup and offline recovery.
Keep the served build fixed throughout each emulator run.

Validation completed on 5 September 2026:

| Check | Result |
| --- | --- |
| `npm run check` | Type checks and 68 unit/server/contract tests passed. |
| `npm run build` | Production build passed. |
| `npm run test:e2e` | 49 passed; three intentional device-specific skips. |
| `npm run test:android` | All 11 native/WebView journeys passed on the dedicated API 36 emulator. |
| `node tests/design-capture.mjs` | 16 surfaces captured, with no horizontal overflow or browser exceptions. |
| `node tests/android/visual.mjs` | Eight final WebView surfaces captured in both themes, including the mobile report-width regression check. |
| `node scripts/desktop/package.mjs` and `npm run desktop:smoke` | Windows package built; archive integrity, launch, setup, persistence, static assets and graceful stop checks passed. |

Selected evidence: [phone Portal](assets/refinement/portal-light.png),
[desktop dark Portal](assets/refinement/portal-dark.png),
[assistant identities](assets/refinement/assistants.png), and
[Android report layout](assets/refinement/android-reports.png).

The full Android run precedes the final report-column and connection-typography
corrections. The subsequent WebView visual run checks those corrections against
the final build. The existing Android wrapper needs no new APK for these
gateway-served changes. Its native toolbar still follows the device theme
independently of the portal's appearance toggle.

The rebuilt Windows archive is
`dist/desktop/orchestrator-0.1.0-alpha.2-win32-x64.zip`, with its adjacent SHA-256
file. This is a local refinement build using the existing alpha version label,
not a newly published release. The installed gateway was left running from its
existing program directory. The source workspace and package contain the changes.

These are agent-led visual reviews and scripted task walkthroughs. They are not
a recruited participant usability study, a TalkBack audit, or physical-device
validation. No private runtime was dispatched during QA; report generation used
the synthetic adapter. Automatic discovery currently covers OpenClaw and gbrain;
other runtimes still require their address or source selection.

## Asset provenance

The resting presence illustration `apps/web/public/assets/presence.png` was
replaced by a procedural canvas field. See [visual system](visual-system.md).
Assistant sigils remain sprite atlases so theme, running state, and reduced-motion
behavior stay deterministic.
