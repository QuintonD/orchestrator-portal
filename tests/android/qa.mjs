// Real emulator + native controls + Chromium WebView. Never point this at a personal phone.
import { _android as android } from "playwright";
import { expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativeControls } from "./native.mjs";
const expect = baseExpect.configure({ timeout: 15000 });

const serial = process.env.ANDROID_QA_SERIAL ?? "emulator-5560";
assert.match(serial, /^emulator-\d+$/, "QA clears the app on an emulator; physical devices are refused");
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
assert.ok(sdk, "Set ANDROID_HOME to your Android SDK");
const adb = path.join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const adbRun = (...args) => execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" });
const pkg = "io.github.quintond.orchestrator.debug";
const output = path.resolve("test-results/android", `${serial}-${Date.now()}`);
await mkdir(output, { recursive: true });
const children = [];
const results = [];
let device;
let page;
const ui = nativeControls(() => device);
async function connectDevice() {
  const devices = await android.devices({ omitDriverInstall: true });
  await Promise.all(devices.filter(item => item.serial() !== serial).map(item => item.close()));
  return devices.find(item => item.serial() === serial);
}
async function gateway(port, demo) {
  const child = spawn(process.execPath, ["apps/server/dist/server.js"], {
    env: { ...process.env, NODE_ENV: "production", ORCHESTRATOR_HOST: "127.0.0.1", ORCHESTRATOR_PORT: String(port),
      ORCHESTRATOR_DEMO: demo ? "1" : "0", ORCHESTRATOR_DATA_DIR: path.join(output, `gateway-${port}`),
      ORCHESTRATOR_ALLOWED_ORIGINS: `http://127.0.0.1:${port}` }, stdio: "ignore",
  });
  children.push(child);
  await expect.poll(async () => {
    if (child.exitCode !== null) throw new Error(`QA gateway exited: ${child.exitCode}`);
    try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).status; } catch { return 0; }
  }, { timeout: 20000 }).toBe(200);
  adbRun("reverse", `tcp:${port}`, `tcp:${port}`);
}
async function shot(name) {
  // DOM assertions can precede the Android compositor presenting a new WebView frame.
  if (page && !page.isClosed()) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 250));
  await device.screenshot({ path: path.join(output, `${name}.png`) });
}
const nativeWait = ui.wait;
const nativeTap = ui.tap;
const nativeKey = ui.key;
const nativeFillAddress = value => ui.fill({ desc: "Gateway address" }, value);
async function step(name, run) {
  await run(); results.push(name); console.log(`PASS ${name}`);
}
async function attach(port = 4460) {
  // Playwright caches the first page for a WebView socket; replacing the native view keeps its PID.
  await device.close();
  device = await connectDevice();
  await expect.poll(async () => {
    try {
      const candidate = await (await device.webView({ pkg }, { timeout: 1500 })).page();
      if (candidate.isClosed() || !candidate.url().startsWith(`http://127.0.0.1:${port}/`)) return false;
      page = candidate;
      return true;
    } catch { return false; }
  }, { timeout: 45000 }).toBe(true);
  page.setDefaultTimeout(12000);
  return page;
}
async function noOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function displayProfile(largeText) {
  // Change emulator hardware between app launches. Multiple live density changes
  // can strand a CDP connection on a replaced WebView with the same process ID.
  await ui.background(pkg);
  await device.shell(`am force-stop ${pkg}`);
  await device.close();
  adbRun("shell", "settings", "put", "system", "font_scale", largeText ? "1.3" : "1.0");
  adbRun("shell", "wm", "size", largeText ? "900x1600" : "reset");
  adbRun("shell", "wm", "density", largeText ? "400" : "reset");
  device = await connectDevice();
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  await attach(4461);
  await expect(page.getByRole("heading", { level: 1, name: "Portal", exact: true })).toBeVisible();
}
async function navigate(name) {
  const label = new RegExp(`^${name}(?:\\s*\\d+)?$`);
  const mobile = page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("button", { name, exact: true });
  if (await mobile.isVisible()) await mobile.click();
  else if (await page.getByRole("button", { name: "Open navigation", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("complementary", { name: "All navigation" }).getByRole("button", { name: label }).click();
  } else await page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("button", { name, exact: true }).click();
}
try {
  assert.equal(adbRun("shell", "getprop", "ro.kernel.qemu").trim(), "1");
  adbRun("shell", "svc", "power", "stayon", "true");
  adbRun("shell", "input", "keyevent", "224");
  adbRun("shell", "wm", "dismiss-keyguard");
  adbRun("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1");
  // Avoid the system keyboard's stylus tutorial intercepting synthetic text.
  adbRun("shell", "settings", "put", "secure", "stylus_handwriting_enabled", "0");
  adbRun("install", "-r", "apps/android/app/build/outputs/apk/debug/app-debug.apk");
  adbRun("shell", "pm", "clear", pkg);
  await gateway(4460, false);
  await gateway(4461, true);
  device = await connectDevice();
  assert.ok(device, `Start emulator ${serial}`);
  device.setDefaultTimeout(15000);
  await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
  await step("Native setup and insecure gateway rejection", async () => {
    await nativeWait({ desc: "Gateway address" });
    await shot("01-gateway-setup");
    await nativeFillAddress("http://192.168.1.20:4400");
    await nativeTap({ text: "Connect to gateway" });
    await nativeWait({ text: /Use your gateway.*/ });
    await nativeFillAddress("http://127.0.0.1:4460");
    await nativeTap({ text: "Connect to gateway" });
    await attach();
    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  });
  await step("Private workspace setup, sign-out and invalid login", async () => {
    await page.getByLabel("Your name").fill("Android tester");
    await page.getByLabel("Passphrase", { exact: true }).fill("synthetic-android-test-only");
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Portal", exact: true })).toBeVisible();
    await noOverflow();
    await shot("02-private-portal");
    await navigate("Settings");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Unlock Orchestrator" })).toBeVisible();
    await page.getByLabel("Passphrase", { exact: true }).fill("incorrect-test-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".form-error")).toBeVisible();
    await page.getByLabel("Passphrase", { exact: true }).fill("synthetic-android-test-only");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await navigate("Portal");
  });
  await step("Session survives process restart; gateway changes isolate cookies", async () => {
    await ui.background(pkg);
    await device.shell(`am force-stop ${pkg}`);
    await device.shell(`am start -n ${pkg}/io.github.quintond.orchestrator.MainActivity`);
    await attach();
    await expect(page.getByRole("heading", { name: "Portal", exact: true })).toBeVisible();
    await nativeTap({ text: "Gateway", clazz: "android.widget.Button" });
    await nativeTap({ res: "android:id/button3" });
    await nativeFillAddress("http://127.0.0.1:4461");
    await nativeTap({ text: "Connect to gateway" });
    await attach(4461);
    await expect(page.locator(".demo-banner")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const { cookies } = await cdp.send("Network.getCookies", { urls: ["http://127.0.0.1:4460/", "http://127.0.0.1:4461/"] });
    expect(cookies.some(cookie => cookie.name === "orchestrator_session")).toBe(false);
    await cdp.detach();
    await shot("03-demo-portal");
  });
  await step("Assistant setup, report review and native Back", async () => {
    await navigate("Team");
    await page.getByRole("button", { name: "Custom assistant", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Set up an assistant" });
    await dialog.getByLabel("Name", { exact: true }).fill("Android project partner");
    await dialog.getByLabel("What should it help you achieve?").fill("Keep the Android alpha test plan moving.");
    await ui.hideKeyboard();
    await shot("04-assistant-setup");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog.getByLabel("I have restricted this runtime", { exact: false }).check();
    await dialog.getByRole("button", { name: "Save assistant" }).click();
    const assistant = page.locator("article.agent-surface").filter({ hasText: "Android project partner" });
    await assistant.getByRole("button", { name: "Request report" }).click();
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await page.getByRole("button").filter({ has: page.getByRole("heading", { name: /Android project partner/ }) }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText("claimed", { exact: true })).toBeVisible();
    await shot("05-report-evidence");
    await dialog.getByRole("button", { name: "Useful", exact: true }).click();
    await expect(page.getByText("Review saved. The original evidence is preserved.")).toBeVisible();
    await nativeKey("Back");
    await expect(dialog).not.toBeVisible();
    // Reopening proves native Back also clears React's dialog state.
    await page.getByRole("button").filter({ has: page.getByRole("heading", { name: /Android project partner/ }) }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await nativeKey("Back");
  });
  await step("Keyboard, editable draft, rotation and conversation", async () => {
    const fullHeight = await page.evaluate(() => innerHeight);
    await navigate("Portal");
    await page.getByLabel("Ask your assistant").fill("Review the Android alpha priorities");
    await page.getByRole("button", { name: "Continue in conversation" }).click();
    const composer = page.locator(".composer textarea");
    await expect(composer).toHaveValue("Review the Android alpha priorities");
    await ui.hideKeyboard();
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(fullHeight);
    await ui.tapWeb(page, composer);
    await expect.poll(() => ui.keyboardShown()).toBe(true);
    await expect.poll(() => page.evaluate(() => innerHeight)).toBeLessThan(fullHeight);
    await expect.poll(() => page.evaluate(() => {
      const composer = document.querySelector(".composer").getBoundingClientRect();
      const tabs = document.querySelector(".mobile-nav").getBoundingClientRect();
      return composer.top >= 0 && composer.bottom <= tabs.top + 1;
    })).toBe(true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await shot("06-conversation-keyboard");
    await noOverflow();
    await nativeKey("Back");
    await device.shell("settings put system accelerometer_rotation 0");
    await device.shell("settings put system user_rotation 1");
    await expect.poll(() => page.evaluate(() => innerWidth > innerHeight)).toBe(true);
    await expect(composer).toHaveValue("Review the Android alpha priorities");
    await composer.scrollIntoViewIfNeeded();
    await shot("07-landscape-draft");
    await noOverflow();
    await device.shell("settings put system user_rotation 0");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".message-list")).toContainText("Review the Android alpha priorities");
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await shot("08-conversation-dark");
  });
  await step("Council and knowledge navigation", async () => {
    await navigate("Councils");
    await page.getByRole("button", { name: "Convene a council" }).click();
    const dialog = page.getByRole("dialog", { name: "Convene a council" });
    await dialog.getByLabel("What decision needs another perspective?").fill("Which alpha risks should we test first?");
    await dialog.getByLabel("Atlas", { exact: false }).check();
    await dialog.getByLabel("Sage", { exact: false }).check();
    await dialog.getByLabel("Share this question", { exact: false }).check();
    await dialog.getByRole("button", { name: "Request council" }).click();
    await expect(page.getByRole("dialog").getByText("Lead synthesis")).toBeVisible();
    await shot("09-council");
    await nativeKey("Back");
    await navigate("Knowledge");
    await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "Operating principles", exact: true }) }).click();
    await expect(page.getByRole("dialog")).toContainText("Protect attention");
    await nativeKey("Back");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
  await step("Android document picker returns a preview without sending", async () => {
    await navigate("Conversations");
    await writeFile(path.join(output, "orchestrator-qa-note.txt"), "Synthetic Android attachment.");
    adbRun("push", path.join(output, "orchestrator-qa-note.txt"), "/sdcard/Download/orchestrator-qa-note.txt");
    await page.locator(".attach-file").click();
    await ui.tap({ desc: "Show roots" });
    // The previous folder's title remains in the tree behind the open drawer.
    await ui.tap({ text: "Downloads", res: "android:id/title" });
    await ui.wait({ text: "Downloads", res: /:id\/breadcrumb_text$/ });
    await ui.tap({ text: "orchestrator-qa-note.txt" });
    await expect(page.locator(".attachment-preview")).toContainText("orchestrator-qa-note.txt");
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
    await shot("10-text-attachment");
    await page.getByRole("button", { name: "Remove attachment" }).click();
  });
  await step("Guided Obsidian setup and Notion page scope", async () => {
    const notes = path.join(output, "vault");
    await mkdir(notes, { recursive: true });
    await writeFile(path.join(notes, "project.md"), "# Android vault evidence\n\nSynthetic knowledge for the Android setup test.");
    await navigate("Connections");
    await ui.tapWeb(page, page.getByRole("button", { name: "Add connection", exact: true }));
    let dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
    await dialog.getByLabel("Source", { exact: true }).selectOption("obsidian-vault");
    await dialog.getByLabel("Vault folder").fill(notes);
    await dialog.getByLabel("Index the selected documents").check();
    await ui.hideKeyboard();
    await ui.tapWeb(page, dialog.getByRole("button", { name: "Add and check" }));
    await expect(dialog.getByRole("heading", { name: "Your source is ready" })).toBeVisible();
    await shot("12-obsidian-ready");
    await ui.tapWeb(page, dialog.getByRole("button", { name: "Done", exact: true }));
    await ui.tapWeb(page, page.getByRole("button", { name: "Add connection", exact: true }));
    dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
    await dialog.getByLabel("Source", { exact: true }).selectOption("notion");
    await expect(dialog).toContainText("Only these pages are indexed");
    await expect(dialog.getByLabel("Notion connection secret")).toHaveAttribute("type", "password");
    await shot("13-notion-setup");
    await noOverflow();
    await nativeKey("Back");
    await expect(dialog).not.toBeVisible();
  });
  await step("Grok Bot JSON picker, claimed import and manual correction", async () => {
    const panel = page.getByRole("region", { name: "Work with Grok Bot" });
    await ui.tapWeb(page, panel.getByRole("button", { name: "Prepare a new task" }));
    await panel.getByLabel("Task title", { exact: true }).fill("Android Grok findings");
    await ui.hideKeyboard();
    await ui.tapWeb(page, panel.getByRole("button", { name: "Save handoff" }));
    await ui.tapWeb(page, panel.getByText("View saved task text", { exact: true }));
    const taskText = await panel.getByLabel("Saved Grok Bot task text").inputValue();
    const handoffId = taskText.match(/Handoff ID: ([a-f0-9-]+)/)[1];
    await expect(panel.getByRole("button", { name: "Download task", exact: true })).toHaveCount(0);
    const file = path.join(output, "orchestrator-grok-result.json");
    await writeFile(file, JSON.stringify({ version: 1, handoffId, title: "Android Grok findings", body: "Synthetic manually imported evidence; no external work ran.", sourceUrls: [] }));
    adbRun("push", file, "/sdcard/Download/orchestrator-grok-result.json");
    await ui.tapWeb(page, panel.getByLabel("Result file", { exact: false }));
    await ui.tap({ desc: "Show roots" });
    await ui.tap({ text: "Downloads", res: "android:id/title" });
    await ui.wait({ text: "Downloads", res: /:id\/breadcrumb_text$/ });
    await ui.tap({ text: "orchestrator-grok-result.json" });
    await expect(panel.getByLabel("Result contents")).toContainText("Synthetic manually imported evidence");
    await ui.tapWeb(page, panel.getByRole("button", { name: "Preview import" }));
    await ui.tapWeb(page, panel.getByRole("button", { name: "Confirm import as claimed" }));
    await expect(panel.getByRole("heading", { name: "Result saved in Reports" })).toBeVisible();
    await ui.tapWeb(page, panel.getByRole("link", { name: "Open Reports" }));
    await page.getByRole("button").filter({ has: page.getByRole("heading", { name: "Android Grok findings", exact: true }) }).click();
    const dialog = page.getByRole("dialog", { name: "Android Grok findings", exact: true });
    await expect(dialog.getByText("claimed", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy correction for Grok Bot" })).toBeVisible();
    await shot("14-grok-claimed-report");
    await noOverflow();
    await nativeKey("Back");
  });
  await step("Large text, narrow screen and all routes remain reachable", async () => {
    await displayProfile(true);
    for (const name of ["Portal", "Conversations", "Work", "Team", "Reports", "Councils", "Activity", "Attention", "Knowledge", "Insights", "Connections", "Settings"]) {
      const label = new RegExp(`^${name}(?:\\s*\\d+)?$`);
      if (!["Portal", "Work", "Team", "Reports", "Conversations"].includes(name)) {
        await ui.tapWeb(page, page.getByRole("button", { name: "Open navigation", exact: true }));
        await ui.tapWeb(page, page.getByRole("complementary", { name: "All navigation" }).getByRole("button", { name: label }));
        await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).not.toBeVisible();
      } else await ui.tapWeb(page, page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("button", { name, exact: true }));
      await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
      await noOverflow();
      console.log(`PASS Large-text navigation: ${name}`);
    }
    await shot("10-small-screen-settings");
    await displayProfile(false);
  });
  await step("Prepared team, source evidence and nested native Back", async () => {
    await navigate("Team");
    await page.getByRole("button", { name: "Add prepared team", exact: true }).click();
    const catalog = page.getByRole("dialog", { name: "A team, already prepared", exact: true });
    await expect(catalog.getByLabel("Team connection")).toHaveValue("workspace");
    await shot("15-beta-prepared-team");
    await catalog.getByRole("button", { name: "Add team & prepare reports", exact: true }).click();
    await expect(catalog).not.toBeVisible();
    const sage = page.locator(".agent-surface").filter({ has: page.getByRole("heading", { name: "Sage", exact: true }) });
    await sage.getByRole("button", { name: "Request report", exact: true }).click();
    await page.locator(".report-row").filter({ has: page.getByRole("heading", { name: /^Sage/ }) }).first().click();
    const report = page.getByRole("dialog").first();
    await report.getByRole("button", { name: "Launch audience brief", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Launch audience brief", exact: true })).toBeVisible();
    await shot("16-beta-source-evidence");
    await nativeKey("Back");
    await expect(page.getByRole("dialog", { name: "Launch audience brief", exact: true })).not.toBeVisible();
    await expect(page.getByRole("dialog").first()).toContainText("Recommended next step");
    await nativeKey("Back");
  });
  await step("Complete simulated decision updates linked work", async () => {
    await navigate("Attention");
    const item = page.locator(".attention-card").filter({ hasText: "Launch copy needs your decision" });
    await item.getByRole("button", { name: "Review", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".decision-option")).toHaveCount(2);
    await shot("17-beta-decision-options");
    await dialog.getByRole("button", { name: "Use this direction", exact: true }).click();
    await expect(dialog).not.toBeVisible(); await expect(item).toHaveCount(0);
    await navigate("Work");
    const project = page.locator(".project-card").filter({ has: page.getByRole("heading", { name: "Studio launch", exact: true }) });
    await expect(project).toContainText("Direction chosen"); await expect(project).toContainText("54%");
    await shot("18-beta-linked-work");
  });
  await step("Offline recovery does not send or retry work", async () => {
    children[1].kill();
    await expect.poll(() => children[1].exitCode !== null || children[1].signalCode !== null).toBe(true);
    await nativeTap({ text: "Gateway", clazz: "android.widget.Button" });
    await nativeTap({ res: "android:id/button1" });
    await nativeWait({ text: /The gateway is unavailable.*/ });
    await shot("11-offline-recovery");
    await gateway(4461, true);
    await nativeTap({ text: "Connect to gateway" });
    await attach(4461);
    await expect(page.getByRole("heading", { name: "Portal", exact: true })).toBeVisible();
  });
  console.log(`Android QA passed: ${results.length} journeys. Evidence: ${output}`);
} catch (error) {
  if (device) await shot("failure").catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, "results.json"), JSON.stringify({ serial, passed: results, webview: page ? await page.evaluate(() => navigator.userAgent).catch(() => "unavailable") : "unavailable" }, null, 2));
  if (device) {
    await device.shell("wm size reset").catch(() => {}); await device.shell("wm density reset").catch(() => {});
    await device.shell("settings put system font_scale 1.0").catch(() => {});
    await device.shell("settings put system user_rotation 0").catch(() => {});
    await device.shell("settings put system accelerometer_rotation 1").catch(() => {});
    await device.close();
  }
  for (const port of [4460, 4461]) { try { adbRun("reverse", "--remove", `tcp:${port}`); } catch {} }
  for (const child of children) child.kill();
}
