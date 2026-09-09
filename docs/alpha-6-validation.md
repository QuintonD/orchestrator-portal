# Alpha 6 release validation

Alpha 6 corrects the desktop packaging omission of `assistant-original.png`.
The source/dev build contained the supplied transparent PNG, but the desktop
allowlist excluded it and the gateway returned the SPA fallback at its URL.
The allowlist now includes that exact public filename. Arbitrary root images,
credentials, databases and source maps remain excluded; symlinks remain rejected.

The staging regression failed against the old allowlist and passes with the fix.
Every native desktop smoke job now requests the PNG from the extracted, running
package, checks `image/png`, and compares its bytes with the source asset. This
catches both a missing file and an HTML fallback that happens to return HTTP 200.

The release remains alpha. Android retains its package and signing identity,
advances versionCode from 7 to 8, and uses published alpha 5 as the in-place
desktop/Android upgrade baseline. The animation, graph projection, sound and API
behavior are unchanged. Main workflows, fresh signed APK identity, all six desktop
archives and upgrade evidence must pass the release manifest before publication.
Exact final results are recorded on the PR and in the attached release manifest.

Local validation passed: build, release identity, all 162 unit/contract tests, all
four packaging/path tests, and all 13 Windows package smoke scenarios including
the new HTTP MIME and exact-image-byte assertions. An additional standalone
packaged browser preview could not launch because automatic approval review
rejected that command as blocked by policy. The running-package HTTP regression
and existing original-image browser suite cover the corrected asset boundary.
