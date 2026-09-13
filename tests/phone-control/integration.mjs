import { readEmulatorEvidence } from "./device-evidence.mjs";
import { recoveryEvidence, recoverySummary, captureWarningCount } from "./capture-recovery-evidence.mjs";
import { CLOCK_SAMPLE_TIMEOUT_MS, CLOCK_SAMPLE_MAX_BYTES, sampleClock, observationClockEvidence } from "./clock-evidence.mjs";
import { createAdbTransportEvidence } from "./adb-transport-evidence.mjs";
// A real disposable Android device boundary, reached through the standalone CLI,
// MCP and portal. Secrets stay in memory/private test files and never in output.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { cleanupSteps, isRunning, safeFailure, stopChild, within } from "./runner-cleanup.mjs";
import { assertMcpDenial } from "./mcp-result.mjs";
import { assertHostProbeStopped, parseHostProbeEvidence, parsePowerEvidence } from "./host-probe-evidence.mjs";
import { buildImage, IsolatedSource } from "../../components/phone-control/deployment/host.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serial = process.env.PHONE_QA_SERIAL ?? "emulator-5570";
assert.match(serial, /^emulator-\d+$/);
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
const platform = readEmulatorEvidence(adb);
const apiLevel = platform.sdk;
const pkg = "io.github.quintond.orchestrator.phonecontrol.debug";
const fixture = "io.github.quintond.orchestrator.phonefixture.debug";
const runner = `${pkg}.test/io.github.quintond.orchestrator.phonecontrol.SmokeTest`;
const evidenceRoot = resolve(root, "test-results/phone-control");
const output = join(evidenceRoot, `integration-${Date.now()}`);
const privateDir = join(output, "private");
mkdirSync(output, { recursive: true });
const cli = join(root, "components/phone-control/bin/phone-control.mjs");
const results = [];
const timings = [];
const observationSamples = [];
const screenshotSamples = [];
const observationAttempts = [];
const captureRecoveries = [];
const captureWarningSamples = [];
const nativeMemory = [];
const powerSamples = [];
const clockSamples = [];
let initialObservationClock;
const phaseTimings = [];
const harnessStarted = performance.now();
const probeTiming = { startedMs: null, readyMs: null, exitedMs: null };
let nativeOutput = "";
const instrumentTransport = createAdbTransportEvidence();
const processes = [];
const diagnosticCodes = new Set(["screenshot_unavailable", "observation_blocked", "stale_observation", "scope_forbidden", "device_outcome_unknown", "outcome_unknown", "forbidden", "unknown_action_state", "busy", "deadline_expired", "native_response_invalid", "native_unavailable", "persistence_unavailable"]);
for (const code of ["screenshot_rate_limited", "screenshot_secure_window", "screenshot_invalid_window", "screenshot_invalid_display", "screenshot_access_denied", "screenshot_geometry_changed", "screenshot_too_large", "screenshot_timeout", "screenshot_internal_error"]) diagnosticCodes.add(code);
for (const code of ["invalid_request", "session_expired", "consent_unavailable", "consent_denied", "consent_timeout", "replay_conflict", "stopped", "unsupported_method"]) diagnosticCodes.add(code);
const previousBrokerToken = process.env.ORCHESTRATOR_PHONE_BROKER_TOKEN;
const previousPublicKey = process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY;
const previousPortalPublicKey = process.env.ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY;
const isolatedMode = process.env.PHONE_QA_ISOLATED === "1";
let isolation;
let isolatedResult;
const previousNodeEnv = process.env.NODE_ENV;
const cleanupAdb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", windowsHide: true, timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
let cleanup = [];
let stopWallMs;
let portal;
let instrument;
let instrumentClosed = false;
let instrumentOutputOverflow = false;
let ownsForward = false;
let stage = "start instrumentation";
let owner;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function record(name) { results.push({ name, passed: true }); phaseTimings.push({ name, elapsedMs: Math.round(performance.now() - harnessStarted) }); console.log(`PASS ${name}`); }
function samplePower(phase) {
  try { powerSamples.push({ phase, elapsedMs: Math.round(performance.now() - harnessStarted), ...parsePowerEvidence(execFileSync("adb", ["-s", serial, "shell", "dumpsys", "power"], { encoding: "utf8", windowsHide: true, timeout: 3000, stdio: ["ignore", "pipe", "pipe"] })) }); }
  catch { powerSamples.push({ phase, elapsedMs: Math.round(performance.now() - harnessStarted), wakefulness: null, powered: null }); }
}
function sampleDeviceClock(phase) {
  clockSamples.push({ phase, ...sampleClock(() => spawnSync("adb", ["-s", serial, "shell", "date", "+%s%3N"], {
    encoding: "utf8", windowsHide: true, timeout: CLOCK_SAMPLE_TIMEOUT_MS, maxBuffer: CLOCK_SAMPLE_MAX_BYTES,
    killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"],
  })) });
}
function sampleCaptureWarnings(phase) {
  try {
    const pidText = execFileSync("adb", ["-s", serial, "shell", "pidof", pkg], { encoding: "utf8", windowsHide: true, timeout: 3000, maxBuffer: 128, stdio: ["ignore", "pipe", "pipe"] }).trim();
    assert.match(pidText, /^[1-9][0-9]{0,9}$/u);
    const pid = Number(pidText);
    const raw = execFileSync("adb", ["-s", serial, "logcat", "-d", "-b", "main", "--pid", pidText, "-v", "brief", "-s", "ScreenCapture:E"], { encoding: "utf8", windowsHide: true, timeout: 3000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] });
    captureWarningSamples.push({ phase, elapsedMs: Math.round(performance.now() - harnessStarted), status: "sampled", pid, consumerNotAliveWarnings: captureWarningCount(raw, pid) });
    // Every other log byte is discarded, including exception and application text.
  } catch { captureWarningSamples.push({ phase, elapsedMs: Math.round(performance.now() - harnessStarted), status: "unavailable" }); }
}
async function eventually(check, milliseconds = 20000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await check()) return; await sleep(150); }
  throw new Error("Readiness deadline exceeded");
}
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], ...options });
  child.on("error", () => { child.launchFailed = true; });
  child.stdin?.on("error", () => {});
  processes.push(child); return child;
}
async function run(args, input) {
  const child = start(process.execPath, [cli, ...args]);
  let out = "";
  child.stdout.on("data", (chunk) => { if (out.length + chunk.length > 10 * 1024 * 1024) { child.kill(); return; } out += chunk; });
  child.stderr.resume();
  child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  const [code] = await within(() => once(child, "close"), 65000);
  let parsed;
  try { parsed = JSON.parse(out); } catch { /* A nonzero CLI exit can have no JSON stdout. */ }
  if (args[0] === "observe" && parsed !== undefined) retainRecovery(parsed, "cli");
  if (code !== 0) {
    const receiptCode = parsed?.error?.code;
    if (diagnosticCodes.has(receiptCode)) stage += `: ${receiptCode}`;
    throw Object.assign(new Error("CLI check failed"), { code: `cli_exit_${code}` });
  }
  assert.ok(parsed && typeof parsed === "object", "Successful CLI returned a JSON receipt");
  return parsed;
}
async function ownerCall(path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:4421${path}`, {
    method, headers: { authorization: `Bearer ${owner}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "error",
  });
  assert.equal(response.status, 200, "Owner endpoint returned a valid receipt");
  const receipt = await response.json();
  if (body?.method === "observe") retainRecovery(receipt, "owner_http");
  return receipt;
}
function retainRecovery(receipt, transport) {
  const captureRecovery = recoveryEvidence(receipt, apiLevel);
  if (captureRecovery) captureRecoveries.push({ transport, elapsedMs: Math.round(performance.now() - harnessStarted), observed: receipt.status === "observed", captureRecovery });
  return captureRecovery;
}
function count(observation) {
  const value = observation.nodes.find((node) => /^Counter: \d+$/.test(node.text ?? ""))?.text;
  assert.ok(value, "Fixture counter must be observable"); return Number(value.slice(9));
}
function mcpProcess(tokenFile) {
  const child = start(process.execPath, [cli, "mcp", "--token-file", tokenFile]);
  const waiting = new Map(); let pending = "";
  function failPending() {
    for (const waiter of waiting.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("MCP process ended or returned invalid protocol data")); }
    waiting.clear();
  }
  child.on("close", failPending); child.on("error", failPending);
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    if (pending.length > 10 * 1024 * 1024) { failPending(); child.kill(); return; }
    while (pending.includes("\n")) {
      const end = pending.indexOf("\n"); const line = pending.slice(0, end); pending = pending.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { failPending(); child.kill(); return; }
      if (!message || typeof message !== "object" || Array.isArray(message)) { failPending(); child.kill(); return; }
      const waiter = waiting.get(message.id);
      if (waiter) { waiting.delete(message.id); clearTimeout(waiter.timer); waiter.resolve(message); }
    }
  });
  return {
    request(method, params) {
      const id = randomUUID();
      return new Promise((resolveResult, reject) => {
        if (!isRunning(child)) { reject(new Error("MCP process is unavailable")); return; }
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error("MCP timeout")); }, 60000);
        waiting.set(id, { resolve: (message) => {
          try {
            if (method === "tools/call" && params?.arguments?.method === "observe") retainRecovery(message.result?.structuredContent, "mcp");
            resolveResult(message);
          } catch (error) { reject(error); }
        }, reject, timer });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    notify(method) { child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`); },
    close() { child.stdin.end(); },
  };
}

try {
  const isolatedImage = isolatedMode ? buildImage().image : undefined;
  probeTiming.startedMs = Math.round(performance.now() - harnessStarted);
  instrument = start("adb", ["-s", serial, "shell", "am", "instrument", "-w", "-r", "-e", "hostProbe", "true", runner]);
  instrument.once("exit", () => { probeTiming.exitedMs = Math.round(performance.now() - harnessStarted); });
  instrument.once("close", () => { instrumentClosed = true; });
  instrument.stdout.on("data", (chunk) => { if (nativeOutput.length + chunk.length > 1024 * 1024) { instrumentOutputOverflow = true; instrument.kill(); return; } nativeOutput += chunk; });
  instrument.stderr.on("data", instrumentTransport.write);
  await eventually(() => parseHostProbeEvidence(nativeOutput, instrument.exitCode).readyLeaseSeconds === 180, 45000);
  probeTiming.readyMs = Math.round(performance.now() - harnessStarted);
  samplePower("probe_ready");
  stage = "initialize standalone broker";
  sampleDeviceClock("probe_ready");
  await run(["init", "--dir", privateDir, "--port", "4421"]);
  const brokerPublicKey = readFileSync(join(privateDir, "broker-public.pem"), "utf8");
  process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY = brokerPublicKey;
  process.env.ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY = brokerPublicKey;
  const nativeToken = adb("shell", "run-as", pkg, "cat", "files/phone-qa-token").trim();
  assert.match(nativeToken, /^[A-Za-z0-9_-]{40,64}$/, "Only the synthetic session credential is read");
  const nativeFile = join(privateDir, "native.token");
  writeFileSync(nativeFile, nativeToken, { mode: 0o600, flag: "wx" });
  adb("forward", "--no-rebind", "tcp:18837", "tcp:8837");
  ownsForward = true;
  const config = join(privateDir, "config.json");
  await run(["device-add", "--config", config, "--id", "emulator", "--label", "Synthetic Android", "--native-port", "18837", "--native-token-file", nativeFile]);
  owner = readFileSync(join(privateDir, "admin.token"), "utf8").trim();
  const broker = start(process.execPath, [cli, "serve", "--config", config]);
  let brokerReady = false;
  broker.stderr.on("data", (chunk) => { if (String(chunk).includes("Listening at")) brokerReady = true; });
  broker.stdout.resume();
  await eventually(() => brokerReady && broker.exitCode === null, 10000);
  record("Independent broker starts with private per-device configuration");
  stage = "create narrowed agent credentials";
  const operations = ["describe", "observe", "apps.list", "fixture.increment", "stop"];
  const session = (await ownerCall("/v1/sessions", "POST", { deviceId: "emulator", apps: [fixture], operations, disclosure: { screenshots: true }, ttlSeconds: 600 })).session;
  const agentOneFile = join(privateDir, "agent-one.token"); const agentTwoFile = join(privateDir, "agent-two.token"); const agentThreeFile = join(privateDir, "agent-three.token");
  const ownerArgs = ["--token-file", join(privateDir, "admin.token")];
  await run(["credentials-create", ...ownerArgs, "--out-token", agentOneFile], { label: "CLI fixture operator", devices: ["emulator"], sessionIds: [session.id], apps: [fixture], operations, ttlSeconds: 600 });
  const second = await run(["credentials-create", ...ownerArgs, "--out-token", agentTwoFile], { label: "MCP observer", devices: ["emulator"], apps: [fixture], operations: ["observe", "describe"], ttlSeconds: 600 });
  await run(["credentials-create", ...ownerArgs, "--out-token", agentThreeFile], { label: "MCP fixture operator", devices: ["emulator"], sessionIds: [session.id], apps: [fixture], operations, ttlSeconds: 600 });
  const args = ["--token-file", agentOneFile, "--device", "emulator", "--session", session.id];
  const capabilities = await run(["describe", ...args]); assert.equal(capabilities.status, "observed");
  const cliTask = (await run(["tasks-create", ...args], { deviceId: "emulator", sessionId: session.id, ttlSeconds: 60, maxActions: 2, label: "CLI fixture task" })).task;
  stage = "CLI native observation and mutation";
  const readHostStartedAtMs = Date.now(); const startRead = performance.now();
  const before = await run(["observe", ...args]);
  const readFinishedMs = performance.now(); const readHostFinishedAtMs = Date.now();
  timings.push(readFinishedMs - startRead);
  initialObservationClock = observationClockEvidence(before.result?.capturedAt, {
    hostStartedAtMs: readHostStartedAtMs, hostFinishedAtMs: readHostFinishedAtMs,
    monotonicStartedMs: startRead, monotonicFinishedMs: readFinishedMs,
  });
  assert.equal(before.status, "observed"); assert.equal(before.result.screenshot, undefined);
  const initial = count(before.result); const actionId = randomUUID();
  const actionArgs = ["fixture-increment", ...args, "--task", cliTask.id, "--observation", before.result.observationId, "--request-id", actionId];
  stage = "CLI fixture action";
  sampleDeviceClock("before_cli_fixture_action");
  const acted = await run(actionArgs); assert.equal(acted.status, "completed");
  stage = "CLI fixture replay";
  const replayed = await run(actionArgs); assert.equal(replayed.status, "completed");
  await sleep(400);
  stage = "CLI fixture postcondition";
  const startVerify = performance.now(); const after = await run(["observe", ...args]); timings.push(performance.now() - startVerify);
  assert.equal(after.status, "observed");
  assert.equal(count(after.result), (initial + 1) % 1000, "Duplicate request must not increment twice");
  record("Real CLI observe / signed fixture action / replay / postcondition");
  const status = await run(["receipt-status", ...args, "--id", actionId]);
  assert.equal(status.receipt.status, "completed"); assert.equal(status.resumeAllowed, false);
  await run(["tasks-release", ...args, "--id", cliTask.id]);
  stage = "MCP protocol against the same phone";
  const mcp = mcpProcess(agentTwoFile);
  const initialized = await mcp.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-qa-client", version: "1" } });
  assert.equal(initialized.result.protocolVersion, "2025-11-25"); mcp.notify("notifications/initialized");
  const catalog = await mcp.request("tools/list", {}); assert.ok(catalog.result.tools.some((tool) => tool.name === "phone_call"));
  await sleep(400);
  const read = await mcp.request("tools/call", { name: "phone_call", arguments: { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "observe", params: {} } });
  assert.equal(read.result.isError, false); assert.equal(read.result.structuredContent.status, "observed");
  const denied = await mcp.request("tools/call", { name: "phone_call", arguments: { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "fixture.increment", params: { observationId: read.result.structuredContent.result.observationId } } });
  assertMcpDenial(denied, "scope_forbidden");
  record("Separate MCP identity observes the real phone but cannot mutate");
  stage = "same fixture task through an independently authorized MCP mutator";
  const mutator = mcpProcess(agentThreeFile);
  const initializedMutator = await mutator.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-mcp-fixture-operator", version: "1" } });
  assert.equal(initializedMutator.result.protocolVersion, "2025-11-25"); mutator.notify("notifications/initialized");
  const reserved = await mutator.request("tools/call", { name: "phone_task_acquire", arguments: { deviceId: "emulator", sessionId: session.id, ttlSeconds: 60, maxActions: 2, label: "MCP fixture task" } });
  assert.equal(reserved.result.isError, false); const mcpTask = reserved.result.structuredContent.task;
  const mcpCall = (method, params, id = randomUUID()) => mutator.request("tools/call", { name: "phone_call", arguments: { id, deviceId: "emulator", sessionId: session.id, ...(method === "fixture.increment" ? { taskId: mcpTask.id } : {}), method, params } });
  await sleep(400);
  stage = "MCP fixture observation";
  const mcpBefore = await mcpCall("observe", {});
  if (diagnosticCodes.has(mcpBefore.result.structuredContent?.error?.code)) stage += `: ${mcpBefore.result.structuredContent.error.code}`;
  assert.equal(mcpBefore.result.isError, false); assert.equal(mcpBefore.result.structuredContent.status, "observed");
  const mcpInitial = count(mcpBefore.result.structuredContent.result);
  assert.equal(mcpInitial, (initial + 1) % 1000);
  const mcpActionId = randomUUID(); const mcpParams = { observationId: mcpBefore.result.structuredContent.result.observationId };
  stage = "MCP fixture action";
  const mcpActed = await mcpCall("fixture.increment", mcpParams, mcpActionId);
  const mcpFailureCode = mcpActed.result.structuredContent?.error?.code;
  if (diagnosticCodes.has(mcpFailureCode)) stage += `: ${mcpFailureCode}`;
  assert.equal(mcpActed.result.isError, false); assert.equal(mcpActed.result.structuredContent.status, "completed");
  stage = "MCP fixture replay";
  const mcpReplay = await mcpCall("fixture.increment", mcpParams, mcpActionId);
  assert.equal(mcpReplay.result.isError, false); assert.equal(mcpReplay.result.structuredContent.status, "completed");
  await sleep(400);
  stage = "MCP fixture postcondition";
  const mcpAfter = await mcpCall("observe", {});
  if (diagnosticCodes.has(mcpAfter.result.structuredContent?.error?.code)) stage += `: ${mcpAfter.result.structuredContent.error.code}`;
  assert.equal(mcpAfter.result.isError, false); assert.equal(mcpAfter.result.structuredContent.status, "observed");
  assert.equal(count(mcpAfter.result.structuredContent.result), (mcpInitial + 1) % 1000, "MCP duplicate must not increment twice");
  const releasedMcpTask = await mutator.request("tools/call", { name: "phone_task_release", arguments: { id: mcpTask.id } });
  assert.equal(releasedMcpTask.result.isError, false);
  mutator.close();
  record("CLI and independent MCP identity complete the same fixture task exactly once; no model reasoning is tested");
  stage = "sample owner HTTP observation latency";
  function sampleNativeMemory(phase) {
    const report = adb("shell", "dumpsys", "meminfo", pkg);
    const total = /TOTAL PSS:\s*(\d+)/.exec(report);
    if (total) nativeMemory.push({ phase, totalPssKiB: Number(total[1]) });
  }
  sampleNativeMemory("before observations");
  samplePower("before_observations");
  sampleCaptureWarnings("before_observations");
  for (let index = 0; index < 30; index++) {
    const includeScreenshot = index >= 20;
    await sleep(400);
    const started = performance.now();
    const sample = await ownerCall("/v1/call", "POST", { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "observe", params: { includeScreenshot } });
    const elapsed = performance.now() - started;
    const errorCode = diagnosticCodes.has(sample.error?.code) ? sample.error.code : "unclassified_failure";
    const safeDetails = {};
    if (["queued", "awaiting_callback", "encoding"].includes(sample.error?.details?.captureStage)) safeDetails.captureStage = sample.error.details.captureStage;
    const captureElapsed = sample.error?.details?.captureElapsedMs;
    if (Number.isInteger(captureElapsed) && captureElapsed >= 0 && captureElapsed <= 60000) safeDetails.captureElapsedMs = captureElapsed;
    const captureRecovery = recoveryEvidence(sample, apiLevel);
    if ((captureRecovery || sample.status !== "observed") && !captureWarningSamples.some((entry) => entry.phase === "first_capture_failure")) sampleCaptureWarnings("first_capture_failure");
    observationAttempts.push({ includeScreenshot, wallMs: elapsed, elapsedMs: Math.round(started - harnessStarted), observed: sample.status === "observed", ...(captureRecovery ? { captureRecovery } : {}), ...(sample.status === "observed" ? {} : { errorCode, ...safeDetails }) });
    // Independent logical requests; native Android 14/15 may recover one failed read.
    // Retain that original failure separately. The harness never retries a request.
    if (sample.status !== "observed") { if (!powerSamples.some(sample => sample.phase === "first_failed_observation")) samplePower("first_failed_observation"); continue; }
    assert.equal(count(sample.result), (initial + 2) % 1000);
    if (includeScreenshot) {
      assert.equal(sample.result.screenshot?.mimeType, "image/png");
      assert.equal(Buffer.from(sample.result.screenshot.base64, "base64").subarray(1, 4).toString(), "PNG");
      screenshotSamples.push(elapsed);
    } else { assert.equal(sample.result.screenshot, undefined); observationSamples.push(elapsed); }
  }
  sampleNativeMemory("after observations");
  samplePower("after_observations");
  sampleCaptureWarnings("after_observations");
  const failedReads = observationAttempts.filter((attempt) => !attempt.observed);
  if (failedReads.length) {
    // Keep the run failed while allowing independent portal/revocation/Stop checks
    // to run. These later cases do not replace or retry a failed measurement.
    results.push({ name: "Every independent observation succeeds", passed: false, failedReads: failedReads.length, errorCode: failedReads[0].errorCode });
    process.exitCode = 1;
    console.error(`FAIL observation reliability (${failedReads.length}/30 independent reads)`);
  } else record("20 tree-only and 10 screenshot logical observations completed; first-attempt failures and bounded native read recoveries retained separately");
  stage = "portal authentication and native projection";
  process.env.NODE_ENV = "test";
  process.env.ORCHESTRATOR_PHONE_BROKER_TOKEN = owner;
  const { createApp } = await import("../../apps/server/dist/server.js");
  portal = await createApp({ dataDir: join(privateDir, "portal"), demo: false, host: "127.0.0.1", isLoopback: true });
  assert.equal((await portal.inject("/api/phone-control/state")).statusCode, 401);
  const setup = await portal.inject({ method: "POST", url: "/api/auth/setup", payload: { displayName: "Phone QA", password: "Synthetic phone QA passphrase 2026" } });
  assert.equal(setup.statusCode, 201);
  const cookies = (Array.isArray(setup.headers["set-cookie"]) ? setup.headers["set-cookie"] : [setup.headers["set-cookie"]]).map((item) => item.split(";")[0]).join("; ");
  const csrf = decodeURIComponent(cookies.match(/orchestrator_csrf=([^;]+)/)[1]);
  const headers = { cookie: cookies, "x-csrf-token": csrf };
  const state = await portal.inject({ url: "/api/phone-control/state", headers }); assert.equal(state.json().mode, "connected");
  await sleep(400);
  const view = await portal.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "observe", params: { includeScreenshot: true } } });
  assert.equal(view.statusCode, 200); const visible = view.json(); retainRecovery(visible, "portal"); assert.equal(visible.status, "observed");
  assert.equal(count(visible.result), (initial + 2) % 1000);
  const image = Buffer.from(visible.result.screenshot.base64, "base64");
  assert.equal(image.subarray(1, 4).toString(), "PNG"); writeFileSync(join(output, "fixture.png"), image);
  const rawShell = await portal.inject({ method: "POST", url: "/api/phone-control/call", headers, payload: { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "shell", params: { command: "id" } } });
  assert.equal(rawShell.statusCode, 400);
  record("Authenticated portal projects a real native screenshot and rejects raw shell");
  if (isolatedMode) {
    stage = "isolated source task through actual phone broker";
    stage = "start isolated source with pinned single-session credential";
    isolation = await IsolatedSource.start({ image: isolatedImage, secret: readFileSync(agentThreeFile, "utf8").trim(), publicKey: brokerPublicKey, deviceId: "emulator", sessionId: session.id });
    stage = "execute confined source SDK task";
    const output = await isolation.run(`
      import assert from 'node:assert/strict';
      import { PhonePilot } from '/opt/phone/src/pilot.mjs';
      import { SourcePhoneTask } from '/opt/phone/src/task.mjs';
      const captureRecoveries = [];
      try {
      const pilot = new PhonePilot({secret:process.env.PHONE_CONTROL_TOKEN,deviceId:process.env.PHONE_CONTROL_DEVICE,sessionId:process.env.PHONE_CONTROL_SESSION,brokerPublicKey:process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY,budget:{maxActions:1,maxObservations:3,timeoutMs:30000}});
      await pilot.acquireTask({ttlSeconds:30,maxActions:1,label:'Confined fixture task'});
      const task = new SourcePhoneTask({pilot,checkpointFile:'/workspace/task.json',budget:{maxModelCalls:0,timeoutMs:30000}});
      const count = (view) => Number(view.nodes.find(node => /^Counter: \\d+$/.test(node.text ?? '')).text.slice(9));
      const beforeView = await task.observe();
      if (beforeView.captureRecovery) captureRecoveries.push({observed:true,captureRecovery:beforeView.captureRecovery});
      const before = count(beforeView);
      const action = await task.act('fixture.increment'); assert.equal(action.status,'completed');
      const afterView = await task.observe();
      if (afterView.captureRecovery) captureRecoveries.push({observed:true,captureRecovery:afterView.captureRecovery});
      const after = count(afterView); assert.equal(after,(before+1)%1000);
      const result = task.finish(); await pilot.releaseTask();
      console.log(JSON.stringify({before,after,status:result.status,independentlyVerified:result.independentlyVerified,actions:task.checkpoint.actions.length,captureRecoveries}));
      } catch (error) {
        if (error.details?.captureRecovery) captureRecoveries.push({observed:false,captureRecovery:error.details.captureRecovery});
        console.log(JSON.stringify({status:'failed',captureRecoveries}));
        throw error;
      }
    `);
    if (output.code !== 0) {
      const safe = /\b(?:Fault|Error): ([a-z_]{1,60})\b/.exec(output.stderr)?.[1];
      if (safe && diagnosticCodes.has(safe)) stage += `: ${safe}`;
    }
    assert.equal(output.outputTruncated, false);
    const reported = JSON.parse(output.stdout);
    assert.ok(Array.isArray(reported.captureRecoveries) && reported.captureRecoveries.length <= 2);
    const safeRecoveries = reported.captureRecoveries.map((item) => {
      assert.equal(typeof item?.observed, "boolean");
      const receipt = item.observed ? { status: "observed", result: { captureRecovery: item.captureRecovery } } : { status: "rejected", error: { details: { captureRecovery: item.captureRecovery } } };
      const captureRecovery = retainRecovery(receipt, "confined_sdk");
      assert.ok(captureRecovery);
      return { observed: item.observed, captureRecovery };
    });
    if (reported.status === "failed") {
      isolatedResult = { status: "failed", captureRecoveries: safeRecoveries };
    } else {
      assert.equal(reported.status, "awaiting_verification"); assert.equal(reported.independentlyVerified, false); assert.equal(reported.actions, 1);
      assert.ok(safeRecoveries.every((item) => item.observed), "A successful source cannot conceal a terminal observation failure");
      for (const count of [reported.before, reported.after]) assert.ok(Number.isInteger(count) && count >= 0 && count <= 999);
      isolatedResult = { before: reported.before, after: reported.after, status: reported.status, independentlyVerified: false, actions: 1, captureRecoveries: safeRecoveries };
    }
    assert.equal(output.code, 0, "Confined source program exits successfully"); assert.equal(isolatedResult.status, "awaiting_verification");
    const independent = await ownerCall("/v1/call", "POST", { id: randomUUID(), deviceId: "emulator", sessionId: session.id, method: "observe", params: {} });
    assert.equal(count(independent.result), (initial + 3) % 1000); assert.equal(isolatedResult.after, count(independent.result));
    record("Confined source SDK task completed exactly one action; owner separately verified the fixture state");
  }
  stage = "revocation and out-of-band stop";
  await ownerCall(`/v1/credentials/${second.credential.id}`, "DELETE");
  const revoked = await mcp.request("tools/call", { name: "phone_state", arguments: {} }); assertMcpDenial(revoked, "unauthorized"); mcp.close();
  const stopStarted = performance.now();
  const stopped = isolation ? await isolation.close() : await portal.inject({ method: "POST", url: "/api/phone-control/devices/emulator/stop", headers, payload: {} });
  stopWallMs = performance.now() - stopStarted;
  if (isolation) assert.equal(stopped.nativeStopConfirmed, true, "Confined source shutdown must authenticate native Stop");
  else { assert.equal(stopped.statusCode, 200); assert.equal(stopped.json().revoked, true); assert.equal(stopped.json().stopStatus, "completed", "Actual phone must acknowledge stop"); }
  record("Revoked MCP identity fails and actual native stop is acknowledged");
  stage = "verify raw host probe terminal evidence";
  // A process exit can precede its final stdout data; close includes stream drain.
  await eventually(() => instrumentClosed, 10000);
  assert.equal(instrumentOutputOverflow, false, "Host probe output must not be truncated");
  assertHostProbeStopped(nativeOutput, instrument.exitCode);
  record("Instrumentation cleaned its private session credential");
} catch (error) {
  const failure = safeFailure(error);
  results.push({ name: stage, passed: false, ...failure });
  console.error(`FAIL ${stage} (${failure.error}; ${failure.code})`);
  process.exitCode = 1;
} finally {
  if (instrument) samplePower("before_cleanup");
  if (previousBrokerToken === undefined) delete process.env.ORCHESTRATOR_PHONE_BROKER_TOKEN; else process.env.ORCHESTRATOR_PHONE_BROKER_TOKEN = previousBrokerToken;
  if (previousPublicKey === undefined) delete process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY; else process.env.PHONE_CONTROL_BROKER_PUBLIC_KEY = previousPublicKey;
  if (previousPortalPublicKey === undefined) delete process.env.ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY; else process.env.ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY = previousPortalPublicKey;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  cleanup = await cleanupSteps([
    { name: "remove confined source and authenticate native stop", action: async () => { if (isolation) assert.equal((await isolation.close()).nativeStopConfirmed, true); } },
    { name: "request native probe shutdown", action: async () => {
      if (!isRunning(instrument)) return;
      cleanupAdb("shell", "run-as", pkg, "touch", "files/phone-qa-stop");
      await eventually(() => !isRunning(instrument), 5000);
    } },
    { name: "stop native session", action: () => { if (instrument) cleanupAdb("shell", "am", "force-stop", pkg); } },
    { name: "remove native private probe files", action: () => { if (instrument) cleanupAdb("shell", "run-as", pkg, "rm", "-f", "files/phone-qa-token", "files/phone-qa-stop"); } },
    ...processes.map((child, index) => ({ name: `terminate owned host child ${index + 1}`, action: () => stopChild(child), timeout: 7000 })),
    { name: "close portal", action: () => portal?.close(), timeout: 5000 },
    { name: "remove owned ADB forward", action: () => { if (ownsForward) cleanupAdb("forward", "--remove", "tcp:18837"); } },
    { name: "remove host private configuration", action: () => {
      assert.ok(resolve(privateDir).startsWith(`${resolve(evidenceRoot)}${sep}`) && privateDir.endsWith(`${sep}private`));
      if (existsSync(privateDir)) rmSync(privateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } },
  ]);
  for (const item of cleanup.filter((entry) => !entry.passed)) { console.error(`FAIL cleanup: ${item.name} (${item.code})`); process.exitCode = 1; }
  const sorted = [...observationSamples].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  const sortedScreenshots = [...screenshotSamples].sort((a, b) => a - b);
  const screenshotPercentile = (fraction) => sortedScreenshots[Math.max(0, Math.ceil(sortedScreenshots.length * fraction) - 1)] ?? null;
  try { writeFileSync(join(output, "results.json"), JSON.stringify({
    serial, apiLevel, platform, fixture, passed: results.every((item) => item.passed) && cleanup.every((item) => item.passed), results, cleanup, cliObservationWallMs: timings,
    httpObservation: { attempts: observationAttempts, treeOnly: { samplesMs: observationSamples, p50Ms: percentile(0.5), p95Ms: percentile(0.95) }, screenshots: { samplesMs: screenshotSamples, p50Ms: screenshotPercentile(0.5), p95Ms: screenshotPercentile(0.95) }, failedAttempts: observationAttempts.filter((attempt) => !attempt.observed).length, definition: "Successful owner HTTP transport plus broker and native observation, separated by pixel opt-in; failed attempts retained separately; excludes model reasoning and inter-sample delay" },
      captureRecovery: { sampledRequests: recoverySummary(observationAttempts), reportedRecoveries: captureRecoveries, warningSamples: captureWarningSamples, warningLimit: "Fixed-message counts from the sampled companion PID; log loss and other capture requests prevent per-request causal attribution. Raw logs are discarded." },
      nativeMemory, powerSamples, clockDiagnostics: { samples: clockSamples, initialObservation: initialObservationClock ?? null, purpose: "Read-only clock intervals; never change deadlines or authorize retries. Observation capture timing also includes read latency." }, phaseTimings, hostProbe: { ...probeTiming, ...parseHostProbeEvidence(nativeOutput, instrument?.exitCode), adbTransport: { ...instrumentTransport.finish(), streamClosed: instrumentClosed } }, isolatedSource: { enabled: isolatedMode, ...(isolatedResult ? { sourceReported: isolatedResult, independentlyVerifiedByOwner: results.some((item) => item.passed && item.name.startsWith("Confined source SDK")) } : {}) },
    stopWallMs: stopWallMs ?? null,
    limits: ["Emulator and signed synthetic fixture only", "Two identities and CLI/MCP task equivalence; no model reasoning or parity test", "No real user accounts or external effects", "Hardware biometric and Astra model parity not established"],
  }, null, 2)); } catch { console.error("FAIL cleanup: write safe QA evidence"); process.exitCode = 1; }
  console.log(`Evidence: ${output}`);
  if (process.exitCode) setTimeout(() => process.exit(1), 1000).unref();
}
