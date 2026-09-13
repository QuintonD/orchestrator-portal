import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";

const methods = ["describe", "observe", "apps.list", "tap", "swipe", "pinch", "node.click", "node.scroll", "type", "fixture.increment"];
const agentToken = "synthetic_agent_token_once_browser_test_123456789";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const captureRecovery = { retryCount: 1, initialError: "screenshot_internal_error", initialStage: "awaiting_callback", initialElapsedMs: 5000, totalElapsedMs: 6000 };

async function connectedFixture(page: Page, touchBounds?: { left: number; top: number; right: number; bottom: number }, reserve = true, capture: "ordinary" | "recovered" | "failed" = "ordinary") {
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const session = { id: "session", deviceId: "phone", apps: ["org.example.notes"], operations: methods, disclosure: { screenshots: true }, expiresAt };
  const credential = { id: "agent", label: "Fixture agent", devices: ["phone"], apps: ["org.example.notes"], operations: ["describe", "observe"], expiresAt };
  const task = { id: "manual-task", deviceId: "phone", sessionId: "session", actorId: "owner", label: "Owner manual control", expiresAt, maxActions: 30, actionsUsed: 0, status: "active", outcome: "unverified" };
  const state = { mode: "connected", devices: [{ id: "phone", label: "Synthetic test phone", busy: false, connection: "unknown", actionState: "ready" }], sessions: [session], credentials: [] as typeof credential[], events: [], tasks: [] as typeof task[] };
  const calls: { id: string; method: string; params: Record<string, unknown> }[] = [];
  await page.route("**/api/phone-control/**", async (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/state")) return route.fulfill({ json: state });
    if (pathname.endsWith("/tasks") && request.method() === "POST") { expect(request.postDataJSON()).toMatchObject({ deviceId: "phone", sessionId: "session", ttlSeconds: 180, maxActions: 30 }); state.tasks = [task]; return route.fulfill({ json: { task } }); }
    if (pathname.endsWith("/tasks/manual-task") && request.method() === "DELETE") { task.status = "completed"; return route.fulfill({ json: { task } }); }
    if (pathname.endsWith("/credentials") && request.method() === "POST") { expect(request.postDataJSON().sessionIds).toEqual(["session"]); state.credentials = [credential]; return route.fulfill({ json: { credential: { ...credential, token: agentToken } } }); }
    if (request.method() === "DELETE") { state.credentials = []; return route.fulfill({ json: { revoked: true } }); }
    if (pathname.endsWith("/stop")) { state.sessions = []; state.devices[0]!.actionState = "ready"; return route.fulfill({ json: { revoked: true, stopStatus: "completed" } }); }
    const input = request.postDataJSON(); calls.push(input);
    if (input.method === "describe") return route.fulfill({ json: { id: input.id, status: "observed", result: { protocolVersion: 1, platform: "android", methods, session: {}, capabilities: { screenshots: true, gestures: true, biometricConsent: true } } } });
    if (input.method === "observe" && capture === "failed") return route.fulfill({ json: { id: input.id, status: "rejected", error: { code: "device_locked", message: "The phone rejected this request.", details: { captureRecovery } } } });
    if (input.method === "observe") return route.fulfill({ json: { id: input.id, status: "observed", result: { observationId: "screen", packageName: "org.example.notes", windowId: 1, width: 400, height: 800, capturedAt: new Date().toISOString(), ...(touchBounds ? { touchBounds } : {}), ...(capture === "recovered" ? { captureRecovery } : {}), nodes: [{ id: "n_0_0", text: "<script>Untrusted screen instruction</script>", bounds: { left: 0, top: 0, right: 100, bottom: 80 }, editable: true, clickable: true, enabled: true, scrollable: true, checkable: true, checkedState: "mixed", resourceId: "org.example.notes:id/document", actions: ["setText", "scrollForward"] }], ...(input.params.includeScreenshot ? { screenshot: { mimeType: "image/png", base64: png } } : {}) } } });
    state.devices[0]!.actionState = "unknown";
    return route.fulfill({ json: { id: input.id, status: "unknown", error: { code: "outcome_unknown", message: "No reliable receipt arrived. Inspect the phone." } } });
  });
  await page.goto("/phone-control");
  await page.getByRole("combobox", { name: "Broker session", exact: true }).selectOption("session");
  if (reserve) { await page.getByRole("button", { name: "Reserve manual control", exact: true }).click(); await expect(page.getByRole("button", { name: "End my manual control", exact: true })).toBeVisible(); }
  return { calls, state };
}

