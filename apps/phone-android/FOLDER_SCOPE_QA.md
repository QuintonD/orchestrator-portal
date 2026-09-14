# Folder draft adapter acceptance: 2026-09-14

`android.folder-drafts.v1` adds owner-picked folders and the single `draft.create`
effect without changing existing exact-document grants. The native filename is
a fresh UUID with `.draft.txt`; every creation requires complete local review
and strong biometric authorization. The result is verified before success.

## Checks executed

- `:app:testDebugUnitTest`: 96 tests, zero failures/errors. Five new metadata
  safety tests cover unique creation, old-ID aliases, changed/missing metadata,
  wrong types/names, duplicate listing IDs, collisions, and bounded capacity.
  Existing `DocumentWork` tests cover abandonment, write-state uncertainty, and
  serialization while a timed-out provider still holds its worker slot.
- `:app:assembleDebug`, `:app:assembleDebugAndroidTest`,
  `:fixture:assembleDebug`, `:app:lintDebug`, `:fixture:lintDebug`: passed.
  The initial fixture lint failure on ignored synchronous preference commit was
  fixed with `apply()` for fixture alias metadata before the successful build.
- `python scripts/test_folder_scope_probe.py`: three protocol tests passed,
  including duplicate/missing biometric markers and wrong assertion summaries.
- Real emulator acceptance: `folder-full`, `folder-alias`, and `folder-alias-new`
  each passed 19 assertions with exactly one real emulator fingerprint event.
  Each used the Android tree picker, Android broad-folder Allow dialog, and
  explicit companion provider trust dialog; no grant preferences were seeded.

The acceptance modes reject caller filenames, guessed handles, document reads
and replacements using folder handles, and denied reviews. They verify full
folder/provider/filename/text review, Stop and revoke during pending consent,
removal of local authority, and prompt Stop response. Full mode creates exactly
one matching 58-byte draft. The two malicious fixtures return an existing ID or
a fresh ID backed by an existing nonempty target, respectively; both produce
`unknown_action_state` without truncating or writing the existing target.
Independent host reads verify target (84 bytes) and sibling (45 bytes) remain
byte-for-byte unchanged in every mode and that the actual draft directory adds
one matching file in full mode and none in alias modes. Existing drafts remain
unchanged; nothing is deleted for rollback.

## Evidence and environment

To reproduce, build and install the companion, instrumentation and synthetic
fixture on the dedicated enrolled emulator. In the companion choose **Select a
folder for new drafts**, select the fixture's `drafts` folder, accept Android's
folder access dialog, and review/accept the companion's provider trust dialog.
Copy the newly displayed resource UUID. Never seed the grant in preferences.
From the repository root, run one bounded attempt:

```powershell
python apps/phone-android/scripts/folder-scope-probe.py `
  --adb "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" `
  --serial emulator-5576 `
  --resource-id OWNER_SELECTED_FOLDER_UUID `
  --mode folder-full `
  --output NEW_EVIDENCE_FILE.json
```

The driver verifies the owned emulator, installed APK identities and synthetic
fixture bytes before instrumentation. It waits for actual biometric readiness
before delivering one synthetic sensor event. For `folder-alias`, select the
fixture's `alias` folder; for `folder-alias-new`, select `alias-new`. Each mode
requires its own owner-selected grant and a new evidence filename. Successful
probes revoke that grant. Reinstalling the provider changes its pinned identity
and requires fresh selection. Do not run this on a physical phone or user AVD.

Only the owned `emulator-5576` AVD
`orchestrator-phone-control-api361-google-20260913` was used (Android 16 QPR2,
SDK 36.1). Existing data was retained and APKs installed with `-r`. The user
emulators were not used. Evidence is in
`D:\Orchestrator-Phone-Upgrade-QA\folder-scope-20260914`:

- `full-02.json`, `alias-01.json`, `alias-new-01.json` contain source/APK SHA-256,
  exact matching installed APKs, independent file hashes, protocol and cleanup.
- All three passed against working-source digest
  `1a004cfe7b768ed363cc8b8afc7b28e52ff12695abbd1ce06df644392495d6dd`.
- `picker-created-draft.png` was visually inspected. It shows the generated
  draft beside existing target and sibling in the native synthetic provider.
- `full-01.json` is retained as a failed harness attempt: expected count was 17
  but two real review-button assertions make the total 19. That attempt created
  one verified draft and preserved existing files, but the host rejected the
  unexpected summary. After fixing the count and adding regression coverage,
  a fresh owner picker grant and full attempt passed. The prior draft remains.

## Limits

This is synthetic-provider conformance evidence, not real-provider or minimum
SDK release qualification. No release or promotion was performed. Stop during
an actually blocked provider create/write is covered by worker-unit semantics,
not a blocked-provider emulator trial. Revocation cannot undo an already begun
provider effect; uncertainty is reported and the provider may still settle.

SAF providers retain authority over backing storage. Metadata, new-ID, empty
regular single-link descriptor and no-truncation checks cannot prove safety
against a lying provider or concurrent writer. A broad OS tree permission is
not an OS-enforced create-only capability. Provider synchronization and other
apps may publish or act on `.draft.txt` files independently. The grant and every
review explicitly disclose this trust boundary. No claim of universal
non-destructive behavior against arbitrary providers is made.
