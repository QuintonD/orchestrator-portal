import assert from "node:assert/strict";

const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
const qualified = `${identifier}(?:\\.${identifier})+`;
const flattenedComponent = new RegExp(`^(${qualified})/(\\.?${identifier}(?:\\.${identifier})*)$`);

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

/** Observe the force-stop receiver's side effect, never retry the stop or rewrite settings. */
export async function waitForNativeServiceRemoval({ component, enabledBeforeStop, stopSucceeded, query,
  now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  assert.equal(enabledBeforeStop, true, "Native accessibility must be known enabled before force-stop");
  assert.equal(stopSucceeded, true, "Native force-stop must complete before checking its effect");
  const started = now();
  const deadline = started + 10000;
  let samples = 0;
  while (now() < deadline) {
    const result = await query(Math.max(1, Math.min(2000, Math.floor(deadline - now()))));
    samples++;
    const enabled = requireServiceState(result, component);
    if (now() >= deadline) break;
    if (!enabled) return { observed: true, elapsedMs: Math.round(now() - started), samples };
    await sleep(Math.min(200, deadline - now()));
  }
  throw Object.assign(new Error("Native accessibility removal was not observed before the deadline"), { code: "ETIMEDOUT" });
}
