import { readEmulatorEvidence } from "./device-evidence.mjs";
// This runner replaces synthetic grants, so it refuses physical or unnamed AVDs.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { once } from "node:events";
import { cleanupSteps, safeFailure, stopChild, within } from "./runner-cleanup.mjs";
import { parseNativeResult } from "./native-result.mjs";

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
let result = "";
let child;
let code;
let failure;
let cleanup = [];
let stage = "install synthetic APKs";
let oversizedOutput = false;
try {
  for (const apk of [
    "app/build/outputs/apk/debug/app-debug.apk",
    "fixture/build/outputs/apk/debug/fixture-debug.apk",
    "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
  ]) adb("install", "-r", join(root, "apps/phone-android", apk));
  stage = "verify emulator credential storage is unlocked";
  assert.match(adb("shell", "run-as", pkg, "id"), /^uid=/, "Unlock the enrolled disposable emulator before instrumentation");
  stage = "enable disposable emulator fixture session";
  adb("shell", "settings", "put", "secure", "enabled_accessibility_services", component);
  adb("shell", "settings", "put", "secure", "accessibility_enabled", "1");
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
  child.stderr.resume();
  [code] = await within(() => once(child, "close"), 180000);
} catch (error) {
  failure = { stage, ...safeFailure(error) };
  console.error(`FAIL ${stage} (${failure.error}; ${failure.code})`);
} finally {
  // Device instrumentation can outlive adb. Attempt every cleanup even when one fails.
  cleanup = await cleanupSteps([
    { name: "stop native session", action: () => cleanupAdb("shell", "am", "force-stop", pkg) },
    { name: "remove native private probe files", action: () => cleanupAdb("shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop") },
    { name: "terminate owned instrumentation client", action: () => stopChild(child), timeout: 7000 },
  ]);
}
const parsed = parseNativeResult(result, code);
const { checks, diagnostics } = parsed;
const functionalPassed = !failure && !oversizedOutput && parsed.passed;
const passed = functionalPassed && cleanup.every((item) => item.passed);
for (const item of cleanup.filter((entry) => !entry.passed)) console.error(`FAIL cleanup: ${item.name} (${item.code})`);
try { writeFileSync(join(output, "results.json"), JSON.stringify({ serial, apiLevel, platform, passed, functionalPassed, checks, diagnostics, oversizedOutput, cleanup, ...(failure ? { failure } : {}), scope: "Synthetic fixture and emulator; physical acceptance not established" }, null, 2)); }
catch { console.error("FAIL cleanup: write safe QA evidence"); process.exitCode = 1; }
for (const check of checks) console.log(check);
console.log(JSON.stringify({ functionalPassed, diagnostics, oversizedOutput }));
console.log(`Evidence: ${output}`);
if (!passed) process.exitCode = 1;
if (process.exitCode) setTimeout(() => process.exit(1), 1000).unref();
