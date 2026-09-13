// Smoke-test the actual signed APK using native accessibility + real touch input, with debugging off.
import { _android as android } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { nativeControls } from "./native.mjs";
import { installedApkPath, installedReleaseIdentity, validateReleaseRetry } from "./release-evidence.mjs";

const serial = process.env.ANDROID_QA_SERIAL ?? "emulator-5562";
assert.match(serial, /^emulator-\d+$/);
const adb = path.join(process.env.ANDROID_HOME, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const run = (...args) => execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8", timeout: 60_000, windowsHide: true });
assert.equal(run("shell", "getprop", "ro.kernel.qemu").trim(), "1");
run("shell", "svc", "power", "stayon", "true");
run("shell", "input", "keyevent", "224");
run("shell", "wm", "dismiss-keyguard");
const apk = path.resolve("apps/android/app/build/outputs/apk/release/app-release.apk");
const pkg = "io.github.quintond.orchestrator";
const retryPath = process.env.ANDROID_RELEASE_RETRY;
const installed = run("shell", "pm", "list", "packages", pkg).split(/\r?\n/).includes(`package:${pkg}`);
assert.ok(retryPath ? installed : !installed, "Use a fresh emulator, or explicitly link a failed same-APK smoke with ANDROID_RELEASE_RETRY; preserve existing installations");
const output = path.resolve("test-results/android", `release-${serial}-${Date.now()}`);
await mkdir(output, { recursive: true });
const hash = value => createHash("sha256").update(value).digest("hex");
const apkSha256 = hash(await readFile(apk));
let retryOf, recovery, installationBefore, installationAfter;
if (retryPath) {
  const selected = path.resolve(retryPath);
  const previousFile = (await stat(selected)).isDirectory() ? path.join(selected, "results.json") : selected;
  const previousBytes = await readFile(previousFile);
  assert.ok(previousBytes.length <= 65536, "Retry evidence is bounded");
  const prior = JSON.parse(previousBytes);
  const installedCopy = path.join(output, "retained-installed.apk");
  run("pull", installedApkPath(run("shell", "pm", "path", pkg)), installedCopy);
  installationBefore = installedReleaseIdentity(run("shell", "dumpsys", "package", pkg));
  recovery = validateReleaseRetry(prior, { serial, apkSha256, installedSha256: hash(await readFile(installedCopy)), installation: installationBefore });
  retryOf = { path: previousFile, sha256: hash(previousBytes) };
  console.log("RECOVERY Explicit failed-run retry; identical installed APK retained without reinstall or data reset.");
}
const startGateway = () => spawn(process.execPath, ["apps/server/dist/server.js"], {
  env: { ...process.env, NODE_ENV: "production", ORCHESTRATOR_HOST: "127.0.0.1", ORCHESTRATOR_PORT: "4480", ORCHESTRATOR_DEMO: "0", ORCHESTRATOR_DATA_DIR: path.join(output, "gateway"), ORCHESTRATOR_ALLOWED_ORIGINS: "http://127.0.0.1:4480" }, stdio: "ignore",
});
let child = startGateway();
let device;
let passed = false;
let stage = "gateway-startup";
try {
  await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:4480/healthz")).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  assert.equal((await fetch("http://127.0.0.1:4480/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Release tester", password: "release-test-only-2026" }) })).status, 201);
  if (!retryPath) run("install", "-r", apk);
  installationBefore ??= installedReleaseIdentity(run("shell", "dumpsys", "package", pkg));
  stage = "gateway-address";
  run("reverse", "tcp:4480", "tcp:4480");
  const devices = await android.devices({ omitDriverInstall: true });
  await Promise.all(devices.filter(item => item.serial() !== serial).map(item => item.close()));
  device = devices.find(item => item.serial() === serial);
  const ui = nativeControls(() => device);
  if (retryPath) await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  if (recovery?.resumedAt !== "private-login") {
    await ui.wait({ desc: "Gateway address" });
    await device.screenshot({ path: path.join(output, "01-release-setup.png") });
    await ui.fill({ desc: "Gateway address" }, "http://127.0.0.1:4480");
    await ui.tap({ text: "Connect to gateway" });
  }
  stage = "private-login";
  await ui.wait({ desc: "Connected gateway http://127.0.0.1:4480" });
  await ui.wait({ text: "Unlock Orchestrator" });
  await device.screenshot({ path: path.join(output, "02-release-login.png") });
  // Password accessibility values are intentionally masked. Submit the fixed
  // synthetic passphrase once and verify the authenticated portal postcondition.
  await ui.tap({ clazz: "android.widget.EditText" });
  await expect.poll(() => ui.keyboardShown(), { timeout: 20000 }).toBe(true);
  await device.shell("input keycombination 113 29");
  await device.shell("input text release-test-only-2026");
  await ui.hideKeyboard();
  await ui.tap({ text: "Continue" });
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  stage = "navigation-and-session";
  const inspectionExposed = device.webViews().some(view => view.pkg() === pkg);
  if (inspectionExposed) {
    // WebView 113's SharedStatics intentionally ignores disable requests on userdebug Android.
    // https://github.com/chromium/chromium/blob/113.0.5672.136/android_webview/glue/java/src/com/android/webview/chromium/SharedStatics.java
    assert.equal(run("shell", "getprop", "ro.debuggable").trim(), "1", "A production OS must not expose release WebView debugging");
    console.log("NOTE: This userdebug emulator forces WebView inspection; the APK manifest is still non-debuggable.");
  }
  const packageDump = run("shell", "dumpsys", "package", pkg);
  assert.ok(!/flags=\[.*DEBUGGABLE/.test(packageDump));
  await device.screenshot({ path: path.join(output, "03-release-private-portal.png") });
  await ui.tap({ text: "Work", clazz: "android.widget.Button" });
  await ui.wait({ text: "Projects and recurring work." });
  await device.screenshot({ path: path.join(output, "04-release-work.png") });
  await ui.key("Back");
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  await ui.background(pkg);
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  console.log(`PASS Signed APK: ${retryPath ? "retained-installation recovery" : "install"}, private login, navigation, Back and persisted session; non-debuggable manifest`);
  stage = "offline-recovery";
  child.kill();
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true);
  await ui.tap({ text: "Gateway", clazz: "android.widget.Button" });
  await ui.tap({ res: "android:id/button1", text: /^Reload portal$/i });
  await ui.wait({ text: /The gateway is unavailable/ });
  await device.screenshot({ path: path.join(output, "05-release-offline.png") });
  child = startGateway();
  await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:4480/healthz")).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  await ui.tap({ text: "Connect to gateway" });
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  console.log("PASS Signed APK: offline recovery");
  installationAfter = installedReleaseIdentity(run("shell", "dumpsys", "package", pkg));
  assert.deepEqual(installationAfter, installationBefore, "Smoke must preserve the exact Android installation identity");
  assert.equal(hash(await readFile(apk)), apkSha256, "Candidate APK bytes must remain unchanged during smoke");
  stage = "complete";
  passed = true;
} finally {
  if (device) {
    if (!passed) await device.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    await device.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ serial, passed, apkSha256, stage, ...(retryOf ? { retryOf, recovery } : {}), installationBefore, installationAfter }, null, 2));
  try { run("reverse", "--remove", "tcp:4480"); } catch {}
  child.kill();
  console.log(`Release evidence: ${output}`);
}
