// Actual published alpha 2 programs -> current packaged alpha, using only disposable data.
// Never clears or uninstalls an Android package. Use a fresh dedicated emulator.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { chromium, _android as android, expect } from "@playwright/test";
import { nativeControls } from "./android/native.mjs";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const assets = path.resolve("test-results/release-assets");
const target = `${process.platform}-${process.arch}`;
const extension = process.platform === "win32" ? "zip" : "tar.gz";
const previousArchive = path.join(assets, `orchestrator-0.1.0-alpha.2-${target}.${extension}`);
const nextArchive = path.resolve(`dist/desktop/orchestrator-${version}-${target}.${extension}`);
const previousApk = path.join(assets, "orchestrator-0.1.0-alpha.2.apk");
const nextApk = path.resolve("apps/android/app/build/outputs/apk/release/app-release.apk");
const serial = process.env.ANDROID_QA_SERIAL ?? "emulator-5560";
assert.match(serial, /^emulator-\d+$/);
const adb = path.join(process.env.ANDROID_HOME, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const run = (...args) => execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8", windowsHide: true });
assert.equal(run("shell", "getprop", "ro.kernel.qemu").trim(), "1");
const pkg = "io.github.quintond.orchestrator";
const retryPath = process.env.ORCHESTRATOR_UPGRADE_RETRY;
if (retryPath) {
  const retry = JSON.parse(await readFile(path.join(retryPath, "results.json"), "utf8"));
  assert.equal(retry.serial, serial); assert.equal(retry.passed, false); assert.equal(retry.previousVersion, "0.1.0-alpha.2");
  assert.match(run("shell", "dumpsys", "package", pkg), /versionName=0\.1\.0-alpha\.2\s/);
  run("shell", "am", "force-stop", pkg);
} else assert.equal(run("shell", "pm", "list", "packages", pkg).trim(), "", "Use a fresh emulator; failed pre-upgrade fixtures may be retried explicitly without clearing data");
const sha = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const sums = await readFile(path.join(assets, "SHA256SUMS.txt"), "utf8");
for (const file of [previousArchive, previousApk]) assert.ok(sums.includes(`${await sha(file)}  ${path.basename(file)}`), "published alpha 2 checksum");
assert.equal(await sha(nextArchive), (await readFile(`${nextArchive}.sha256`, "utf8")).split(" ")[0]);
await mkdir("test-results/upgrades", { recursive: true });
const output = await mkdtemp(path.resolve("test-results/upgrades/alpha-"));
const data = path.join(output, "workspace");
async function extract(file, folder) {
  const dir = path.join(output, folder); await mkdir(dir);
  execFileSync("tar", ["-xf", file, "-C", dir]);
  return path.join(dir, path.basename(file).replace(/\.(zip|tar\.gz)$/, ""));
}
const oldBundle = await extract(previousArchive, "previous");
const newBundle = await extract(nextArchive, "next");
const url = "http://127.0.0.1:4482";
const env = { ...process.env, ORCHESTRATOR_DATA_DIR: data, ORCHESTRATOR_PORT: "4482", ORCHESTRATOR_ALLOWED_ORIGINS: url };
for (const key of ["ORCHESTRATOR_MASTER_KEY", "ORCHESTRATOR_DEMO", "NODE_OPTIONS", "NODE_PATH"]) delete env[key];
let child, browser, device;
const evidence = { version, previousVersion: "0.1.0-alpha.2", target, serial, passed: false, checks: [] };
async function start(bundle) {
  const entry = path.join(bundle, process.platform === "win32" ? "Orchestrator.cmd" : process.platform === "darwin" ? "Orchestrator.command" : "orchestrator");
  child = process.platform === "win32"
    ? spawn(process.env.ComSpec, ["/d", "/s", "/c", `""${entry}" start --no-open --json"`], { env, windowsHide: true, windowsVerbatimArguments: true, stdio: ["pipe", "pipe", "pipe"] })
    : spawn(entry, ["start", "--no-open", "--json"], { env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.resume(); child.stderr.resume();
  console.log(`Starting ${path.basename(bundle)}`);
  await expect.poll(async () => { try { return (await fetch(`${url}/healthz`)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
}
async function stop() {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) { child = undefined; return; }
  const ended = new Promise(resolve => child.once("exit", resolve));
  child.stdin.write("stop\n");
  let timer;
  try { await Promise.race([ended, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Gateway shutdown timed out")), 30000); })]); }
  finally { clearTimeout(timer); }
  child = undefined;
}
const password = "upgrade-fixture-only-2026";
let cookies;
const api = async (route) => {
  const response = await fetch(`${url}${route}`, { headers: { cookie: cookies } });
  assert.equal(response.status, 200, route); return response.json();
};
try {
  await start(oldBundle);
  assert.equal((await (await fetch(`${url}/healthz`)).json()).version, "0.1.0-alpha.2");
  const setup = await fetch(`${url}/api/auth/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: url }, body: JSON.stringify({ displayName: "Upgrade fixture", password }) });
  assert.equal(setup.status, 201);
  cookies = setup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  await stop();
  const { Vault } = await import(pathToFileURL(path.join(oldBundle, "apps/server/dist/crypto.js")));
  const vault = new Vault(data);
  const db = new DatabaseSync(path.join(data, "orchestrator.db"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO connectors VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("fixture", "Preserved source", "markdown-directory", "disconnected", "[]", vault.seal({ path: path.join(output, "notes"), marker: "synthetic secret retained" }), null, null, null, stamp, stamp);
  db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?)").run("message-fixture", "fixture", "user", vault.seal("Preserve this conversation"), "committed", null, stamp);
  db.prepare("INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?)").run("document-fixture", "fixture", "Retained notes", "Synthetic knowledge retained across upgrade", "memory://upgrade", stamp);
  db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)").run("project-fixture", "Retained project", "Do not reset this work", "on-track", 80, 35, null, stamp);
  const records = [
    ["assistant-fixture", "assistant", { id: "assistant-fixture", name: "My existing assistant", purpose: "Retain this custom mandate", criteria: "Retain reviewed evidence", connectorId: "fixture", cadence: "manual", providerPolicy: "local", spendingLimit: 0, scope: ["fixture"], runtimePolicyConfirmed: false, state: "paused", lastRunAt: null, nextExpectedAt: null, createdAt: stamp }],
    ["report-fixture", "report", { id: "report-fixture", assistantId: "assistant-fixture", title: "Reviewed before upgrade", body: "Evidence retained", criteria: "Preserve evidence", source: "fixture", review: "useful", correction: "Keep this review", state: "claimed", createdAt: stamp }],
    ["watch-fixture", "watch", { id: "watch-fixture", name: "Retain watch", query: "fixture", enabled: false }],
  ];
  for (const [id, kind, payload] of records) db.prepare("INSERT INTO alpha_records VALUES (?,?,?,?)").run(id, kind, vault.seal(payload), stamp);
  const layout = JSON.parse(db.prepare("SELECT config_json FROM dashboard_layouts").get().config_json);
  layout.widgets.reverse(); layout.widgets[0].visible = !layout.widgets[0].visible;
  db.prepare("UPDATE dashboard_layouts SET config_json=?").run(JSON.stringify(layout));
  const tables = ["users", "connectors", "messages", "knowledge_documents", "projects", "dashboard_layouts", "alpha_records"];
  const before = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  db.close();
  const key = await readFile(path.join(data, "master.key"));
  await cp(data, path.join(output, "backup"), { recursive: true });
  await start(oldBundle);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByLabel("Passphrase").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("orchestrator-theme", "dark"));
  run("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1");
  run("install", "-r", previousApk); run("reverse", "tcp:4482", "tcp:4482");
  const devices = await android.devices({ omitDriverInstall: true });
  device = devices.find(item => item.serial() === serial);
  await Promise.all(devices.filter(item => item !== device).map(item => item.close()));
  const ui = nativeControls(() => device);
  await device.shell(`am start -n ${pkg}/.MainActivity`);
  if (!retryPath) { await ui.fill({ desc: "Gateway address" }, url); await ui.tap({ text: "Connect to gateway" }); }
  await ui.wait({ text: "Unlock Orchestrator" });
  await ui.fill({ clazz: "android.widget.EditText" }, password); await ui.hideKeyboard(); await ui.tap({ text: "Continue" });
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  await device.screenshot({ path: path.join(output, "android-before.png") });
  await ui.background(pkg); run("shell", "am", "force-stop", pkg);
  const oldDump = run("shell", "dumpsys", "package", pkg);
  const oldCode = Number(oldDump.match(/versionCode=(\d+)/)[1]);
  const oldInstall = oldDump.match(/firstInstallTime=([^\r\n]+)/)[1];
  await stop(); await start(newBundle);
  assert.equal((await (await fetch(`${url}/healthz`)).json()).version, version);
  assert.equal((await api("/api/auth/status")).authenticated, true, "existing gateway session");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Portal", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem("orchestrator-theme")), "dark");
  await page.screenshot({ path: path.join(output, "desktop-after.png"), fullPage: true });
  const assistants = (await api("/api/assistants")).assistants;
  assert.deepEqual(assistants.find(item => item.id === "assistant-fixture"), records[0][2]);
  assert.deepEqual((await api("/api/reports")).find(item => item.id === "report-fixture"), records[1][2]);
  assert.deepEqual((await api("/api/watches")).find(item => item.id === "watch-fixture"), records[2][2]);
  assert.equal((await api("/api/connectors")).connectors.find(item => item.id === "fixture").kind, "markdown-directory");
  assert.equal(assistants.filter(item => item.name === "Compass").length, 1, "one automatic Compass, existing assistant retained");
  run("install", "-r", nextApk);
  const nextDump = run("shell", "dumpsys", "package", pkg);
  assert.ok(Number(nextDump.match(/versionCode=(\d+)/)[1]) > oldCode);
  assert.equal(nextDump.match(/versionName=([^\r\n]+)/)[1].trim(), version);
  assert.equal(nextDump.match(/firstInstallTime=([^\r\n]+)/)[1], oldInstall, "in-place installation");
  assert.ok(!/flags=\[.*DEBUGGABLE/.test(nextDump));
  await device.shell(`am start -n ${pkg}/.MainActivity`);
  await ui.wait({ text: "Portal", clazz: "android.widget.TextView" });
  assert.equal(await ui.find({ text: "Unlock Orchestrator" }), null, "phone session retained");
  assert.equal(await ui.find({ desc: "Gateway address" }), null, "phone gateway origin retained");
  await device.screenshot({ path: path.join(output, "android-after.png") });
  await stop();
  assert.deepEqual(await readFile(path.join(data, "master.key")), key);
  const upgraded = new DatabaseSync(path.join(data, "orchestrator.db"));
  assert.equal(upgraded.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  for (const table of tables) {
    const after = upgraded.prepare(`SELECT * FROM ${table}`).all();
    for (const row of before[table]) assert.ok(after.some(candidate => JSON.stringify(candidate) === JSON.stringify(row)), `${table}: original record preserved byte-for-byte`);
  }
  assert.equal(vault.open(upgraded.prepare("SELECT body_encrypted FROM messages WHERE id='message-fixture'").get().body_encrypted), "Preserve this conversation");
  upgraded.close();
  evidence.checks = ["published input checksums", "old desktop launcher and login", "encrypted connection/message and custom assistant/report/watch/project/knowledge/layout retained", "workspace backup and unchanged master key", "SQLite integrity", "existing desktop session and theme", "exactly one Compass", "signed APK installed over alpha 2 without clearing or uninstalling", "increasing versionCode and retained firstInstallTime", "phone origin and session retained", "non-debuggable APK"];
  evidence.artifacts = Object.fromEntries(await Promise.all([previousArchive, nextArchive, previousApk, nextApk].map(async file => [file === nextApk ? `orchestrator-${version}.apk` : path.basename(file), await sha(file)])));
  evidence.passed = true;
  console.log("PASS", evidence.checks.join("; "));
} finally {
  await browser?.close().catch(() => {}); await device?.close().catch(() => {});
  try { await stop(); } catch (error) { evidence.passed = false; evidence.cleanupError = error.message; }
  try { run("shell", "am", "force-stop", pkg); } catch {}
  try { run("reverse", "--remove", "tcp:4482"); } catch {}
  await writeFile(path.join(output, "results.json"), JSON.stringify(evidence, null, 2));
  console.log(`Upgrade evidence: ${output}`);
}
