// Test-harness failures must not export exception messages, child output or credentials.
const errorNames = new Set(["Error", "AssertionError", "TypeError", "SyntaxError", "RangeError", "AbortError"]);
const errorCodes = new Set(["ERR_ASSERTION", "ENOENT", "EACCES", "EPERM", "ETIMEDOUT", "ECONNREFUSED", "ABORT_ERR", "CLEANUP_TIMEOUT", "CHILD_EXIT_TIMEOUT"]);
export function safeFailure(error) {
  const code = error?.code;
  return {
    error: errorNames.has(error?.name) ? error.name : "Error",
    code: errorCodes.has(code) || typeof code === "string" && /^cli_exit_(?:-?\d+|null)$/.test(code) ? code : "check_failed",
  };
}

export async function within(action, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Cleanup deadline exceeded"), { code: "CLEANUP_TIMEOUT" })), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Every step is attempted even if an earlier stop, close, or deletion fails. */
export async function cleanupSteps(steps) {
  const results = [];
  for (const { name, action, timeout = 18000 } of steps) {
    try { await within(action, timeout); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, ...safeFailure(error) }); }
  }
  return results;
}

export const isRunning = (child) => Boolean(child?.pid && child.exitCode === null && child.signalCode === null);

/** Kill only a child this runner spawned; a PID supplied by a user is never accepted. */
export async function stopChild(child) {
  if (!isRunning(child)) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.stdin?.destroy();
  child.kill();
  try { await within(() => closed, 3000); }
  catch {
    if (isRunning(child)) child.kill("SIGKILL");
    try { await within(() => closed, 3000); }
    catch { throw Object.assign(new Error("Child did not exit"), { code: "CHILD_EXIT_TIMEOUT" }); }
  }
}
