import assert from "node:assert/strict";

const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
const qualified = `${identifier}(?:\\.${identifier})+`;
const flattenedComponent = new RegExp(`^(${qualified})/(\\.?${identifier}(?:\\.${identifier})*)$`);
const querySignals = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGHUP"]);
const queryErrorCodes = new Set(["ETIMEDOUT", "ENOENT", "EACCES", "EPERM", "ENOBUFS", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", "EINTR", "EIO", "ECONNRESET", "ABORT_ERR", "ESRCH"]);
const removalFailures = new WeakMap();

function canonicalComponent(value) {
  if (typeof value !== "string" || value.length > 512) return null;
  const match = flattenedComponent.exec(value);
  if (!match || match[0] !== value) return null;
  const [, pkg, name] = match;
  return `${pkg}/${name.startsWith(".") ? pkg + name : name}`;
}

/** A complete settings reply is required; empty transport output is not absence. */
export function enabledServiceState(output, component) {
  const target = canonicalComponent(component);
  if (!target || typeof output !== "string" || Buffer.byteLength(output) > 4096) return null;
  const reply = /^([^\r\n]*)(?:\r{0,2}\n)$/.exec(output);
  if (!reply || reply[0] !== output) return null;
  const line = reply[1];
  // AccessibilityManagerService persists null when the enabled set becomes empty.
  if (line === "" || line === "null") return false;
  const services = line.split(":").map(canonicalComponent);
  if (services.length > 64 || services.includes(null) || new Set(services).size !== services.length) return null;
  return services.includes(target);
}

export function requireServiceState(result, component) {
  assert.ok(result && !result.error && result.status === 0 && result.signal === null
    && result.stderr === "", "Native accessibility query must complete successfully");
  const enabled = enabledServiceState(result.stdout, component);
  assert.notEqual(enabled, null, "Native accessibility query must return a complete valid setting");
  return enabled;
}

/** Numeric/process facts and parsed state only; never retain settings, paths or messages. */
export function serviceQueryFacts(result, component) {
  const enabled = enabledServiceState(result?.stdout, component);
  return {
    status: Number.isSafeInteger(result?.status) && result.status >= -2147483648 && result.status <= 4294967295 ? result.status : null,
    signal: querySignals.has(result?.signal) ? result.signal : null,
    signalPresent: result?.signal === null ? false : typeof result?.signal === "string" ? true : null,
    errorPresent: Boolean(result?.error),
    errorCode: queryErrorCodes.has(result?.error?.code) ? result.error.code : null,
    stderrEmpty: typeof result?.stderr === "string" ? result.stderr === "" : null,
    stdoutBytes: typeof result?.stdout === "string" ? Math.min(4097, Buffer.byteLength(result.stdout)) : null,
    commandSucceeded: Boolean(result && !result.error && result.status === 0 && result.signal === null && result.stderr === ""),
    parseValid: enabled !== null,
    enabled,
  };
}

// Only facts created here can reach the harness; an arbitrary thrown error cannot supply them.
export function nativeRemovalFailureFacts(error) {
  return error !== null && (typeof error === "object" || typeof error === "function") ? removalFailures.get(error) ?? null : null;
}

/** Observe the force-stop receiver's side effect, never retry the stop or rewrite settings. */
export async function waitForNativeServiceRemoval({ component, enabledBeforeStop, stopSucceeded, query,
  now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  assert.equal(enabledBeforeStop, true, "Native accessibility must be known enabled before force-stop");
  assert.equal(stopSucceeded, true, "Native force-stop must complete before checking its effect");
  const started = now();
  const deadline = started + 10000;
  let samples = 0;
  let lastQuery = null;
  let reason = "deadline";
  try {
    while (now() < deadline) {
      reason = "query_threw";
      samples++;
      const result = await query(Math.max(1, Math.min(2000, Math.floor(deadline - now()))));
      lastQuery = serviceQueryFacts(result, component);
      reason = lastQuery.commandSucceeded ? "invalid_reply" : "query_failed";
      const enabled = requireServiceState(result, component);
      reason = "deadline";
      if (now() >= deadline) break;
      if (!enabled) return { observed: true, elapsedMs: Math.round(now() - started), samples };
      await sleep(Math.min(200, deadline - now()));
    }
    throw Object.assign(new Error("Native accessibility removal was not observed before the deadline"), { code: "ETIMEDOUT" });
  } catch (error) {
    if (error !== null && (typeof error === "object" || typeof error === "function")) {
      if (reason === "query_threw") lastQuery = serviceQueryFacts({ error, status: error.status, signal: error.signal, stdout: error.stdout, stderr: error.stderr }, component);
      const elapsed = Math.round(now() - started);
      removalFailures.set(error, { observed: false, reason, elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.min(180000, elapsed)) : null,
        samples: Math.min(100, samples), lastQuery });
    }
    throw error;
  }
}
