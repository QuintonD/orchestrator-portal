# Alpha 4 release validation

Prepared 9 September 2026 on `feat/assistant-platform-integrations`.

Alpha 4 adds subscription/local model API setup, bounded text conversations and
drafts, policy matching, and a mobile connection-selector fix. Coding agents,
general assistants and personal-agent services including Muse have equal priority
in the platform plan. Native integrations and live upstream subscription-account
compatibility remain outstanding; see [integration QA](assistant-platforms-validation.md).

The Android application ID and signing alias are unchanged. Version code advances
from alpha 3's 5 to 6. The upgrade baseline is now recorded once in `package.json`
and used by the upgrade test and final release manifest; alpha 3 is the required
published starting point for this release.

Release preparation checks are recorded below as they complete. Publication
requires successful main-commit CI, six native desktop packages, a fresh signed
APK, and matching in-place upgrade evidence. Pre-merge candidate checks do not
substitute for tests of the final assets.

## Local validation

The initial integration implementation passed type checks, 147 unit/contract
tests, 77 browser tests (3 existing platform-specific skips), production builds,
four desktop staging tests and the release identity check. See the linked QA
record for the executed commands and adversarial findings.

Release preparation repeated `npm run check` (147 passed), `npm run build`,
`npm run release:check` and `npm run test:e2e` (77 passed, 3 existing platform
skips) with alpha 4 metadata. Windows x64 desktop packaging and all 13 launcher,
authentication, shutdown and persistence smoke scenarios passed.

Signed and debug Android builds passed unit tests and lint. The API 36 emulator
completed all 14 native/WebView journeys, including subscription setup with a
masked key, initially unchecked policy consent, scrolling and native Back.
Screenshots of the new form were inspected. Local native evidence is under
`test-results/android/emulator-5560-1788947394325/`.

The upgrade harness was corrected to match the exact signed package ID, allowing
the separate debug package to coexist. Its database snapshot now follows the
old gateway's normal Compass refresh of the synthetic fixtures, immediately
before switching versions. The initial comparison exposed that timing error;
decrypted fixture inspection confirmed normal guide timestamps and supersession,
not lost user records. The strict byte-for-byte preservation assertions remain.

`npm run test:upgrade` then passed on a fresh API 36 emulator using the published
alpha 3 Windows archive and signed APK. It verified unchanged encrypted records,
the master key, database integrity, custom assistants and reviewed reports,
knowledge, projects, dashboard layout, desktop session/theme, one Compass and
the phone's gateway origin/session. Android retained its first installation time
while advancing to version code 6; no uninstall or data clear occurred. Desktop
and Android post-upgrade screenshots were inspected. Candidate evidence:
`test-results/upgrades/alpha-CYHgUq/results.json`.

## Release evidence

The published release manifest will identify the exact main commit, CI runs,
artifact hashes, signing certificate and upgrade results. No live provider,
physical-phone, TalkBack or independent security audit is implied by these checks.