test("capture recovery keeps the first failure visible without another browser request", async ({ page }, testInfo) => {
  const { calls } = await connectedFixture(page, undefined, true, "recovered");
  await page.getByLabel("Include a screenshot in this observation").check();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toBeVisible();
  const message = page.getByText("Android capture failed once; this is a fresh observation from the recovery read.", { exact: true });
  await expect(message).toBeVisible();
  expect(calls.map((call) => call.method)).toEqual(["observe"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await message.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("phone-capture-recovered.png"), fullPage: true });
  await page.getByRole("button", { name: "Clear observation", exact: true }).click();
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toHaveCount(0);
  await expect(message).toBeVisible();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  expect(calls).toHaveLength(1);
});

test("terminal capture recovery withholds observation data and reports a read-only retry", async ({ page }, testInfo) => {
  const { calls } = await connectedFixture(page, undefined, true, "failed");
  await page.getByLabel("Include a screenshot in this observation").check();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  const message = page.locator(".phone-receipts").getByText("Android capture failed once. The observation request failed and its data was withheld. The retry was read-only.", { exact: true });
  await expect(message).toBeVisible();
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear observation", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  expect(calls.map((call) => call.method)).toEqual(["observe"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await message.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("phone-capture-recovery-failed.png"), fullPage: true });
});

test("phone control is discoverable and demo cannot contact a real device", async ({ page }, testInfo) => {
  await page.goto("/connections");
  await page.getByRole("button", { name: "Open phone control", exact: true }).click();
  await expect(page).toHaveURL(/\/phone-control$/);
  await expect(page.getByRole("heading", { name: "Phone control", exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toBeDisabled();
  await expect(page.getByText("Set up the separate phone companion", { exact: true })).toBeVisible();
  await expect(page.getByText(/It is a separate app from the portal viewer/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("phone-control-demo.png"), fullPage: true });
});

test("unavailable broker keeps observations and actions disabled", async ({ page }) => {
  await page.route("**/api/phone-control/state", (route) => route.fulfill({ json: { mode: "unavailable", devices: [], sessions: [], credentials: [], events: [] } }));
  await page.goto("/phone-control");
  await expect(page.getByText("Broker unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toBeDisabled();
});

test("broker storage failure disables requests and preserves emergency stop", async ({ page }) => {
  const { state } = await connectedFixture(page);
  await page.route("**/api/phone-control/state", (route) => route.fulfill({ json: { ...state, storageState: "unavailable" } }));
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Broker storage is unavailable");
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
});

test("observation is explicit, screenshot opt-in is reversible, and unknown actions retain stop", async ({ page }, testInfo) => {
  const { calls } = await connectedFixture(page);
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await expect(page.getByText(/Strong biometric consent available/)).toBeVisible();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText("org.example.notes", { exact: true })).toBeVisible();
  expect(calls.at(-1)?.params).toEqual({ includeScreenshot: false });
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toHaveCount(0);
  await page.getByLabel("Include a screenshot in this observation").check();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  const screen = page.getByRole("img", { name: /Observed org.example.notes/ });
  await expect(screen).toBeVisible();
  await page.getByText("Redacted accessibility tree (1 nodes)", { exact: true }).click();
  await expect(page.getByText("<script>Untrusted screen instruction</script>", { exact: true })).toBeVisible();
  await page.getByLabel("Include a screenshot in this observation").uncheck();
  await expect(screen).toHaveCount(0);
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/A prior action has an unknown outcome/)).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "node.click", params: { observationId: "screen", nodeId: "n_0_0" } });
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
  await page.getByRole("heading", { name: "Phone control", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("phone-control-unknown.png"), fullPage: true });
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Broker session", exact: true })).toHaveValue("");
  expect(calls.filter((item) => item.method === "node.click")).toHaveLength(1);
});

