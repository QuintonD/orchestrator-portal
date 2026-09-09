# Releases and upgrades

**Orchestrator is still alpha.** [Alpha 6](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.6) includes the living ecosystem avatar and restores its original PNG in desktop packages. Each distribution contains six desktop bundles and a signed APK from the same tagged source. [All historical releases](https://github.com/QuintonD/orchestrator-portal/releases) remain available.

## Which version to use

| Version | Status |
| --- | --- |
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
2. Extract the alpha 6 desktop archive into a new program directory. Launch it with the same workspace path and configuration. The default desktop data directory is independent of the program folder. See [desktop upgrades](desktop.md#workspace-files-and-upgrades).
3. Install the signed alpha 6 APK over the signed alpha 5 app. Do not uninstall or clear app data. The application ID and signing identity are retained; Android `versionCode` advances from 7 to 8. See [Android setup](android.md).
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
- After merge, build a fresh signed APK from the released commit. Obtain all six desktop archives from the successful Desktop gateway workflow for that same commit. Verify checksums and native smoke results. Stage the complete asset set in a draft release; publish only once every platform and upgrade check passes.
- Attach `SHA256SUMS.txt`, the signed APK, all six desktop archives, and a release manifest mapping artifacts to the commit and CI runs. Never substitute an older APK or use a debug snapshot as the signed distribution.
- Preserve historical tags/assets and annotate superseded release descriptions. Source merging, QA artifact creation and distribution publication are distinct steps; report completion only after downloadable assets exist.

With the complete asset set staged, run `node scripts/release-manifest.mjs <assets-directory> <CI-run-id> <desktop-run-id> <upgrade-results.json>`. It checks the clean main commit, downloads the named workflow's desktop artifacts to compare bytes, verifies the APK's embedded commit/version/signature, and requires successful upgrade evidence matching the staged APK and native desktop archive before writing the manifest and checksums. Android build tools 35.0.0 and JDK tooling must be installed. Keep the generated release manifest with the release.

See [alpha 6 validation](alpha-6-validation.md) for this release's evidence and [alpha 5 validation](alpha-5-validation.md) for the previous release.
