import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopDataDir } from "./paths.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const version = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8")).version;
const target = `${process.platform}-${process.arch}`;
const archive = path.resolve(process.argv[2] ?? path.join(repo, "dist/desktop", `orchestrator-${version}-${target}.${process.platform === "win32" ? "zip" : "tar.gz"}`));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(await readFile(archive)), (await readFile(archive + ".sha256", "utf8")).split(" ")[0], "release archive checksum");
const testOutput = path.join(repo, "test-results", "desktop");
await mkdir(testOutput, { recursive: true });
const temporary = await mkdtemp(path.join(testOutput, "package smoke "));
const extraction = path.join(temporary, "extracted app");
const unrelated = path.join(temporary, "unrelated directory");
const profile = path.join(temporary, "user profile");
const shims = path.join(temporary, "tool shims");
await Promise.all([extraction, unrelated, profile, shims].map((directory) => mkdir(directory)));
const extracted = spawnSync("tar", ["-xf", archive, "-C", extraction], { stdio: "inherit", windowsHide: true });
assert.equal(extracted.status, 0, "archive extraction");
const bundle = path.join(extraction, path.basename(archive).replace(/\.(zip|tar\.gz)$/, ""));
assert.equal(JSON.parse(await readFile(path.join(bundle, "bundle.json"), "utf8")).target, target, "native target");
for (const line of (await readFile(path.join(bundle, "FILES.sha256"), "utf8")).trim().split("\n")) {
  const [checksum, filename] = line.split("  ");
  assert.equal(hash(await readFile(path.join(bundle, filename))), checksum, `file checksum: ${filename}`);
}
for (const forbidden of [".git", "assets", "apps/server/data", "apps/server/test-results", "node_modules/typescript", "node_modules/npm"]) assert.equal(existsSync(path.join(bundle, forbidden)), false, `excluded ${forbidden}`);
assert.equal(existsSync(path.join(bundle, "runtime", process.platform === "win32" ? "node.exe" : "node")), true);
for (const dependency of ["react", "react-dom", "scheduler", "lucide-react", "vite", "rolldown"]) assert.ok((await readFile(path.join(bundle, "licenses", `${dependency}.txt`), "utf8")).length > 100, `frontend license: ${dependency}`);

const environment = { ...process.env, HOME: profile, USERPROFILE: profile, LOCALAPPDATA: path.join(profile, "local"), XDG_DATA_HOME: path.join(profile, "share") };
for (const key of Object.keys(environment)) if (key.startsWith("ORCHESTRATOR_") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete environment[key];
// A launcher that accidentally invokes a system Node/npm/Git fails immediately.
for (const binary of ["node", "npm", "git"]) {
  const filename = path.join(shims, binary + (process.platform === "win32" ? ".cmd" : ""));
  await writeFile(filename, process.platform === "win32" ? "@exit /b 99\r\n" : "#!/bin/sh\nexit 99\n");
  await chmod(filename, 0o755);
}
for (const key of Object.keys(environment)) if (key.toLowerCase() === "path") delete environment[key];
environment.PATH = process.platform === "win32" ? `${shims};${path.join(process.env.SystemRoot ?? "C:\\Windows", "System32")}` : `${shims}:/usr/bin:/bin`;
const dataDir = desktopDataDir(process.platform, environment, profile);

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
environment.ORCHESTRATOR_PORT = String(await unusedPort());
const url = `http://127.0.0.1:${environment.ORCHESTRATOR_PORT}`;
let active;

function launch(args, env = environment) {
  const entry = path.join(bundle, process.platform === "win32" ? "Orchestrator.cmd" : process.platform === "darwin" ? "Orchestrator.command" : "orchestrator");
  const binary = process.platform === "win32" ? process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe" : entry;
  const parameters = process.platform === "win32" ? ["/d", "/s", "/c", `""${entry}" ${args.join(" ")}"`] : args;
  const child = spawn(binary, parameters, { cwd: unrelated, env, windowsHide: true, windowsVerbatimArguments: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] });
  child.output = "";
  child.errors = "";
  child.stdout.on("data", (chunk) => { child.output += chunk; });
  child.stderr.on("data", (chunk) => { child.errors += chunk; });
  child.done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  return child;
}

async function result(args, expected = 0, env = environment) {
  const child = launch(args, env);
  const timer = setTimeout(() => child.kill(), 20000);
  try {
    assert.equal(await child.done, expected, `${args.join(" ")}: ${child.output} ${child.errors}`);
    return JSON.parse(child.output.trim().split(/\r?\n/).at(-1));
  } finally { clearTimeout(timer); }
}