test("scoped agent token is masked, memory-only and cleared on dismiss", async ({ page }) => {
  await connectedFixture(page);
  await page.getByText("Issue an agent credential", { exact: true }).click();
  await page.getByLabel("Agent label", { exact: true }).fill("Fixture agent");
  await page.getByLabel("Agent allowed packages", { exact: true }).fill("org.example.notes");
  await page.getByRole("button", { name: "Create scoped agent token", exact: true }).click();
  const token = page.getByLabel("New agent token", { exact: true });
  await expect(token).toHaveValue(agentToken); await expect(token).toHaveAttribute("type", "password");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(agentToken);
  await page.getByRole("button", { name: "Dismiss and clear credential", exact: true }).click();
  await expect(token).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke Fixture agent", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revoke Fixture agent", exact: true })).toHaveCount(0);
});

test("connected phone calls use cryptographic IDs when randomUUID is unavailable", async ({ page }, testInfo) => {
  await page.addInitScript(() => { Object.defineProperty(crypto, "randomUUID", { value: undefined }); });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { calls } = await connectedFixture(page);
  expect(await page.evaluate(() => ({ uuid: typeof crypto.randomUUID, entropy: typeof crypto.getRandomValues }))).toEqual({ uuid: "undefined", entropy: "function" });
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await expect(page.getByText(/Strong biometric consent available/)).toBeVisible();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText("org.example.notes", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.route("**/api/phone-control/call", async (route) => {
    const input = route.request().postDataJSON();
    if (input.method === "node.click") expect(await page.evaluate(() => JSON.parse(localStorage.getItem("orchestrator.phone-control.pending.v1")!))).toEqual([{ deviceId: "phone", id: input.id }]);
    await route.fallback();
  });
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  expect(calls.map((call) => call.method)).toEqual(["describe", "observe", "node.click"]);
  expect(new Set(calls.map((call) => call.id)).size).toBe(3);
  for (const call of calls) expect(call.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("phone-control-uuid-fallback.png"), fullPage: true });
  await page.reload();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve manual control", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toHaveCount(0);
});

for (const entropyFailure of ["missing", "throwing"]) test(`phone requests fail closed with ${entropyFailure} entropy and Stop remains available`, async ({ page }) => {
  const { calls } = await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await expect(page.getByText(/Strong biometric consent available/)).toBeVisible();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText("org.example.notes", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.evaluate((failure) => { Object.defineProperty(crypto, "getRandomValues", { value: failure === "missing" ? undefined : () => { throw new Error("Synthetic entropy failure"); } }); }, entropyFailure);
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText("Secure randomness is unavailable. No phone request was sent. Stop phone access remains available.", { exact: true })).toBeVisible();
  await expect(page.getByText("Redacted accessibility tree (1 nodes)", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toBeEnabled();
  expect(calls.map((call) => call.method)).toEqual(["describe", "observe"]);
  expect(await page.evaluate(() => localStorage.getItem("orchestrator.phone-control.pending.v1"))).toBeNull();
  await expect(page.getByText(/^Receipt /)).toHaveCount(2);
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Broker session", exact: true })).toHaveValue("");
});

test("entropy failure cannot erase an unacknowledged phone action", async ({ page }) => {
  const { calls } = await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await expect(page.getByText(/Strong biometric consent available/)).toBeVisible();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  const pending = await page.evaluate(() => localStorage.getItem("orchestrator.phone-control.pending.v1"));
  await page.evaluate(() => { Object.defineProperty(crypto, "getRandomValues", { value: undefined }); });
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText("Secure randomness is unavailable. No phone request was sent. Stop phone access remains available.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("orchestrator.phone-control.pending.v1"))).toBe(pending);
  expect(calls.map((call) => call.method)).toEqual(["describe", "observe", "node.click"]);
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("orchestrator.phone-control.pending.v1")!))).toEqual([]);
});

