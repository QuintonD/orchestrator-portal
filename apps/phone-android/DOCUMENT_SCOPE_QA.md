# Exact document scope verification

This adapter remains alpha. Host builds and fixtures do not establish device
acceptance. Use only a disposable, explicitly identified emulator with synthetic
content. No release, version change, physical-device action, or app-data reset is
part of this workflow.

## Host checks

From `apps/phone-android`:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebugAndroidTest :app:verifyDebugArtifact :app:lintDebug :fixture:assembleDebug :fixture:lintDebug --console=plain
```

JVM checks cover exact Unicode and line endings, malformed UTF-8, NUL/unpaired
surrogates, byte and UTF-16 bounds, opaque-handle grammar, display-name controls,
late reads, write-after-abandon denial, unknown outcomes after write attempts,
retained worker occupancy, and deferred revocation cleanup. The fixture APK adds
a real, Android-permission-protected `DocumentsProvider`; it is never shipped in
the companion APK.

## Emulator acceptance

1. Install the newly built app, fixture, and instrumentation APKs with `install
   -r` on the owned emulator. Keep its existing fingerprint enrollment and app
   data. Grant notifications and enable the companion accessibility service.
2. Open the companion. Choose **Select one plaintext document**, open the picker
   root **Phone scoped documents QA**, and select **target.txt**. Inspect the
   provider/URI/trust disclosure and choose **Trust and allow read + replace**.
   This real picker step is required: do not seed preferences or URI grants.
3. Record the generated UUID from the owner's local screen. Independently save
   the synthetic fixture's `files/scope-sibling.txt` through `run-as` for an
   unchanged-sibling comparison. No real user document or token is an artifact.
4. Prefer the bounded host driver, which verifies the dedicated emulator and
   installed APK hashes, runs exactly one test attempt, waits for the actual
   fingerprint scheduler, injects fingerprint 1 once, compares independent
   target/sibling bytes, and writes safe evidence to a **new** JSON file:

   ```text
   python scripts/document-scope-probe.py --adb PATH_TO_ADB --serial OWNED_EMULATOR --resource-id UUID --output NEW_EVIDENCE_FILE.json
   ```

   Its 120-second attempt budget excludes bounded cleanup/evidence collection.
   It imports the established biometric driver's bounded process and sensor
   readiness helpers. It never creates grants, retries a mutation, exports
   document text, or overwrites a previous evidence file. Eleven host-only
   adversarial checks run with `python -m unittest discover -s scripts -p
   test_document_scope_probe.py -v`.

   For direct instrumentation investigation, the underlying command is:

   ```text
   adb -s OWNED_EMULATOR shell am instrument -w -r -e documentScopeResourceId UUID io.github.quintond.orchestrator.phonecontrol.debug.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest
   ```

5. The host driver handles this step automatically. For direct instrumentation,
   when `PHONE_DOCUMENT_SCOPE_BIOMETRIC_READY replace` appears, wait until the
   actual system fingerprint prompt is active and inject emulator fingerprint
   1 once (`adb -s OWNED_EMULATOR emu finger touch 1`). This authenticates the
   production auth-per-use CryptoObject; the test never completes its consent
   future directly. No sensor input before the real prompt.
6. Require the final `PASS: 21 document scope assertions` and successful
   instrumentation completion. Independently compare the fixture sibling file
   and the target file with the exact authorized replacement. The probe ends
   with Stop and local document revocation, so reselect through the owner picker
   before another run.

The instrumented path checks exact read/revision, inventory withholding,
caller-URI rejection, an ungranted handle, stale revision, explicit owner denial,
complete reviewed text, real biometric replacement, fresh readback, and
responsive Stop/revoke during pending consent. The final no-write verifier holds
an owner-opened read descriptor across revocation; no remote endpoint receives it.

For the independent read-only authority case, select `target.txt` again through
the real owner picker and choose **Trust and allow read**. Run the host driver
with `--mode read-only`, that new resource UUID, and a new evidence file. This
mode expects exactly **11** assertions, zero READY markers and zero sensor
events. It enables the local replacement operation but requires the document's
read-only grant to reject replacement with `forbidden` before consent, verifies
unchanged target and sibling bytes, then Stops and revokes. Direct instrumentation
uses `-e probeMode document-read-only` alongside `documentScopeResourceId`.

Also inspect the actual picker and review with a long document in portrait and
landscape. Select `oversize.txt` and `malformed.txt` and require local rejection;
the binary and virtual fixture entries must not acquire a supported plaintext
grant. A read-only owner grant must reject replacement. Provider upgrade/name
changes, OS URI permission removal, and delayed/hung provider behavior remain
separate adversarial acceptance cases; JVM worker tests alone do not qualify
those real-provider scenarios.

SAF has no atomic CAS or account attestation. Acceptance must not describe this
adapter as account-enforced, immune to concurrent edits, or a transactional write
API. A timed-out write has an unknown outcome and must not be replayed.

## API references

- [Android document access and persisted URI permissions](https://developer.android.com/training/data-storage/shared/documents-files)
- [Document flags, MIME types, and document IDs](https://developer.android.com/reference/android/provider/DocumentsContract.Document)
- [Implementing a DocumentsProvider](https://developer.android.com/guide/topics/providers/create-document-provider)
