# Alpha 2 verification

Date: 2026-09-05. This record covers desktop setup, local/Obsidian and Notion knowledge, and manual Grok Bot handoffs. All fixtures use synthetic content. No personal Notion or Grok Bot account was accessed.

## Automated checks

- Application typechecks and builds pass. Server fixtures cover authenticated connection creation, refresh and deletion, encrypted credentials, malformed inputs, concurrent refresh/deletion, partial indexing, lost source access, bounded traversal and manual report replay.
- Browser regression: 31 journeys passed; three platform-specific tests are intentionally skipped. Runs cover desktop and Pixel 7 browser sizes, nested vault filenames, recoverable folder setup, Notion scope/secret/consent, Grok file preview, claimed import and report review. Each browser journey uses its own loopback-proxy client identity so the entire suite does not share one production rate-limit bucket.
- Android 16/API 36 emulator: all 11 journeys passed, including the native Android JSON picker, Obsidian setup, Notion form, Grok import, report review, keyboard, rotation, restart persistence, offline recovery and all 12 routes at larger text size. Visual captures wait for WebView frames to reach the Android compositor.
- Both debug and signed release APKs build with unit tests and lint. The alpha 2 native change permits text or JSON through the system document picker; it adds no storage permission or JavaScript bridge.
- Windows x64 desktop archive: extracted and run with system Node/npm/Git blocked, from a path with spaces and an unrelated working directory. Checks cover checksums, static assets, private setup, restart persistence, encryption key continuity, process identity, stop, busy ports and stale locks. The CI matrix executes equivalent checks on each native desktop target.

## Usability review

The connection flow now explains the source and scope before requesting credentials. A saved connection is checked immediately. A failed check can be retried without creating a duplicate. A partial index shows readable content and coverage limits rather than presenting an impossible setup loop. Dialogs retain keyboard focus and support Android Back.

Grok Bot work is a visible manual handoff: save/copy the task, bring back a result, preview it, confirm import and open Reports. Report corrections are copied for Grok Bot rather than sent to an unsupported API. Android offers copy/selection for task text because its WebView does not support browser blob downloads.

## Remaining real-environment checks

- Notion API behavior is verified with documented-contract fixtures, not a live account. Validate a small authorized page set during first use.
- Desktop packages are portable and unsigned. Native CI cannot establish downloaded-file trust behavior, notarization or screen-reader usability on every user's computer.
- Phone setup still requires USB forwarding or Tailscale/private HTTPS and an awake gateway computer. Physical phones and real-user onboarding remain acceptance checks.
- There is no automated Grok Bot execution/telemetry, background desktop service, self-updater or managed hosting. These are outside this increment.
- Apple App Store and Google Play submissions remain subject to the owner's explicit approval.
