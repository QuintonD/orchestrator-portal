import { access, mkdir, open, readFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { desktopDataDir, desktopPort } from "./paths.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const json = args.includes("--json");
const command = args.find((arg) => !arg.startsWith("--")) ?? "start";
let ownedLock;
let app;
let shuttingDown = false;

function report(value) {
  if (json) console.log(JSON.stringify(value));
  else {
    console.log(value.message ?? `${value.status}${value.url ? `: ${value.url}` : ""}`);
    if (value.dataDir) console.log(`Workspace files: ${value.dataDir}`);
    if (value.checks) for (const check of value.checks) console.log(`${check.ok ? "OK" : "CHECK"} ${check.name}: ${check.detail}`);
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; }
}

async function lockRecord(filename) {
  try {
    const raw = await readFile(filename, "utf8");
    if (raw.length > 4096) throw new Error("Invalid launcher lock.");
    const record = JSON.parse(raw);
    if (!Number.isSafeInteger(record.pid) || record.pid < 1 || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535 || !/^[a-f0-9]{64}$/.test(record.secret)) throw new Error("Invalid launcher lock.");
    return { ...record, raw };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error("The launcher lock cannot be read. Run doctor and inspect desktop.lock in the workspace directory; do not remove it while a gateway is running.");
  }
}

function signature(secret, purpose, challenge) { return createHmac("sha256", secret).update(`${purpose}:${challenge}`).digest("hex"); }

async function verifiedInstance(record) {
  if (!record || !alive(record.pid)) return false;
  const challenge = randomBytes(32).toString("hex");
  try {
    // A challenge proves possession without sending the control secret to an occupied port.
    const response = await fetch(`http://127.0.0.1:${record.port}/_desktop/identity?challenge=${challenge}`, { signal: AbortSignal.timeout(1500), redirect: "error" });
    const reader = response.body.getReader();
    let body = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      body += Buffer.from(value).toString("utf8");
      if (body.length > 1024) { await reader.cancel(); return false; }
    }
    const proof = JSON.parse(body).proof;
    return response.ok && typeof proof === "string" && /^[a-f0-9]{64}$/.test(proof) && timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(signature(record.secret, "identity", challenge), "hex"));
  } catch { return false; }
}

async function portAvailable(port) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", (error) => error.code === "EADDRINUSE" ? resolve(false) : reject(error));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

async function writableParent(directory) {
  let candidate = directory;
  while (true) {
    try { await access(candidate, constants.W_OK); return candidate; } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(candidate) === candidate) throw error;
      candidate = path.dirname(candidate);
    }
  }
}

function openBrowser(url) {
  const binary = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "/usr/bin/open" : "xdg-open";
  const options = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(binary, options, { stdio: "ignore", windowsHide: true });
  child.once("error", () => report({ status: "browser-unavailable", message: `Open ${url} in your browser.` }));
  child.once("exit", (code) => { if (code) report({ status: "browser-unavailable", message: `Open ${url} in your browser.` }); });
  child.unref();
}

async function releaseLock() {
  if (!ownedLock) return;
  const lock = ownedLock;
  ownedLock = undefined;
  try {
    const current = await lockRecord(lock.filename);
    if (current?.secret === lock.secret) await unlink(lock.filename);
  } catch { /* A changed lock belongs to another owner; never remove it. */ }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (app) {
      const closed = app.close();
      // SSE streams can otherwise keep Fastify shutdown waiting indefinitely.
      app.server.closeAllConnections();
      await closed;
    }
  } finally { await releaseLock(); }
  report({ status: "stopped", message: "Orchestrator stopped. Your workspace is saved." });
  process.exit(0);
}

