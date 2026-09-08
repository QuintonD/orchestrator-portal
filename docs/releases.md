# Releases and downloads

**[Browse every release on GitHub](https://github.com/QuintonD/orchestrator-portal/releases)**

Each release has its own notes, source tag, and downloadable assets. GitHub's Releases page is the complete, automatically updated history. This guide explains which build to choose; all current builds are pre-releases.

## Choose a build

| Build | Who it is for | Downloads |
| --- | --- | --- |
| Alpha 2 | Trying the packaged desktop gateway and signed phone app | [Windows, macOS, Linux, Android, and checksums](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.2) |
| Beta 2 Android QA | Testing beta behavior against a matching source-built gateway | [QA APK and checksum](https://github.com/QuintonD/orchestrator-portal/releases/tag/android-qa-6e90a43) |
| Current source | Contributors and testers who want current development work | [Source instructions](../README.md#try-the-beta-from-source) |

## Release highlights

### Alpha 2 - 5 September 2026

Portable gateway bundles for six desktop targets, knowledge connections, and guided Grok Bot handoffs. Includes the signed Android alpha app.

[Release notes and downloads](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.2) | [Changes from alpha 1](https://github.com/QuintonD/orchestrator-portal/compare/v0.1.0-alpha.1...v0.1.0-alpha.2)

### Alpha 1 - 5 September 2026

The first published Android alpha distribution.

[Release notes and downloads](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.1)

## Android QA snapshots

QA snapshots are separate from the signed alpha app. They use the `.debug` application ID, allow WebView inspection, and install alongside the alpha. They are for testing with a separate workspace, not stable distribution.

[Beta 2 QA snapshot at 6e90a43](https://github.com/QuintonD/orchestrator-portal/releases/tag/android-qa-6e90a43) was built and tested by CI from that exact commit. Use the same source commit for the gateway when reproducing its results. The older alpha desktop bundles do not include the beta features.

## Download and update

Open a release and expand **Assets**. Choose the application archive or APK for your platform; GitHub's **Source code** ZIP and tarball are source trees, not runnable desktop bundles.

Release assets are public downloads and do not require GitHub Actions access. Use the accompanying SHA-256 file to check integrity. Follow [desktop setup](desktop.md) for backups and upgrades and [Android setup](android.md) for phone connections. Desktop bundles do not update automatically.

For new releases, use GitHub's **Watch** menu on the repository and select **Custom > Releases**. The [release feed](https://github.com/QuintonD/orchestrator-portal/releases.atom) is also available.

[Project home](../README.md) | [Documentation](README.md) | [Get help](../SUPPORT.md)