async function start() {
  active = launch(["start", "--no-open", "--json"]);
  for (let attempt = 0; attempt < 200; attempt++) {
    if (active.output.includes('"status":"running"')) return;
    if (active.exitCode !== null) throw new Error(`Packaged launch failed: ${active.output} ${active.errors}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Packaged startup timed out: ${active.output} ${active.errors}`);
}

try {
  assert.equal((await result(["doctor", "--json"])).status, "ready");
  assert.equal(existsSync(dataDir), false, "doctor does not create workspace data");
  assert.equal((await result(["status", "--json"], 1)).status, "stopped");
  await start();
  assert.equal((await (await fetch(`${url}/healthz`)).json()).status, "ok");
  const html = await (await fetch(url)).text();
  assert.match(html, /<html/);
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(asset, "built JavaScript asset reference");
  assert.equal((await fetch(new URL(asset, url))).status, 200);
  assert.equal((await (await fetch(`${url}/api/auth/status`)).json()).setupRequired, true);
  const setup = await fetch(`${url}/api/auth/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: url }, body: JSON.stringify({ displayName: "Desktop smoke", password: "desktop-smoke-passphrase-only" }) });
  assert.equal(setup.status, 201);
  const key = await readFile(path.join(dataDir, "master.key"), "utf8");
  assert.equal((await result(["status", "--json"])).status, "running");
  assert.equal((await result(["start", "--no-open", "--json"])).status, "already-running");
  assert.equal((await result(["doctor", "--json"])).status, "ready");
  assert.equal((await fetch(`${url}/_desktop/stop`, { method: "POST" })).status, 403, "unauthenticated stop is forbidden");
  const challenge = randomBytes(32).toString("hex");
  const identity = await (await fetch(`${url}/_desktop/identity?challenge=${challenge}`)).json();
  assert.equal((await fetch(`${url}/_desktop/stop`, { method: "POST", headers: { "x-orchestrator-challenge": challenge, "x-orchestrator-proof": identity.proof } })).status, 403, "a public identity proof cannot authorize a stop");
  const cookies = setup.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const stream = await fetch(`${url}/api/events/stream`, { headers: { cookie: cookies } });
  assert.equal(stream.status, 200, "an active event stream is present during shutdown");
  assert.equal((await result(["stop", "--json"])).status, "stopped");
  assert.equal(await active.done, 0);
  await stream.body.cancel().catch(() => {});
  active = undefined;
  assert.equal(existsSync(path.join(dataDir, "desktop.lock")), false, "clean shutdown releases workspace lock");
  assert.equal(existsSync(path.join(unrelated, "data")), false, "no working-directory database");
  assert.equal(existsSync(path.join(bundle, "data")), false, "no installation-directory database");
  await start();
  assert.equal(await readFile(path.join(dataDir, "master.key"), "utf8"), key, "encryption key survives restart");
  assert.equal((await (await fetch(`${url}/api/auth/status`)).json()).setupRequired, false, "setup survives restart");
  active.stdin.write("stop\n");
  assert.equal(await active.done, 0, "interactive stop is graceful");
  active = undefined;

  let unrelatedRequests = 0;
  let leakedControl = false;
  const occupied = createServer((request, response) => {
    unrelatedRequests++;
    leakedControl ||= Boolean(request.headers["x-orchestrator-control"] || request.headers["x-orchestrator-proof"]);
    response.end('{"status":"ok","version":"0.1.0","proof":"' + "0".repeat(64) + '"}');
  });
  await new Promise((resolve) => occupied.listen(Number(environment.ORCHESTRATOR_PORT), "127.0.0.1", resolve));
  try {
    const failure = await result(["start", "--json"], 1);
    assert.match(failure.message, /occupied/);
    assert.equal(unrelatedRequests, 0, "an occupied service is never treated as Orchestrator");
    assert.equal((await result(["doctor", "--json"], 1)).status, "attention");
    assert.equal(existsSync(path.join(dataDir, "desktop.lock")), false);
    await writeFile(path.join(dataDir, "desktop.lock"), JSON.stringify({ pid: process.pid, port: Number(environment.ORCHESTRATOR_PORT), secret: randomBytes(32).toString("hex") }));
    assert.equal((await result(["status", "--json"], 1)).status, "unverified", "a health-like response cannot impersonate the gateway");
    assert.equal((await result(["stop", "--json"], 1)).status, "error");
    assert.equal((await result(["recover", "--json"], 1)).status, "error", "recovery never removes a live process lock");
    assert.equal(leakedControl, false, "no control capability is sent to an unverified service");
  } finally {
    await unlink(path.join(dataDir, "desktop.lock")).catch(() => {});
    await new Promise((resolve) => occupied.close(resolve));
  }

  assert.equal((await result(["doctor", "--json"], 1, { ...environment, ORCHESTRATOR_PORT: "4400oops" })).status, "error");
  assert.equal((await result(["start", "--json"], 1, { ...environment, ORCHESTRATOR_HOST: "0.0.0.0" })).status, "error");
  assert.equal((await result(["start", "--json"], 1, { ...environment, ORCHESTRATOR_DEMO: "1" })).status, "error");
  const report = { status: "passed", target, archive: path.basename(archive), checks: ["archive and file checksums", "native entry point with system Node/npm/Git blocked", "paths with spaces and unrelated working directory", "read-only doctor", "first workspace setup", "static assets and health", "duplicate identity verification", "authenticated graceful stop with active SSE", "restart persistence and stable key", "occupied port rejection", "forged identity rejection without control capability exposure", "live lock recovery refusal", "configuration rejection"] };
  await writeFile(path.join(testOutput, `results-${target}.json`), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (active && active.exitCode === null) {
    active.stdin.write("stop\n");
    await Promise.race([active.done, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (active.exitCode === null) active.kill();
  }
}
