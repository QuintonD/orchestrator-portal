# Signed companion upgrade QA

The complete 13 September 2026 emulator run passed 24 assertions for an in-place
upgrade from companion `0.1.0-alpha.1` / code 1 to `0.1.0-alpha.2` / code 2.
The application ID remains `io.github.quintond.orchestrator.phonecontrol`.
No production uninstall, downgrade, data clearing or emulator wipe was used.

Evidence is retained locally in
`test-results/phone-control/signed-upgrade-20260913-alpha2-complete-d/`.
The JSON result binds both APK hashes, signing identity, embedded source identity,
probe and fixture hashes, and the exact three harness source-file hashes.
The retained artifacts are engineering evidence from uncommitted feature source;
publication requires a new complete run with the exact clean released APK.

| Artifact | SHA-256 |
| --- | --- |
| Signed alpha 1 baseline | `4ba4cddc514ca9b7f8883aaed1eb3bf91df9d20bf1b1ab61238159062dc950d7` |
| Signed alpha 2 candidate tested above | `9fe70fd5f8daa308ae988cd9b531e776c8a0929745239cdcebc7fc249df6375c` |
| Common signer certificate | `0dd679dd2b18a900f81f7f2e3225f422898aace8a473c83063d36643faf94a8d` |
| Preserved policy and owner-data snapshot | `3710e4e348fe9d4bc4db8d2b99a17f56afdb5fadf1f9a963cdaf7bbe363ccf56` |

Both APKs are nondebuggable Release builds. The baseline was reconstructed in an
isolated detached checkout at
`ffd95642556391121cd6482c28c98c7a3df25dd3` using only the companion and its build
entry point from the retained feature snapshot
`test-results/phone-control/source-worktree-20260913T041937Z.patch` (SHA-256
`273714c0fca278ad581d680c3e3ffbbee50960f926860fe157bd14b62c9a750a`).
This is the first companion distribution, so the baseline was not a separately
published release. Its immutable signed APK is also retained as
`test-results/release-assets/phone-control-0.1.0-alpha.1.apk`.

## What the full run proves

The test installed the old signed companion, seeded representative local data
through a separate signature-matched owner instrumentation APK, and established
a live old native session. It then used Android's supported `adb install -r`
update, launched the new version, and checked the following:

- The original nonempty UID and first-install timestamp survived the update.
- Notification permission and accessibility settings were retained.
- The app allowlist, operation allowlist and package-signing pin survived.
- Synthetic owner preferences and a file's exact bytes survived, independently
  read before and after the update and compared by snapshot digest.
- The old live native token was rejected before any verifier restart. In-memory
  active authority did not survive the installation transition.
- The newly introduced screenshot-disclosure preference remained absent and
  its effective value defaulted to deny.

The final run used Android 16 / API 36 on the dedicated AVD
`orchestrator-phone-control-upgrade-complete-20260913`. Its storage was relocated
to D: before its first successful boot because the host C: drive could not fit
the Android image's initial userdata allocation. Existing AVD data was preserved.
The same emulator was subsequently handed to gateway upgrade QA; its state was
preserved when stopped. This proves an emulator upgrade path, not physical-device
acceptance or behavior on every Android vendor build.

## Repeating the release check

The record above is historical alpha 1-to-2 evidence. Alpha 8 preparation uses the published companion alpha 2 from the alpha 7 release as its baseline, and a fresh companion alpha 3 / code 3 candidate. Retain both historical proofs and run the complete harness again for the exact clean release artifacts.

Use an explicitly selected, dedicated emulator with no newer production
companion installed. Preserve the retained signed baseline and the dedicated
phone signing identity. `scripts/phone-control-upgrade-build.mjs` uses a separate
owner-private phone key and does not reuse or change the gateway key. It generates
that identity only when neither key nor password exists, and refuses a partial
pair. Never publish the key, password or owner instrumentation APK.

```sh
node scripts/phone-control-upgrade-build.mjs <clean-release-checkout>
node tests/phone-control/upgrade.mjs --serial emulator-5586 --baseline test-results/release-assets/phone-control-0.1.0-alpha.2.apk --candidate apps/phone-android/app/build/outputs/apk/release/app-release.apk --output test-results/phone-control/<new-evidence-directory>
node --test tests/phone-control/upgrade-evidence.test.mjs scripts/release-manifest.test.mjs
```

Build slots and emulator ports must be coordinated with concurrent native QA.
The script rejects production devices, a reused artifact directory, and a
preinstalled candidate that would require a downgrade. It copies both APKs into
the new evidence directory before inspecting or installing them. The separate
probe can exercise owner test setup but is never part of the production APK.
The script keeps live tokens only in memory and redacts diagnostic output.

The verifier accepts one exact raw instrumentation success, verify phase,
64-character snapshot and successful framework completion. Missing, repeated,
contradictory or substring-only records are rejected. The release manifest
requires the exact complete assertion sequence, independently inspected APK
identities, actual probe/fixture bytes and matching harness sources. It also
requires the candidate to embed the current clean Release commit.

## Retained failures

Earlier evidence directories remain intact. The initial attempts exposed test
instrumentation suppressing accessibility and a missing explicit rebind during
seeding. An initial completed install then exposed incorrect parsing of Android
16's `appId` field and formatted instrumentation output. A subsequent fresh
upgrade preserved state and rejected old authority, but its verifier waited for
an unnecessary accessibility rebind. Verification now reads the persisted local
policy directly, and the exact raw output parser is covered by adversarial tests.

The linked `signed-upgrade-20260913-alpha2-verifier-continuation` passed on the
already upgraded installation and was useful diagnostic evidence. It is
explicitly ineligible for publication. The later `complete-d` run executed the
entire corrected sequence from the old signed application. Two intervening
startup attempts failed to allocate userdata on C: before installing any APK;
those records are retained as environment failures.
