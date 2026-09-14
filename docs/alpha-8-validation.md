# Alpha 8 resource-permission validation

Prepared 14 September 2026. This is release preparation, not a published release
or final artifact acceptance. Alpha 7 remains the published download until the
post-merge workflows, fresh signed builds, complete upgrades and manifest gate
pass for the same clean commit.

The portal is `0.1.0-alpha.8`; its Android gateway retains
`io.github.quintond.orchestrator` and advances from code 9 to 10. The separate
Phone Control companion advances from `0.1.0-alpha.2` / code 2 to
`0.1.0-alpha.3` / code 3, retaining its application and signing identities.
The standalone broker advances to `0.1.0-alpha.2`. Both upgrade baselines are
the exact published artifacts from the portal alpha 7 release. Earlier alpha 1
companion proofs remain historical evidence.

## Changed behavior

New resource grants default to creation of plaintext draft files in an
owner-selected folder. Each creation requires review of the folder, provider,
generated filename and complete text, followed by strong biometrics. Exact
document read and replacement are an advanced mode. Existing grants remain
unchanged. Resources and effects intersect across the phone, broker session,
source credential and task; a refused resource action has no generic screen
control fallback.

Document text is excluded from durable broker receipts, audits and replay
caches. Reads require fresh authorization. Mutations retain action budgets,
Stop behavior and uncertainty when a provider effect may have begun. These
features are available through the broker, CLI/MCP, SDK and portal. See the
[resource contract](phone-control-resource-permissions.md) for exact boundaries.

## Local evidence

The feature preparation recorded 160 broker tests, 251 workspace tests,
54 focused desktop/mobile browser cases, 96 JVM tests and 41 Python driver
tests passing. These are local working-source checks, not final tagged artifact
qualification. The release preparation additionally verified the application,
companion and broker source versions, lockfile and increasing Android identities
with `npm run release:check`; all 114 tests in `npm run release:test` and all
21 focused CLI/MCP client tests passed. Release tests cover current distribution versions,
version-report mismatches, inventories, archive paths, source binding, signed
upgrade evidence, SBOM integrity and record preservation.

Final pre-PR QA passed 160 broker tests, all 251 workspace tests, and the full
browser suite (179 passed; three existing desktop-only visual cases skipped on
mobile). All 56 phone browser cases ran, including a new regression for switching
between disjoint document sessions. Independent review found and corrected
stale document selection in that transition; private text and review state now
reset with the device/session/task binding. Windows desktop packaging and launch
smoke passed. The real container isolation check, 107 phone harness tests,
standalone package checks and license boundaries also passed.

The folder adapter's live synthetic-provider acceptance passed three modes with
19 assertions each on the enrolled Android 16 QPR2 emulator. The full case
created one matching draft; both alias cases reported uncertainty while
independent host reads confirmed existing target and sibling bytes were
unchanged. Each run used the real owner picker and one real emulator biometric
event. Evidence, source digests, the earlier failed harness-count attempt and
the inspected screenshot are recorded in
[folder acceptance](../apps/phone-android/FOLDER_SCOPE_QA.md).
The [document QA procedure](../apps/phone-android/DOCUMENT_SCOPE_QA.md) distinguishes
performed engineering evidence from remaining provider and device cases.

## Release gates still required

- Merge reviewed source and require successful General CI, Desktop gateway and
  Phone Control workflows for the same clean `main` commit.
- Build fresh signed gateway alpha 8 and companion alpha 3 APKs from that commit;
  retain the original signing keys, application IDs, settings and user data.
- Perform complete gateway/desktop alpha 7-to-8 and companion alpha 2-to-3
  in-place upgrades using the exact release candidates and published baselines.
  Earlier working-source proofs or verifier continuations do not qualify.
- Stage all six CI desktop archives, both new APKs and broker alpha 2, then run
  the SBOM and manifest gates against the matching workflow artifacts and full
  upgrade evidence. Publish the nine distributions and three metadata files only
  after those checks pass. Record the resulting commit, runs and evidence in the
  published manifest and release notes.

## Limits

This feature remains alpha. Live folder-provider acceptance is limited to the
synthetic provider on QPR2; Android 14/15 folder acceptance, physical phones,
OEM/storage providers, external URI revocation, provider upgrades, concurrent
writers and crash recovery remain unqualified. Worker tests cover blocked-I/O
coordination; they are not a live blocked-provider acceptance run.

Android grants broader tree access to the companion than the adapter exposes.
The owner must trust the selected provider's storage and descriptor identities.
Alias fixtures demonstrate detection of the tested behaviors, not safety against
every dishonest provider. Providers may synchronize files independently; a
`.draft.txt` file is not an email-account draft. No account enforcement,
universal non-destructive guarantee or independent task-outcome verification is
claimed.
