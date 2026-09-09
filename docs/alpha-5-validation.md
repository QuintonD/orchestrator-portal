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

Final browser, Android and upgrade results are recorded as they complete. The
release manifest will identify the exact reviewed main commit, hosted CI runs,
all seven distribution hashes and matching in-place upgrade evidence. No physical
device, TalkBack or independent security audit is implied.
