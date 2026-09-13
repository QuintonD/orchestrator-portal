# Releases and upgrades

**Orchestrator is still alpha.** [Alpha 7](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.7) adds optional Android phone control, authenticated task execution and an isolated source-code environment. The separate Phone Control companion remains experimental; emulator evidence does not establish physical-device acceptance. This distribution contains six desktop bundles, signed gateway and companion APKs, and the standalone broker package from the same tagged source. [All historical releases](https://github.com/QuintonD/orchestrator-portal/releases) remain available.

## Which version to use

| Version | Status |
| --- | --- |
| `0.1.0-alpha.7` | Optional Phone Control companion and scoped broker; task reservations, screenshot grants, signed responses and confined source programs |
| `0.1.0-alpha.6` | Original artwork included in desktop packages; packaged image MIME and byte checks |
| `0.1.0-alpha.5` | Living ecosystem avatar and optional sound; desktop packages omitted the original comparison PNG; upgrade baseline for alpha 6 |
| `0.1.0-alpha.4` | Previous alpha: subscription/local model API connections and mobile connection-name layout fix; upgrade baseline for alpha 5 |
| `0.1.0-alpha.3` | Previous alpha: prepared teams, automatic local briefs, personal workflows and the monochrome interface; upgrade baseline for alpha 4 |
| `0.1.0-alpha.2` | Previous packaged alpha; supported starting point for the alpha 3 upgrade |
| `0.1.0-alpha.1` | Historical initial Android distribution |
| `0.2.0-beta.1` | Historical development label in validation records; never a published versioned release |
| `0.2.0-beta.2` | Incorrect development label introduced by PR #11; not an approved move to beta |
| `android-qa-6e90a43`, `android-qa-7525bc3` | Archived debug snapshots bearing that beta 2 label; separate app identity, not updates to the signed alpha |

## Correction recorded on 8 September 2026

[PR #11](https://github.com/QuintonD/orchestrator-portal/pull/11) merged useful prepared-team and personal-workflow work, but changed the source version directly from alpha 2 to beta 2. Later documentation repeated it while desktop downloads remained alpha 2. [PR #14](https://github.com/QuintonD/orchestrator-portal/pull/14) added the latest interface. Alpha 3 includes both; this correction does not revert either feature set.

The owner confirmed that the product remains alpha. The corrective commit and this history explain the mismatch without rewriting shared commits, moving old tags, deleting assets, or relabelling old test results as new evidence. Historical filenames and stored migration identifiers containing `beta` are retained for compatibility. Beta promotion requires an explicit owner decision; a feature merge or passing CI does not change maturity.

## Upgrade without losing your workspace

1. Stop the existing gateway. Back up its entire workspace directory, including the database and encryption key. Keep any externally supplied master key.
2. Extract the alpha 7 desktop archive into a new program directory. Launch it with the same workspace path and configuration. The default desktop data directory is independent of the program folder. See [desktop upgrades](desktop.md#workspace-files-and-upgrades).
3. Install the signed alpha 7 APK over the signed alpha 6 app. Do not uninstall or clear app data. The application ID and signing identity are retained; Android `versionCode` advances from 8 to 9. See [Android setup](android.md).
4. Check your records, connections and settings before retiring the previous program. Rollback means restoring the stopped pre-upgrade workspace backup with its matching key and previous program; database downgrade compatibility is not promised.

Updating only the phone cannot upgrade the gateway's features. There is no automatic updater. A source installation must keep its existing `ORCHESTRATOR_DATA_DIR`; switching launch methods without specifying that path can open a different, empty workspace.

## Android QA snapshots

The two old QA snapshots are retained with their original tags and assets for reproducibility. They use `io.github.quintond.orchestrator.debug`, allow WebView inspection, and install alongside the signed app. They are historical test artifacts, not the current installation route. Do not uninstall one to migrate data into the signed app: the gateway workspace remains separate and phone-local settings are not automatically transferred between app IDs.

## Maintainer release contract

- `package.json` defines the application version; the lockfile, gateway health response and Android `versionName` must match. Workspace npm packages have independent internal versions.
- `package.json` also identifies `orchestratorRelease.previousVersion`, the published upgrade baseline shared by the upgrade test and release manifest. Advance it to the prior published alpha when preparing a release.
- Remain on `0.1.0-alpha.N` until the owner explicitly changes release stage. Debug variants add `-qa`; commit hashes identify snapshots, not maturity levels.
- Every release is a new immutable tag on reviewed `main`, with an increasing Android version code and the original signed application identity.
- Run `npm run release:check`, local functional/security/browser checks, native Android QA, desktop packaging/smoke, and `npm run test:upgrade` against the prior published desktop archive and signed APK. Record exact evidence and limitations in the PR and release.
- After merge, build fresh signed gateway and Phone Control companion APKs from the clean released commit. Obtain all six desktop archives from the successful Desktop gateway workflow for that commit. The separate Phone Control workflow must also pass on `main`, including container isolation, broker package checks and native emulator QA. The standalone broker archive must match its package QA artifact from that workflow and every allowlisted source file in the clean checkout.
- Run a new complete companion in-place upgrade against the exact fresh release APK. Retain the signed pre-change companion alpha 1 baseline at `test-results/release-assets/phone-control-0.1.0-alpha.1.apk`; this baseline was not separately published. `previousCompanionVersion` in the manifest script names this explicit baseline. Preserve its signing identity, application ID, settings and installation identity. Continuation-only verifier records and earlier APK digests cannot satisfy the release gate.
- Stage exactly nine distributions: six desktop archives, `orchestrator-0.1.0-alpha.7.apk`, `phone-control-0.1.0-alpha.2.apk`, and `orchestrator-phone-control-0.1.0-alpha.1.tgz`. Attach `SHA256SUMS.txt`, `SBOM.cdx.json` and a release manifest mapping those artifacts to source and CI runs. Keep upgrade evidence outside the asset staging directory. Unknown staged files and distribution extensions are rejected. Never substitute an older APK or use a debug snapshot as the signed distribution.
- Keep the six CI-produced desktop `.sha256` sidecars in staging for the manifest gate. Publish an explicit list of the nine distributions and three metadata files; the staging sidecars are not additional release downloads. The gateway upgrade harness must use the exact CI archive and its sidecar at `dist/desktop/`, with the prior published desktop archive, APK and `SHA256SUMS.txt` retained at `test-results/release-assets/`.
- Preserve historical tags/assets and annotate superseded release descriptions. Source merging, QA artifact creation and distribution publication are distinct steps; report completion only after downloadable assets exist.

With the complete asset set staged in a clean release checkout, generate its SBOM and then run the manifest gate:

```text
node scripts/release-sbom.mjs <assets-directory>
node scripts/release-manifest.mjs <assets-directory> <CI-run-id> <desktop-run-id> <gateway-upgrade-results.json> <phone-control-run-id> <companion-upgrade-results.json>
```

The gate checks the clean fetched `main` commit and all three successful workflow identities. It downloads desktop and broker package QA artifacts to compare bytes; checks both APKs against the fresh local release builds, embedded source commit, version and retained signing identities; and requires complete upgrade evidence for the exact staged artifacts. Companion proof must show the same installation and settings snapshot, retained permissions, and rejection of the old active authority after the update. It must contain the original full-run assertion sequence, hashes of the retained probe APK and current fixture APK, and harness/probe source hashes matching the clean checkout. Canonical APK legal bytes are checked by the release build's `verifyReleaseArtifact` task; the manifest separately checks all broker archive files, including its legal notices, declarations and isolated deployment sources. It verifies SBOM source/artifact/file digests before writing the manifest and checksums. Android build tools 35.0.0 and JDK tooling must be installed, with `ANDROID_HOME` and `JAVA_HOME` set. Keep the generated manifest and SBOM with the release.

Gateway proof must contain the original eleven checks, its typed record-preservation result, an emulator serial, no cleanup error, all four current/prior desktop and APK hashes, and source hashes for the upgrade harness and both local helpers. The harness records input hashes before extraction or installation and refuses changes before completion. Older records without source hashes remain historical evidence; run the harness again after merge. The companion upgrade harness currently runs on Windows and also requires Android build tools 36.0.0, platform 36 and a freshly built debug fixture APK. Build that fixture before the final signed companion build, and retain the generated upgrade probe beside its results. Run `npm ci` before SBOM generation so installed dependency metadata matches the lockfile.

Run `npm run release:test` for the release gate's inventory, version, source-binding, archive-path and invalid-proof checks. These tests supplement the full post-merge artifact and upgrade gate; they do not establish physical-device acceptance or independent task-outcome verification.

See [alpha 7 validation](alpha-7-validation.md) for this release's evidence and [alpha 6 validation](alpha-6-validation.md) for the previous release.
