// Smoke-test the actual signed APK using native accessibility + real touch input, with debugging off.
import { _android as android } from "playwright";
import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { nativeControls } from "./native.mjs";

const serial = process.env.ANDROID_QA_SERIAL ?? "emulator-5562";
assert.match(serial, /^emulator-\d+$/);
const adb = path.join(process.env.ANDROID_HOME, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const run = (...args) => execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" });
assert.equal(run("shell", "getprop", "ro.kernel.qemu").trim(), "1");
run("shell", "svc", "power", "stayon", "true");
run("shell", "input", "keyevent", "224");
run("shell", "wm", "dismiss-keyguard");
const apk = path.resolve("apps/android/app/build/outputs/apk/release/app-release.apk");
const pkg = "io.github.quintond.orchestrator";
const output = path.resolve("test-results/android", `release-${serial}-${Date.now()}`);
await mkdir(output, { recursive: true });
const startGateway = () => spawn(process.execPath, ["apps/server/dist/server.js"], {
  env: { ...process.env, NODE_ENV: "production", ORCHESTRATOR_HOST: "127.0.0.1", ORCHESTRATOR_PORT: "4480", ORCHESTRATOR_DEMO: "0", ORCHESTRATOR_DATA_DIR: path.join(output, "gateway"), ORCHESTRATOR_ALLOWED_ORIGINS: "http://127.0.0.1:4480" }, stdio: "ignore",
});
let child = startGateway();
let device;
let passed = false;
try {
  await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:4480/healthz")).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  assert.equal((await fetch("http://127.0.0.1:4480/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Release tester", password: "release-test-only-2026" }) })).status, 201);
  run("install", "-r", apk);
  run("shell", "pm", "clear", pkg);
  run("reverse", "tcp:4480", "tcp:4480");
  const devices = await android.devices({ omitDriverInstall: true });
  await Promise.all(devices.filter(item => item.serial() !== serial).map(item => item.close()));
  device = devices.find(item => item.serial() === serial);
  const ui = nativeControls(() => device);
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  await ui.wait({ desc: "Gateway address" });
  await device.screenshot({ path: path.join(output, "01-release-setup.png") });
  await ui.fill({ desc: "Gateway address" }, "http://127.0.0.1:4480");
  await ui.tap({ text: "Connect to gateway" });
  await ui.wait({ text: "Unlock Orchestrator" });
  await device.screenshot({ path: path.join(output, "02-release-login.png") });
  await ui.fill({ clazz: "android.widget.EditText" }, "release-test-only-2026");
  await ui.hideKeyboard();
  await ui.tap({ text: "Continue" });
  await ui.wait({ text: "Your workspace is ready" });
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
  await ui.wait({ text: "A legible view of projects and routines, regardless of which runtime executes them." });
  await device.screenshot({ path: path.join(output, "04-release-work.png") });
  await ui.key("Back");
  await ui.wait({ text: "Your workspace is ready" });
  await ui.background(pkg);
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  await ui.wait({ text: "Your workspace is ready" });
  console.log("PASS Signed APK: install, private login, navigation, Back and persisted session; non-debuggable manifest");
  child.kill();
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true);
  await ui.tap({ text: "Gateway", clazz: "android.widget.Button" });
  await ui.tap({ res: "android:id/button1" });
  await ui.wait({ text: /The gateway is unavailable/ });
  await device.screenshot({ path: path.join(output, "05-release-offline.png") });
  child = startGateway();
  await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:4480/healthz")).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  await ui.tap({ text: "Connect to gateway" });
  await ui.wait({ text: "Your workspace is ready" });
  console.log("PASS Signed APK: offline recovery");
  passed = true;
} finally {
  if (device) {
    if (!passed) await device.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    await device.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ serial, passed, apkSha256: createHash("sha256").update(await readFile(apk)).digest("hex") }, null, 2));
  try { run("reverse", "--remove", "tcp:4480"); } catch {}
  child.kill();
  console.log(`Release evidence: ${output}`);
}
