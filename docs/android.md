# Android alpha

The Android app is a private gateway client. Install it on your phone and run the Orchestrator gateway on your computer. The computer holds your workspace and connects to assistant runtimes; it must remain running and reachable. The phone does not run OpenClaw, Hermes, or a Node server.

This is a signed APK for direct testing, not a Google Play release. No Apple App Store or Google Play submission is authorized until the project owner explicitly approves it.

The [Android QA record](android-qa.md) includes test coverage, visual evidence and the remaining physical-device acceptance checks.

## Install the APK

1. Download `orchestrator-0.1.0-alpha.3.apk` from the repository's [Android alpha release](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.3).
2. Open the download on your Android phone. Allow installation from that browser or file manager when Android asks, then install **Orchestrator Alpha**. You can turn that installation permission off afterward.
3. Follow either USB or private HTTPS setup below. Android 8.0/API 26 or later and an updated Android System WebView are required.

The published APK has debugging disabled and is signed with a dedicated alpha key. An update signed with the same key preserves the app's connection settings. Uninstalling clears phone-local app data; your gateway workspace stays on the computer. Verify the APK with the SHA-256 file attached to the release if desired.

## Start the gateway on your computer

Download and extract the [desktop gateway bundle](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.3) for Windows, macOS or Linux. Open its launcher and create a workspace in the browser. Keep the launcher running; your phone uses the same workspace and passphrase. No Node, Git or build commands are needed. See the [desktop guide](desktop.md) for workspace locations and upgrades.

For a source checkout instead, install Node.js 24 or newer and Git, then run:

```sh
git clone https://github.com/QuintonD/orchestrator-portal.git
cd orchestrator-portal
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4400` on the computer and create a workspace with a passphrase of at least 12 characters. Leave the terminal running. The phone uses that same passphrase and workspace. Your data defaults to `apps/server/data` when started by this npm command. Keep that directory and its encryption key private and back them up together while the server is stopped.

To try synthetic examples first, run this from the repository root in PowerShell instead of `npm start`:

```powershell
$env:ORCHESTRATOR_DEMO = '1'
npm start
```

The interface labels this as demo mode; it does not dispatch real assistant work. Stop the process, run `Remove-Item Env:ORCHESTRATOR_DEMO`, then `npm start` to return to your separate private workspace. Never set both modes to the same data directory.

## Option A: USB testing

This is the shortest path and needs no remote hosting or TLS certificate.

1. Install Google's [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) on the computer. Add its `platform-tools` directory to PATH, or run the following commands from that directory (`.\adb.exe` instead of `adb` on Windows).
2. Enable Developer options and USB debugging on the phone. Connect it by USB and accept the computer's debugging prompt.
3. Check the connection and forward the gateway port:

   ```sh
   adb devices
   adb reverse tcp:4400 tcp:4400
   ```

4. Open Orchestrator Alpha. Enter **`http://127.0.0.1:4400`** as the gateway address and tap **Connect to gateway**. Sign in with your workspace passphrase.

Here, `127.0.0.1` reaches the computer through USB forwarding. Do not enter your computer's LAN IP. Repeat `adb reverse` after reconnecting USB or restarting the device. With multiple devices, use `adb -s DEVICE_SERIAL reverse tcp:4400 tcp:4400`.

Alternatively, install from your computer with `adb install -r orchestrator-0.1.0-alpha.3.apk`.

## Option B: Private HTTPS for wireless use

