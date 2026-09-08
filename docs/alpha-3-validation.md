# Alpha 3 release validation — 8 September 2026

The corrective branch starts at `7525bc3`, including the latest interface from PR #14 and all prepared-team/personal-workflow changes from PR #11. Application changes are limited to version/display labels and Android build provenance. Stored identifiers, schemas, encryption, application ID and workspace paths are unchanged. Historical beta-labelled records retain their original evidence.

## Local CI and QA before the PR

| Check | Result |
| --- | --- |
| `npm run check` | Type checks and 101 tests passed: 97 server, 2 web, 2 contracts |
| `npm run build` | Production build passed |
| `npm run test:e2e` | 75 passed; 3 skipped for desktop/mobile applicability |
| `npm run desktop:test` | 4 packaging/path tests passed |
| `npm run desktop:package` and `npm run desktop:smoke` | Windows x64 archive passed native launcher, file/checksum, data persistence, occupied-port/forged-identity, lock and configuration checks |
| Android release/debug builds | Native unit tests and lint passed; signed APK certificate matches published alpha 2 |
| `npm run test:android` | 13 emulator API 36 journeys passed, including authentication, persistence, keyboard/rotation, picker imports, large-text navigation, prepared teams, nested Back, linked decisions and offline recovery |
| `npm run test:upgrade` | Published alpha 2 Windows gateway and signed APK upgraded to the alpha 3 candidate; no uninstall or data clear |
| Visual inspection | Actual upgraded desktop and signed Android screenshots reviewed; latest monochrome interface, retained records and prepared local brief visible |
| Adversarial review | Independent review of persistence, release workflow and new scripts; findings addressed below |
| `npm run release:check`, syntax and diff checks | Passed; application/lockfile/gateway/Android identities agree; prior tagged Android version codes are lower |

Upgrade fixtures retained the encryption key, encrypted connection/message, knowledge document, project/progress, custom paused assistant, reviewed report/correction, watch and dashboard arrangement. Original rows were compared byte-for-byte after shutdown, SQLite integrity checked, and preserved records read through the new APIs. Desktop session/theme and phone origin/session survived. Android retained `firstInstallTime`, advanced from version code 2 to 5, and remained non-debuggable. Exactly one automatic Compass was added without replacing the existing assistant.

Local evidence: `test-results/android/emulator-5560-1788862048550/` and `test-results/upgrades/alpha-DrWDnj/`. These contain synthetic workspaces; databases and keys are not published. The release manifest carries the final artifact hashes and exact successful CI run URLs. After merge, repeat the signed build and actual upgrade using the final commit's desktop artifact and APK; candidate evidence alone does not authorize substituting pre-merge binaries.

## Review findings addressed

- Existing signed smoke tests clear test data and do not prove upgrade preservation. A separate test installs the old signed APK, populates state, then uses `adb install -r` with no clearing or uninstalling. Failed pre-upgrade fixtures can be explicitly retried only while the previous alpha 2 version remains installed; this does not reset the phone.
- New test scaffolding initially used a transient screen title, incorrect fixture field names and an incorrect API response shape. These were corrected against the actual implementation before obtaining the passing result. Cleanup is bounded and records failures.
- Adjacent checksums alone do not establish artifact provenance. Release assembly downloads the specified successful desktop run and compares actual bytes, checks signed APK identity and embedded source revision, and requires successful upgrade evidence tied to the staged binary hashes.
- Gradle's default VCS metadata does not recognize this git worktree. The Android build entry point now embeds the actual commit, dirty-tree flag and variant; publication rejects a dirty or wrong-commit build.
- A fixed minimum Android version code would eventually allow a non-upgrading release. The version check also compares prior alpha tags, with full history fetched in CI; final assembly compares the actual old and new signed APKs.

## Scope and remaining limits

Windows x64 cross-version upgrade and API 36 emulator upgrade are directly exercised locally. The release requires the six native desktop packaging/smoke jobs, application/browser CI, Android emulator CI, Docker build and CodeQL to pass on the final main commit. Other desktop operating systems receive native packaging/smoke checks; cross-version data preservation is not separately exercised on those systems. No physical phone, TalkBack, real provider credentials, financial accounts or production runtime acceptance is claimed. These remain alpha limitations, not reasons to describe this work as beta.
