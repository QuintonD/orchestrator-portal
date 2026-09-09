# Android QA

For release upgrades, run `npm run test:upgrade` with a fresh dedicated emulator
selected through `ANDROID_QA_SERIAL`. Download the native desktop release identified
by `package.json`'s `orchestratorRelease.previousVersion` (alpha 3 for alpha 4), its
archive, signed APK and `SHA256SUMS.txt` into `test-results/release-assets/`, and
build the current desktop package and signed APK first. This test runs the actual
old launcher, creates synthetic records and phone settings, then upgrades both
programs without uninstalling or clearing app data. It refuses an emulator with
an existing Orchestrator package. Evidence stays in `test-results/upgrades/`;
only screenshots/results, never databases or keys, belong in published evidence.
The clean-install suites below do not substitute for this upgrade check.

After the full suite, `node tests/android/visual.mjs` captures the current gateway
build on that same disposable emulator in both themes. It starts a fresh synthetic
gateway on port 4461 and captures Portal, Reports, Connections and Assistants,
plus Assistant and Insights, including the mobile report-title width check.
It also checks icon theme persistence and animation, and captures the icon picker. It expects the debug app and
gateway origin prepared by `qa.mjs`. Keep `ANDROID_HOME` and, if needed,
`ANDROID_QA_SERIAL` set for both commands.

`qa.mjs` installs and clears only `io.github.quintond.orchestrator.debug` on the selected **emulator**. Physical-device serials are refused. It starts fresh private and synthetic gateways on ports 4460/4461, forwards those ports, exercises native onboarding and actual Android WebView journeys, then shuts down its gateways. No personal runtime or data directory is used.

Create a dedicated disposable AVD using an installed image, for example:

```sh
avdmanager create avd --name orchestrator-qa-api36 --package 'system-images;android-36;google_apis;x86_64' --device pixel_7
emulator -avd orchestrator-qa-api36 -port 5560 -no-snapshot -no-audio
npx playwright install android
npm run build
npm run android:build
npm run test:android
```

On Windows, use `avdmanager.bat` and `emulator.exe` from the SDK. The default serial is `emulator-5560`; set `ANDROID_QA_SERIAL` for another disposable emulator. Run suites sequentially. QA keeps the emulator awake while plugged in and changes font scale, display dimensions and rotation, then restores display defaults in `finally`. It leaves the test app and synthetic examples installed. Do not use an AVD with personal configuration you want to preserve.

The suite covers secure-origin rejection, private setup/login/logout, normal session persistence, cookie isolation on gateway change, assistant setup, evidence review, native Back and dialog reopening, drafts, keyboard, rotation, conversation, councils, knowledge, narrow screens, larger text, navigation and offline recovery. It enables the software keyboard even when the emulator has a hardware keyboard configured, and disables stylus handwriting on the disposable emulator so the system tutorial cannot intercept test input. Screenshots and a JSON result record are written to `test-results/android/<serial>-<timestamp>`. Inspect the screenshots visually before approving a release; successful DOM assertions alone do not establish usability. Local gateway data in this directory is synthetic, but do not upload its databases as QA evidence.

The distribution APK has debugging disabled. Validate it separately with native accessibility controls on an emulator, verify its signature and manifest, and compare its behavior with the QA build. Published screenshots must contain only synthetic examples. A physical founder test and TalkBack review remain distinct from these automated checks.

Run `npm run test:android:release` for the signed APK smoke test (default `emulator-5562`, overridden by `ANDROID_QA_SERIAL`). It uses a fresh private gateway on port 4480, real native input, private login, navigation, session persistence and a stopped/restarted gateway. It records the tested APK's SHA-256 hash. Both suites clear only their own package on a disposable emulator.

Debug Android system images can force WebView inspection even for a non-debuggable app. Chromium explicitly ignores disable requests on those systems ([SharedStatics](https://github.com/chromium/chromium/blob/113.0.5672.136/android_webview/glue/java/src/com/android/webview/chromium/SharedStatics.java)). The smoke test reports that condition only when `ro.debuggable=1`; the APK's non-debuggable manifest is still checked. A production OS must not expose the release WebView. Confirm this on the founder's stock physical phone before store release.
