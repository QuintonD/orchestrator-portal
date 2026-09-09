# Alpha 5 release validation

Alpha 5 integrates the source-based assistant animation and sound suite into the
authenticated application. The avatar represents recorded ecosystem state and
remains available in the header outside the Portal's main illustration. See the
[design and behavior record](design/assistant-motion.md).

The application remains alpha. Android retains its application ID and signing
identity; version code advances from 6 to 7. The published alpha 4 desktop archive
and signed APK are the upgrade baseline. Source merge, candidate checks and final
distribution checks are separate; release assets must come from the reviewed main
commit and pass the release manifest and in-place upgrade checks before publication.

## Local validation

`npm run check` passed type checks and 162 unit/contract tests. `npm run build`
and `npm run release:check` passed. The focused browser checks passed all eight
desktop/mobile journeys for the ecosystem and presence field.

The adversarial pass checked stale snapshots, concurrent request lifecycle events,
reordered assistant lists, large source groups, false success signals, reduced
motion, hidden views, native dialog focus and untrusted identifiers. It caught
a secure-context assumption in request IDs: a monotonic local sequence now keeps
mutations working on authorized private HTTP gateways as well as localhost.

Visual inspection covered desktop and mobile panel geometry and source-sized
linework. The animation studio remains available at `/assistant-motion` for the
full 18-state suite and original-image comparison. No new runtime dependency or
remote image/audio service is required. Audio is synthesized locally and defaults
off. Current gateway snapshots do not encode assistant-to-assistant delegation;
the application explicitly groups dense teams by source instead.

The full browser pass exercised 102 cases (three platform-specific skips). It
exposed an existing setup-test race: the test now waits for its runtime selection
before saving. The corrected setup journey passed on desktop and mobile. The
subsequent 26-case integration/navigation pass passed 23 with the same three skips.
The final complete rerun passed 99 tests with those three platform skips.

Windows x64 packaging and all 13 desktop launcher/security/persistence smoke
scenarios passed, along with four staging/path tests. Debug and signed Android
builds passed unit tests and lint. The native ecosystem journey caught a close
control that the previous Android Back handler did not recognize; using the
standard `Close dialog` control fixed it. Reopening and Back then passed on API 36.

All 15 native/WebView journeys passed locally on API 36, including the ecosystem,
Back, keyboard and rotation, large text, all routes, source setup, reports and
offline recovery. Evidence: `test-results/android/emulator-5560-1788965710482/`.

Hosted CI passed its functional/browser, Docker, CodeQL and six native desktop
jobs. The hosted emulator repeatedly exited with the legacy SwiftShader backend,
on both 37.1.11 and 36.6.11. Host diagnostics showed available memory and no OOM
kill. CI pins emulator 36.6.11 (build 15507667) and uses the maintained ANGLE
software backend (`swangle`); `swiftshader_indirect` is
[deprecated by Android](https://developer.android.com/studio/run/emulator-acceleration).
It also releases Gradle daemon memory and captures host/crash diagnostics on
failure. The API 36 image, GLES rendering and all 15 journeys remain enabled.
The ANGLE run retained the emulator and passed the ecosystem journey. It exposed
a CDP navigation wait after the assistant wizard had already advanced (confirmed
by its failure screenshot). That transition now waits for the selected runtime
instead of an inferred form navigation. The motion journey restores its original
preference after verifying persistence. The renderer also retains unchanged count
text nodes and attributes during animation; a browser mutation check covers this
with 36 grouped assistants while the geometry keeps moving. The precise legacy
renderer failure cause is unconfirmed. Covered avatars now settle while a dialog
takes focus, avoiding continuous full-page backdrop repaints, and resume on close;
the avatar inside its own ecosystem panel stays animated. Browser and native
checks assert this behavior. Failure artifacts include frame and input diagnostics.
Passing the complete rerun remains required. No animation check is disabled.

Final hosted and upgrade results are recorded as they complete. The
release manifest will identify the exact reviewed main commit, hosted CI runs,
all seven distribution hashes and matching in-place upgrade evidence. No physical
device, TalkBack or independent security audit is implied.
