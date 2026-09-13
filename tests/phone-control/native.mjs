import { readEmulatorEvidence } from "./device-evidence.mjs";
// This runner replaces synthetic grants, so it refuses physical or unnamed AVDs.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { once } from "node:events";
import { cleanupSteps, safeFailure, stopChild, within } from "./runner-cleanup.mjs";
import { parseNativeResult } from "./native-result.mjs";
import { createAdbTransportEvidence } from "./adb-transport-evidence.mjs";
import { parseInstallEvidence } from "./install-evidence.mjs";
import { requireServiceState, waitForNativeServiceRemoval, nativeRemovalFailureFacts } from "./native-force-stop.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serial = process.env.PHONE_QA_SERIAL ?? "emulator-5570";
assert.match(serial, /^emulator-\d+$/);
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { cwd: root, encoding: "utf8", timeout: 30000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
const platform = readEmulatorEvidence(adb);
const apiLevel = platform.sdk;
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const component = `${pkg}/io.github.quintond.orchestrator.phonecontrol.PhoneService`;
const output = join(root, "test-results/phone-control", `native-${Date.now()}`);
mkdirSync(output, { recursive: true });
const cleanupAdb = (...args) => execFileSync("adb", ["-s", serial, ...args], { cwd: root, encoding: "utf8", timeout: 10000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
const readNativeSetting = (timeout) => spawnSync("adb", ["-s", serial, "shell", "settings", "get", "secure", "enabled_accessibility_services"], { cwd: root, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 4096, stdio: ["ignore", "pipe", "pipe"] });
let nativeServiceEnabledBeforeStop = null;
let nativeForceStopSucceeded = false;
let nativeStopRemoval = null;
let result = "";
const adbTransport = createAdbTransportEvidence();
let child;
let childClosed = false;
let code;
let failure;
let cleanup = [];
let stage = "install synthetic APKs";
let oversizedOutput = false;
const installs = [];
try {
  for (const [role, apk] of [
    ["companion", "app/build/outputs/apk/debug/app-debug.apk"],
    ["fixture", "fixture/build/outputs/apk/debug/fixture-debug.apk"],
    ["instrumentation", "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"],
  ]) {
    const apkPath = join(root, "apps/phone-android", apk);
    const started = performance.now();
    const installed = spawnSync("adb", ["-s", serial, "install", "-r", apkPath], { cwd: root, encoding: "utf8", timeout: 30000, windowsHide: true, maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"] });
    const evidence = parseInstallEvidence({ role, apkPath, elapsedMs: Math.round(performance.now() - started), exitCode: installed.status, signal: installed.signal, commandSucceeded: !installed.error, stdout: installed.stdout, stderr: installed.stderr });
    installs.push(evidence);
    assert.equal(evidence.passed, true, "Synthetic APK installation must succeed before continuing");
  }
  stage = "verify emulator credential storage is unlocked";
  assert.match(adb("shell", "run-as", pkg, "id"), /^uid=/, "Unlock the enrolled disposable emulator before instrumentation");
  stage = "prepare fixture permissions";
  // SmokeTest owns the disable acknowledgement and enable sequence after instrumentation starts.
  adb("shell", "pm", "grant", pkg, "android.permission.POST_NOTIFICATIONS");
  adb("shell", "svc", "power", "stayon", "true");
  adb("shell", "input", "keyevent", "224");
  adb("shell", "wm", "dismiss-keyguard");
  stage = "native instrumentation";
  child = spawn("adb", ["-s", serial, "shell", "am", "instrument", "-w", "-r", `${pkg}.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest`], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    if (result.length + chunk.length > 1024 * 1024) { oversizedOutput = true; child.kill(); return; }
    result += chunk;
  });
  child.stderr.on("data", (chunk) => adbTransport.write(chunk));
  child.once("close", () => { childClosed = true; });
  [code] = await within(() => once(child, "close"), 180000);
} catch (error) {
  failure = { stage, ...safeFailure(error) };
  console.error(`FAIL ${stage} (${failure.error}; ${failure.code})`);
} finally {
  // Device instrumentation can outlive adb. Attempt every cleanup even when one fails.
  cleanup = await cleanupSteps([
    { name: "read native accessibility before force-stop", action: () => { nativeServiceEnabledBeforeStop = requireServiceState(readNativeSetting(2000), component); assert.equal(nativeServiceEnabledBeforeStop, true); } },
    { name: "stop native session", action: () => { cleanupAdb("shell", "am", "force-stop", pkg); nativeForceStopSucceeded = true; } },
    // PACKAGE_RESTARTED removes this enabled service under the accessibility lock.
    // Observe that transition before the next probe re-enables it; unrelated apps need no barrier.
    { name: "observe native accessibility removal", timeout: 35000, action: async () => {
      try { nativeStopRemoval = await waitForNativeServiceRemoval({ component, enabledBeforeStop: nativeServiceEnabledBeforeStop, stopSucceeded: nativeForceStopSucceeded, query: readNativeSetting }); }
      catch (error) { nativeStopRemoval = nativeRemovalFailureFacts(error); throw error; }
    } },
    { name: "remove native private probe files", action: () => cleanupAdb("shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop") },
    { name: "terminate owned instrumentation client", action: () => stopChild(child), timeout: 7000 },
  ]);
}
const parsed = parseNativeResult(result, code);
const { checks, diagnostics } = parsed;
const functionalPassed = !failure && !oversizedOutput && parsed.passed;
const passed = functionalPassed && cleanup.every((item) => item.passed);
for (const item of cleanup.filter((entry) => !entry.passed)) console.error(`FAIL cleanup: ${item.name} (${item.code})`);
try { writeFileSync(join(output, "results.json"), JSON.stringify({ serial, apiLevel, platform, passed, functionalPassed, checks, diagnostics, adbTransport: { ...adbTransport.finish(), streamClosed: childClosed }, installs, oversizedOutput, cleanup, forceStop: { enabledBeforeStop: nativeServiceEnabledBeforeStop, commandSucceeded: nativeForceStopSucceeded, removal: nativeStopRemoval }, ...(failure ? { failure } : {}), scope: "Synthetic fixture and emulator; physical acceptance not established" }, null, 2)); }
catch { console.error("FAIL cleanup: write safe QA evidence"); process.exitCode = 1; }
for (const check of checks) console.log(check);
console.log(JSON.stringify({ functionalPassed, diagnostics, oversizedOutput }));
console.log(`Evidence: ${output}`);
if (!passed) process.exitCode = 1;
if (process.exitCode) setTimeout(() => process.exit(1), 1000).unref();
