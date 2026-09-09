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

## Release evidence

The published release manifest will identify the exact main commit, CI runs,
artifact hashes, signing certificate and upgrade results. No live provider,
physical-phone, TalkBack or independent security audit is implied by these checks.