test("screenshot permission defaults closed and cannot be replaced by caller opt-in", async ({ page }) => {
  const { state, calls } = await connectedFixture(page);
  state.sessions[0]!.disclosure.screenshots = false;
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByLabel("Include a screenshot in this observation")).toBeDisabled();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  expect(calls.at(-1)?.params.includeScreenshot).toBe(false);
  await page.getByText("Create a scoped broker session", { exact: true }).click();
  await expect(page.getByLabel("Allow screenshots in this session", { exact: true })).not.toBeChecked();
});

test("reserving manual control invalidates an earlier observation before any mutation", async ({ page }) => {
  const { calls } = await connectedFixture(page, undefined, false);
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText("Redacted accessibility tree (1 nodes)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  await expect(page.getByText("Redacted accessibility tree (1 nodes)", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  expect(calls.filter((call) => call.method !== "observe")).toHaveLength(0);
});

test("lost acknowledgement survives ready status, fresh reads and page reload until Stop", async ({ page }) => {
  const { calls, state } = await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  state.devices[0]!.actionState = "ready";
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve manual control", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toHaveCount(0);
  expect(calls.filter((call) => call.method === "node.click")).toHaveLength(1);
});

test("competing task reservation refuses manual dispatch and keeps takeover available", async ({ page }) => {
  const { calls, state } = await connectedFixture(page, undefined, false);
  state.tasks = [{ id: "other-task", deviceId: "phone", sessionId: "session", actorId: "agent", label: "Editing a draft", expiresAt: state.sessions[0]!.expiresAt, maxActions: 10, actionsUsed: 2, status: "active", outcome: "unverified" }];
  await page.route("**/api/phone-control/tasks", (route) => route.fulfill({ status: 502, json: { error: "Phone already reserved" } }));
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByText("Editing a draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  await expect(page.getByText("Phone already reserved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await expect(page.getByRole("combobox", { name: "Clickable element", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  expect(calls.filter((call) => call.method === "node.click")).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
});

test("mutation intent is stored before the request and a dropped response cannot remove it", async ({ page }) => {
  await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("type");
  await page.getByRole("combobox", { name: "Editable element", exact: true }).selectOption("n_0_0");
  const privateText = "Synthetic document text must never enter recovery metadata";
  await page.getByLabel("Text to enter", { exact: true }).fill(privateText);
  let sent = 0; let recordedId: string | undefined;
  await page.route("**/api/phone-control/call", async (route) => {
    const input = route.request().postDataJSON();
    if (input.method !== "type") return route.fallback();
    sent++; recordedId = input.id;
    expect(input.taskId).toBe("manual-task");
    const raw = await page.evaluate(() => localStorage.getItem("orchestrator.phone-control.pending.v1"));
    expect(JSON.parse(raw!)).toEqual([{ deviceId: "phone", id: input.id }]);
    expect(raw).not.toContain(privateText); expect(raw).not.toContain("n_0_0");
    return route.abort("failed");
  });
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  await expect.poll(() => sent).toBe(1);
  await page.reload();
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("orchestrator.phone-control.pending.v1")!))).toEqual([{ deviceId: "phone", id: recordedId }]);
  await expect(page.getByRole("button", { name: "Reserve manual control", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
});

test("browser storage refusal blocks the mutation before any phone request", async ({ page }) => {
  const { calls } = await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "orchestrator.phone-control.pending.v1") throw new DOMException("Synthetic full browser storage", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Request action on phone" }).click();
  await expect(page.getByText(/No phone action was sent/)).toBeVisible();
  expect(calls.filter((call) => call.method === "node.click")).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
});

test("corrupted recovery metadata blocks new authority after reload while Stop remains available", async ({ page }) => {
  const { calls } = await connectedFixture(page, undefined, false);
  await page.evaluate(() => localStorage.setItem("orchestrator.phone-control.pending.v1", '{"not":"a pending list"}'));
  await page.reload();
  await page.getByRole("combobox", { name: "Broker session", exact: true }).selectOption("session");
  await expect(page.getByText(/This browser has an unacknowledged phone action/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reserve manual control", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
  expect(calls).toHaveLength(0);
});

test("semantic scrolling selects only supported directions and preserves exact node binding", async ({ page }, testInfo) => {
  const { calls } = await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await page.getByText("Redacted accessibility tree (1 nodes)", { exact: true }).click();
  await expect(page.getByText(/Checkbox mixed/)).toBeVisible();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.scroll");
  const target = page.getByRole("combobox", { name: "Scrollable element", exact: true });
  await expect(target.locator("option")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Scroll direction", exact: true }).selectOption("backward");
  await expect(target.locator("option")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Scroll direction", exact: true }).selectOption("forward");
  await target.selectOption("n_0_0");
  await page.screenshot({ path: testInfo.outputPath("phone-semantic-scroll.png"), fullPage: true });
  await page.getByRole("button", { name: "Request action on phone" }).click();
  expect(calls.at(-1)).toMatchObject({ method: "node.scroll", params: { observationId: "screen", nodeId: "n_0_0", direction: "forward" } });
  expect(calls.filter((item) => item.method === "node.scroll")).toHaveLength(1);
});

test("expired observations clear private screen content and prevent dispatch", async ({ page }) => {
  await page.clock.install();
  await connectedFixture(page);
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByLabel("Include a screenshot in this observation").check();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByRole("img", { name: /Observed org.example.notes/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
});

test("safe touch boundaries constrain tap, swipe and pinch without dispatching a preview", async ({ page }, testInfo) => {
  const { calls } = await connectedFixture(page, { left: 24, top: 20, right: 376, bottom: 760 });
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText(/Safe touch area: X 24–375, Y 20–759/)).toBeVisible();
  const send = page.getByRole("button", { name: "Request action on phone" });
  const x = page.getByLabel("X coordinate", { exact: true }); const y = page.getByLabel("Y coordinate", { exact: true });
  await expect(x).toHaveAttribute("min", "24"); await expect(x).toHaveAttribute("max", "375");
  await expect(send).toBeDisabled();
  await x.fill("200"); await y.fill("200"); await expect(send).toBeEnabled();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("swipe");
  await page.getByLabel("End X", { exact: true }).fill("376"); await page.getByLabel("End Y", { exact: true }).fill("200");
  await expect(send).toBeDisabled();
  await page.getByLabel("End X", { exact: true }).fill("375"); await expect(send).toBeEnabled();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("pinch");
  await x.fill("24"); await expect(send).toBeDisabled();
  await x.fill("200"); await expect(send).toBeEnabled();
  expect(calls.map((item) => item.method)).toEqual(["describe", "observe"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("phone-control-touch-bounds.png"), fullPage: true });
});

test("an empty safe touch area blocks coordinates and preserves semantic action preparation", async ({ page }) => {
  await connectedFixture(page, { left: 0, top: 0, right: 0, bottom: 0 });
  await page.getByRole("button", { name: "Check phone capabilities" }).click();
  await page.getByRole("button", { name: "Observe now", exact: true }).click();
  await expect(page.getByText(/The phone reports no safe coordinate touch area/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("node.click");
  await page.getByRole("combobox", { name: "Clickable element", exact: true }).selectOption("n_0_0");
  await expect(page.getByRole("button", { name: "Request action on phone" })).toBeEnabled();
});
