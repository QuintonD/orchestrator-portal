import { readEmulatorEvidence } from "./device-evidence.mjs";
// Optional live model-client acceptance on a disposable emulator. Not a parity benchmark.
// Only scoped test credential paths are printed; phone/owner credentials are never printed.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { cleanupSteps, isRunning, stopChild, safeFailure } from "./runner-cleanup.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serial = process.env.PHONE_QA_SERIAL ?? "emulator-5570";
assert.match(serial, /^emulator-\d+$/);
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
const cleanupAdb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
const platform = readEmulatorEvidence(adb);
const apiLevel = platform.sdk;
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const fixture = "io.github.quintond.orchestrator.phonefixture.debug";
const output = join(root, "test-results/phone-control", `agent-session-${Date.now()}-${randomUUID()}`);
const privateDir = join(output, "private");
const cli = join(root, "components/phone-control/bin/phone-control.mjs");
mkdirSync(output, { recursive: true });
const command = (args, input) => JSON.parse(execFileSync(process.execPath, [cli, ...args], {
  cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  input: input === undefined ? undefined : JSON.stringify(input), stdio: ["pipe", "pipe", "pipe"],
}));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (check()) return; await sleep(200); }
  throw new Error("Test deadline exceeded");
}
function launch(args) {
  const child = spawn(args[0], args.slice(1), { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", () => { child.launchFailed = true; });
  return child;
}
const counter = (view) => Number(view.nodes.find((node) => /^Counter: \d+$/.test(node.text ?? ""))?.text.slice(9));
let instrumentation; let broker; let ownsForward = false; let nativeOutput = "";
let owner; let session; let passed = false; let failure; let initial; let final;
let stage = "start native host probe";
let nativeDeadline;
const agentChecks = [];
function requireLiveProcesses() {
  assert.ok(isRunning(instrumentation) && !instrumentation.launchFailed, "Native test session must remain available");
  if (broker) assert.ok(isRunning(broker) && !broker.launchFailed, "Owned test broker must remain available");
}
async function api(path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:4422${path}`, {
    method, headers: { authorization: `Bearer ${owner}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200); return response.json();
}
async function observe() {
  const receipt = await api("/v1/call", "POST", { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "observe", params: {} });
  assert.equal(receipt.status, "observed"); assert.equal(receipt.result.screenshot, undefined);
  const value = counter(receipt.result); assert.ok(Number.isInteger(value) && value >= 0 && value < 1000); return value;
}
try {
  instrumentation = launch(["adb", "-s", serial, "shell", "am", "instrument", "-w", "-r", "-e", "hostProbe", "true", "-e", "liveAgents", "true", `${pkg}.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest`]);
  instrumentation.stdout.on("data", (data) => {
    if (nativeOutput.length + data.length > 1024 * 1024) { instrumentation.kill(); return; }
    nativeOutput += data;
  }); instrumentation.stderr.resume();
  await until(() => { requireLiveProcesses(); return nativeOutput.includes("PHONE_HOST_PROBE_READY"); }, 30000);
  // The explicit debug-only liveAgents probe allows LLM orchestration time;
  // ordinary integration keeps its shorter lease. Production authority is unchanged.
  nativeDeadline = performance.now() + 360000;
  stage = "initialize private broker";
  command(["init", "--dir", privateDir, "--port", "4422"]);
  const nativeFile = join(privateDir, "native.token");
  const token = adb("shell", "run-as", pkg, "cat", "files/phone-qa-token").trim();
  assert.match(token, /^[A-Za-z0-9_-]{40,64}$/);
  writeFileSync(nativeFile, token, { mode: 0o600, flag: "wx" });
  adb("forward", "--no-rebind", "tcp:18838", "tcp:8837"); ownsForward = true;
  const config = join(privateDir, "config.json");
  command(["device-add", "--config", config, "--id", "emulator", "--label", "Live synthetic agents", "--native-port", "18838", "--native-token-file", nativeFile]);
  owner = readFileSync(join(privateDir, "admin.token"), "utf8").trim();
  broker = launch([process.execPath, cli, "serve", "--config", config]);
  let ready = false; broker.stdout.resume(); broker.stderr.on("data", (chunk) => { if (String(chunk).includes("Listening at")) ready = true; });
  await until(() => { requireLiveProcesses(); return ready; }, 10000);
  const state = await api("/v1/state"); assert.ok(state.devices.some((device) => device.id === "emulator"));
  stage = "create independent fixture credentials";
  process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY = readFileSync(join(privateDir, "broker-public.pem"), "utf8");
  const operations = ["describe", "observe", "fixture.increment", "stop"];
  session = (await api("/v1/sessions", "POST", { deviceId: "emulator", apps: [fixture], operations, ttlSeconds: 300 })).session;
  const agents = [];
  for (const name of ["agent-a", "agent-b"]) {
    const path = join(privateDir, `${name}.token`);
    const result = command(["credentials-create", "--port", "4422", "--token-file", join(privateDir, "admin.token"), "--out-token", path], {
      label: name, devices: ["emulator"], sessionIds: [session.id], apps: [fixture], operations, ttlSeconds: 300,
    });
    agents.push({ name, credentialId: result.credential.id, tokenFile: path });
  }
  stage = "observe initial fixture state";
  initial = await observe();
  const completedFile = join(output, "agents-finished");
  const waitMs = Math.floor(Math.min(240000, nativeDeadline - performance.now() - 30000));
  assert.ok(waitMs >= 30000, "Setup must leave a useful live-client acceptance window");
  // Space the first delegated observation from the owner capture on fast hosts.
  await sleep(400);
  console.log(JSON.stringify({ ready: true, cli, brokerPublicKeyFile: join(privateDir, "broker-public.pem"), taskRequired: true, port: 4422, device: "emulator", session: session.id, agents, completedFile, initialCounter: initial, expiresInSeconds: Math.floor(waitMs / 1000) }));
  stage = "wait for delegated fixture clients";
  await until(() => { requireLiveProcesses(); return existsSync(completedFile); }, waitMs);
  stage = "verify independent client results";
  const audit = await api("/v1/audit");
  for (const agent of agents) {
    const events = audit.events.filter((event) => event.actorId === agent.credentialId && event.deviceId === "emulator");
    const observations = events.filter((event) => event.method === "observe" && event.status === "observed").length;
    const completedFixtureMutations = events.filter((event) => event.method === "fixture.increment" && event.status === "completed").length;
    agentChecks.push({ name: agent.name, observations, completedFixtureMutations, passed: observations >= 2 && completedFixtureMutations === 1 });
  }
  await sleep(400);
  final = await observe();
  assert.ok(agentChecks.every((check) => check.passed), "Each scoped client must observe before/after exactly one completed mutation");
  assert.equal(final, (initial + 2) % 1000, "Each delegated client must increment once");
  passed = true;
} catch (error) { failure = { stage, ...safeFailure(error) }; process.exitCode = 1; }
finally {
  const cleanup = await cleanupSteps([
    { name: "native stop", action: async () => {
      if (!owner || !session) return;
      const result = await api("/v1/devices/emulator/stop", "POST", {}); assert.equal(result.stopStatus, "completed");
    } },
    { name: "request native probe shutdown", action: async () => {
      if (!isRunning(instrumentation)) return;
      cleanupAdb("shell", "run-as", pkg, "touch", "files/phone-qa-stop");
      await until(() => !isRunning(instrumentation), 5000);
    } },
    { name: "stop native session", action: () => { if (instrumentation) cleanupAdb("shell", "am", "force-stop", pkg); } },
    { name: "remove native private probe files", action: () => { if (instrumentation) cleanupAdb("shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop"); } },
    { name: "terminate owned broker", action: () => stopChild(broker), timeout: 7000 },
    { name: "terminate owned instrumentation client", action: () => stopChild(instrumentation), timeout: 7000 },
    { name: "owned forward", action: () => { if (ownsForward) cleanupAdb("forward", "--remove", "tcp:18838"); } },
    { name: "private files", action: async () => {
      assert.ok(resolve(privateDir).startsWith(`${resolve(root, "test-results/phone-control")}${sep}`) && privateDir.endsWith(`${sep}private`));
      if (existsSync(privateDir)) rmSync(privateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } },
  ]);
  const clean = cleanup.every((item) => item.passed);
  if (!clean) process.exitCode = 1;
  try {
    writeFileSync(join(output, "results.json"), JSON.stringify({ serial, apiLevel, platform, passed: passed && clean, functionalPassed: passed, initialCounter: initial, finalCounter: final, agentChecks, failure, cleanup,
      limits: ["Two delegated model clients on a synthetic fixture only", "No host isolation, physical biometric or Astra PC parity claim"] }, null, 2));
  } catch { console.error("FAIL cleanup: write safe live-client evidence"); process.exitCode = 1; }
  console.log(JSON.stringify({ passed: passed && !process.exitCode, evidence: output, failure, cleanup }));
  if (process.exitCode) setTimeout(() => process.exit(1), 1000).unref();
}