Install Tailscale on both devices and join the same tailnet. On the computer:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:4400
```

Use the actual HTTPS address printed by Tailscale. Restart the gateway with that address in its allowed origins. For example, in PowerShell:

```powershell
$env:ORCHESTRATOR_ALLOWED_ORIGINS = 'http://127.0.0.1:4400,http://localhost:4400,https://YOUR-COMPUTER.YOUR-TAILNET.ts.net'
.\Orchestrator.cmd
```

Run the command from the extracted Windows bundle folder. On macOS/Linux, set the same environment variable and run `./orchestrator`; for a source checkout use `npm start`.

Enter the exact HTTPS origin, without a path, in the Android app. Tailscale must stay connected on the phone. Keep the gateway bound to loopback; use **Serve**, not public Funnel. See [deployment](deployment.md) for gateway configuration. Do not expose the gateway to the public internet for this alpha.

## First testing session

Start with the demo to exercise the interface. Then use your private workspace:

1. Open the menu → **Connections** and add your configured runtime. Paths and CLI commands refer to the computer running the gateway. Check the [integration matrix](alpha.md#integration-matrix) before choosing a connector.
2. Open **Assistant**, send a harmless question, and check the returned receipt. Source runtime restrictions and provider billing still apply.
3. In **Assistants**, create a profile with a clear purpose and success criteria. Confirm restrictions in the runtime, request a report, inspect its evidence, and mark it useful or disputed.
4. Test a draft with the keyboard open, rotate the device, navigate using Android Back, then close and reopen the app.
5. Disconnect the gateway and check the recovery path. **Gateway → Reload portal** clears unsent drafts; it does not resend work or stop source-owned tasks.

Record your phone model, Android/WebView version, steps, expected result and actual result for bugs. Use synthetic examples in public issues and redact screenshots. A review marked useful is still not independently verified completion.

## Recovery and local data

- **Cannot connect:** check that the computer is awake, `http://127.0.0.1:4400/healthz` returns status `ok` on it, and USB forwarding or Tailscale is active.
- **Origin is not allowed:** add the exact private HTTPS origin to `ORCHESTRATOR_ALLOWED_ORIGINS`, then restart the gateway.
- **Certificate error:** repair the HTTPS certificate or private network configuration. The app cannot bypass certificate errors.
- **Change computer:** use **Gateway → Connection settings**. Successfully changing the address clears the previous gateway's cookies and cached portal data on the phone.
- **Sign out:** use the portal's **Settings → Sign out** to revoke that session. **Forget this gateway** clears phone-local cookies, cache and the remembered address, but does not revoke a server-side session by itself.
- **Offline:** there is no offline workspace or queued dispatch. Running work belongs to the gateway and source runtime. Reconnect to inspect it.
- Grok Bot results use the same document picker and accept `.json` or `.txt` up to 100 KB. Preview and confirm before importing; results remain claims.
- Text attachments use Android's document picker. Select `.txt`, `.md` or `.csv` files up to 12 KB. The web form previews the selection before sending.

The app requests only internet access. It has no native JavaScript bridge, analytics SDK, push service, background runtime, or broad storage permission. It uses same-origin gateway authentication and refuses cleartext except exact loopback addresses for USB. Android backup/device transfer excludes app data. Avoid sensitive-data use until the broader retention/deletion and live integration checks in the [alpha guide](alpha.md) are complete.

## Build and test from source

Install JDK 17 or 21, Android SDK platform 36, build tools 35.0.0 or newer, platform tools, and an Android emulator. Set `JAVA_HOME` and `ANDROID_HOME`.

```sh
npm ci
npm run build
npm run android:build
npm run check
npm run test:e2e
npx playwright install android
# Start a disposable emulator first; see tests/android/README.md.
npm run test:android
```

The debug APK is `apps/android/app/build/outputs/apk/debug/app-debug.apk`, with a separate `.debug` application ID. It enables WebView inspection for QA and is not the published distribution.

For a signed distribution, provide an external keystore with alias `orchestrator-alpha`, set `ORCHESTRATOR_ANDROID_KEYSTORE` and `ORCHESTRATOR_ANDROID_KEY_PASSWORD`, then run `npm run android:build -- release`. The output is `apps/android/app/build/outputs/apk/release/app-release.apk`. Never commit keys or passwords. The initial alpha signer is stored on the maintainer's computer under `%LOCALAPPDATA%/Orchestrator/signing`; back up that directory securely to preserve update compatibility. Store release signing will be planned separately.

## Before either store submission

Owner approval remains a required final gate. This APK is only the founder-testing stage. Before Google Play: finish real-device and live-runtime acceptance, retention/deletion controls, accessibility testing with TalkBack, privacy policy and Data safety disclosures, production signing/App Bundles, store listing and reviewer access, and any testing requirements applicable to the developer account. Before Apple: build and test a separate iOS client and complete Apple's privacy, signing, review-access and functionality requirements. Neither platform's approval is implied by Android QA. Recheck current store policies at submission time.