async function main() {
  if (args.some((arg) => !["start", "stop", "status", "doctor", "recover", "--json", "--no-open", "--help"].includes(arg)) || args.filter((arg) => !arg.startsWith("--")).length > 1) throw new Error("Unknown arguments. Run with --help.");
  if (args.includes("--help")) {
    report({ status: "help", message: "Orchestrator [start|stop|status|doctor|recover] [--no-open] [--json]\nStart opens the portal. Keep the launcher running; use Ctrl+C, type stop then Enter, or run stop to finish.\nSet ORCHESTRATOR_DATA_DIR to an absolute path to select another workspace. recover removes only a stale launcher lock after its recorded process has exited." });
    return;
  }
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use the Node 24 runtime included in this download.");
  if (process.env.ORCHESTRATOR_HOST && process.env.ORCHESTRATOR_HOST !== "127.0.0.1") throw new Error("The desktop launcher uses 127.0.0.1 only. Use private HTTPS forwarding for another device; see docs/desktop.md.");
  if (process.env.ORCHESTRATOR_DEMO === "1") throw new Error("Desktop launches require private mode. Remove ORCHESTRATOR_DEMO from the environment.");
  const dataDir = desktopDataDir();
  const port = desktopPort();
  const filename = path.join(dataDir, "desktop.lock");
  const url = `http://127.0.0.1:${port}`;
  const record = await lockRecord(filename);
  const running = await verifiedInstance(record);

  if (command === "status") {
    report({ status: running ? "running" : record ? "unverified" : "stopped", ...(running ? { url: `http://127.0.0.1:${record.port}` } : {}), dataDir, message: running ? `Orchestrator is running at http://127.0.0.1:${record.port}.` : record ? "A launcher lock exists, but this process could not verify the gateway. Run doctor." : "Orchestrator is stopped." });
    process.exitCode = running ? 0 : 1;
    return;
  }
  if (command === "recover") {
    if (!record) { report({ status: "stopped", message: "No launcher lock needs recovery." }); return; }
    if (alive(record.pid)) throw new Error("The recorded process still exists. Stop it normally; recovery will not remove its lock or kill it.");
    // Recovery is an explicit operator action, never part of ordinary launch or upgrade.
    if ((await readFile(filename, "utf8")) !== record.raw) throw new Error("The launcher lock changed. Run doctor again.");
    await unlink(filename);
    report({ status: "recovered", message: "Removed the stale launcher lock. Run Orchestrator again; your workspace data is unchanged." });
    return;
  }
  if (command === "stop") {
    if (!record) { report({ status: "stopped", message: "Orchestrator is already stopped." }); return; }
    if (!running) throw new Error("Cannot verify the running gateway. No process was stopped. Run doctor.");
    const challenge = randomBytes(32).toString("hex");
    const response = await fetch(`http://127.0.0.1:${record.port}/_desktop/stop`, { method: "POST", headers: { "x-orchestrator-challenge": challenge, "x-orchestrator-proof": signature(record.secret, "stop", challenge) }, signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!response.ok) throw new Error("The gateway refused the stop request.");
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!await lockRecord(filename)) { report({ status: "stopped", message: "Orchestrator stopped. Your workspace is saved." }); return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("The stop request was accepted, but shutdown is still pending. Check the launcher window.");
  }
  if (command === "doctor") {
    const checks = [{ name: "runtime", ok: true, detail: `Node ${process.versions.node}, ${process.platform}-${process.arch}` }];
    for (const relative of ["apps/server/dist/server.js", "apps/web/dist/index.html", "node_modules/fastify/package.json"]) {
      try { await access(path.join(root, relative)); checks.push({ name: relative, ok: true, detail: "present" }); }
      catch { checks.push({ name: relative, ok: false, detail: "missing; extract the complete download again" }); }
    }
    try { await writableParent(dataDir); checks.push({ name: "workspace", ok: true, detail: dataDir }); }
    catch { checks.push({ name: "workspace", ok: false, detail: "not writable; select an absolute ORCHESTRATOR_DATA_DIR owned by your account" }); }
    const available = await portAvailable(port);
    checks.push({ name: "port", ok: available || (running && record.port === port), detail: available ? `${port} is available` : running && record.port === port ? `${port} is this workspace's gateway` : `${port} is occupied; stop its owner or set ORCHESTRATOR_PORT` });
    checks.push({ name: "launcher", ok: !record || running, detail: running ? "running and identity verified" : !record ? "stopped" : alive(record.pid) ? "recorded process exists but gateway identity is unverified; inspect the original launcher window" : "recorded process exited; run recover to remove its stale launcher lock" });
    const ok = checks.every((check) => check.ok);
    report({ status: ok ? "ready" : "attention", dataDir, url, checks, message: ok ? "The desktop gateway is ready." : "Resolve the checks below, then launch again." });
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (record) {
    if (running) {
      const existingUrl = `http://127.0.0.1:${record.port}`;
      report({ status: "already-running", url: existingUrl, dataDir, message: `This workspace is already running at ${existingUrl}.` });
      if (!args.includes("--no-open")) openBrowser(existingUrl);
      return;
    }
    throw new Error(alive(record.pid) ? "This workspace has a launcher process already running or starting. Check its window or run doctor; no second gateway was started." : "The previous launcher exited unexpectedly. Run recover, then start again. Your workspace data has been preserved.");
  }
  if (!await portAvailable(port)) throw new Error(`Port ${port} is occupied. Stop the other service or set ORCHESTRATOR_PORT to an unused port. No browser was opened.`);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const secret = randomBytes(32).toString("hex");
  let handle;
  try { handle = await open(filename, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Another launcher acquired this workspace. Run status or try again shortly."); throw error; }
  ownedLock = { filename, secret };
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, port, secret })); } finally { await handle.close(); }
  process.env.NODE_ENV = "production";
  process.env.ORCHESTRATOR_HOST = "127.0.0.1";
  process.env.ORCHESTRATOR_DATA_DIR = dataDir;
  process.env.ORCHESTRATOR_PORT = String(port);
  // Keep machine-readable launcher output free of HTTP access logs.
  process.env.LOG_LEVEL = json ? "silent" : process.env.LOG_LEVEL ?? "warn";
  const { createApp } = await import(pathToFileURL(path.join(root, "apps/server/dist/server.js")).href);
  app = await createApp();
  app.get("/_desktop/identity", async (request, reply) => {
    const challenge = request.query?.challenge;
    if (typeof challenge !== "string" || !/^[a-f0-9]{64}$/.test(challenge)) return reply.code(400).send({ error: "Invalid challenge" });
    return { proof: signature(secret, "identity", challenge) };
  });
  app.post("/_desktop/stop", async (request, reply) => {
    const challenge = request.headers["x-orchestrator-challenge"];
    const proof = request.headers["x-orchestrator-proof"];
    // Identity responses cannot be reused as commands, and the lock secret never crosses HTTP.
    if (typeof challenge !== "string" || !/^[a-f0-9]{64}$/.test(challenge) || typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof) || !timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(signature(secret, "stop", challenge), "hex"))) return reply.code(403).send({ error: "Invalid control capability" });
    reply.send({ status: "stopping" });
    setImmediate(() => { void shutdown(); });
  });
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  await app.listen({ host: "127.0.0.1", port });
  report({ status: "running", url, dataDir, message: `Orchestrator is ready at ${url}. Keep this window open. To stop, press Ctrl+C or type stop and Enter.` });
  process.stdin.setEncoding("utf8");
  let input = "";
  process.stdin.on("data", (chunk) => {
    input = (input + chunk).slice(-1024);
    if (/(?:^|\n)stop\r?\n/i.test(input)) void shutdown();
  });
  if (!args.includes("--no-open")) openBrowser(url);
}

main().catch(async (error) => {
  if (app) await app.close().catch(() => {});
  await releaseLock();
  const message = error.code === "EADDRINUSE" ? "The port was taken while Orchestrator was starting. Set ORCHESTRATOR_PORT to an unused port and try again." : error.code === "EACCES" || error.code === "EPERM" ? "Orchestrator cannot access its files or port. Extract it to a folder owned by your account and run doctor." : error.message;
  report({ status: "error", message });
  process.exitCode = 1;
});
