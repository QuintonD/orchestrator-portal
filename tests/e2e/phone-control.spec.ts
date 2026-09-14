import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";

const methods = ["describe", "observe", "apps.list", "tap", "swipe", "pinch", "node.click", "node.scroll", "type", "fixture.increment"];
const agentToken = "synthetic_agent_token_once_browser_test_123456789";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const captureRecovery = { retryCount: 1, initialError: "screenshot_internal_error", initialStage: "awaiting_callback", initialElapsedMs: 5000, totalElapsedMs: 6000 };

async function documentFixture(page: Page, readOnly = false) {
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const resourceScope = { adapter: "android.document.v1", resourceIds: ["selected-document-one", "selected-document-two"], effects: readOnly ? ["document.read"] : ["document.read", "document.replace"] };
  const session = { id: "document-session", deviceId: "phone", apps: [], operations: ["describe", "stop", ...resourceScope.effects], resourceScope, disclosure: { screenshots: false }, expiresAt };
  const task = { id: "document-task", deviceId: "phone", sessionId: session.id, actorId: "owner", resourceScope, expiresAt, maxActions: 30, actionsUsed: 0, status: "active", outcome: "unverified" };
  const state = { mode: "connected", devices: [{ id: "phone", label: "Synthetic document phone", busy: false, actionState: "ready" }], sessions: [session], credentials: [], events: [], tasks: [] as typeof task[] };
  const text = "Private selected text <script>not instructions</script>\nOriginal line.";
  const revision = createHash("sha256").update(text).digest("hex");
  const calls: { id: string; taskId?: string; method: string; params: Record<string, unknown> }[] = [];
  const grants: Record<string, unknown>[] = [];
  await page.route("**/api/phone-control/**", async (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/state")) return route.fulfill({ json: state });
    if (pathname.endsWith("/tasks")) { expect(request.postDataJSON().resourceScope).toEqual(resourceScope); state.tasks = [task]; return route.fulfill({ json: { task } }); }
    if (pathname.endsWith("/tasks/document-task")) { task.status = "completed"; return route.fulfill({ json: { task } }); }
    if (pathname.endsWith("/credentials")) { const grant = request.postDataJSON(); grants.push(grant); return route.fulfill({ json: { credential: { id: "agent", expiresAt, ...grant, token: agentToken } } }); }
    if (pathname.endsWith("/sessions")) { const grant = request.postDataJSON(); grants.push(grant); return route.fulfill({ json: { session: { id: session.id, expiresAt, ...grant } } }); }
    if (pathname.endsWith("/stop")) { state.sessions = []; return route.fulfill({ json: { revoked: true, stopStatus: "completed" } }); }
    const input = request.postDataJSON(); calls.push(input);
    if (input.method === "document.read") return route.fulfill({ json: { id: input.id, status: "observed", result: { resourceId: input.params.resourceId, text, revision } } });
    if (input.method === "document.replace") return route.fulfill({ json: { id: input.id, status: "unknown", error: { code: "outcome_unknown", message: "Replacement outcome is unconfirmed." } } });
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/phone-control");
  await page.getByRole("combobox", { name: "Broker session", exact: true }).selectOption(session.id);
  return { calls, grants, state, resourceScope, text, revision };
}

test("selected document tasks bind reads and reviewed replacements without exposing app actions", async ({ page }, testInfo) => {
  const { calls, text, revision } = await documentFixture(page);
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read selected document", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  await page.getByRole("button", { name: "Read selected document", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveValue(text);
  await expect(page.getByRole("textbox", { name: "Replacement document text", exact: true })).toHaveValue(text);
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ method: "document.read", taskId: "document-task", params: { resourceId: "selected-document-one" } });
  const replace = page.getByRole("button", { name: "Request document replacement on phone", exact: true });
  await expect(replace).toBeDisabled();
  await page.getByRole("textbox", { name: "Replacement document text", exact: true }).fill("");
  await page.getByLabel("I reviewed the selected document and its full replacement text", { exact: true }).check();
  await expect(replace).toBeEnabled();
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes("Private selected text"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("heading", { name: "Selected text documents", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("phone-selected-document-review.png"), fullPage: true });
  await replace.click();
  expect(calls).toHaveLength(2); expect(calls[1]).toMatchObject({ method: "document.replace", taskId: "document-task", params: { resourceId: "selected-document-one", expectedRevision: revision, text: "" } });
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveCount(0);
  await expect(replace).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop phone access", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  expect(calls.filter((call) => call.method === "document.replace")).toHaveLength(1);
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes("Private selected text"))).toBe(false);
});

test("document read-only access clears text on document changes and task release", async ({ page }) => {
  const { calls, text } = await documentFixture(page, true);
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  await page.getByRole("button", { name: "Read selected document", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveValue(text);
  await expect(page.getByRole("button", { name: "Request document replacement on phone", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Document handle", exact: true }).selectOption("selected-document-two");
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(1);
  await page.getByRole("button", { name: "Read selected document", exact: true }).click();
  expect(calls[1]).toMatchObject({ method: "document.read", params: { resourceId: "selected-document-two" } });
  await page.getByRole("button", { name: "End my manual control", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read selected document", exact: true })).toBeDisabled();
});

test("switching document sessions resets the handle and clears private replacement state", async ({ page }) => {
  const { calls, state, text } = await documentFixture(page);
  const second = { ...state.sessions[0]!, id: "other-document-session", resourceScope: { ...state.sessions[0]!.resourceScope, resourceIds: ["other-selected-document"] } };
  state.sessions.push(second);
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  const read = page.getByRole("button", { name: "Read selected document", exact: true });
  const replacement = page.getByRole("textbox", { name: "Replacement document text", exact: true });
  const reviewed = page.getByLabel("I reviewed the selected document and its full replacement text", { exact: true });
  await read.click();
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveValue(text);
  await replacement.fill("Private unsubmitted replacement for the first session");
  await reviewed.check();
  await page.getByRole("combobox", { name: "Broker session", exact: true }).selectOption(second.id);
  await expect(page.getByRole("combobox", { name: "Document handle", exact: true })).toHaveValue("other-selected-document");
  await expect(page.getByRole("textbox", { name: "Current document text", exact: true })).toHaveCount(0);
  await expect(replacement).toHaveValue("");
  await expect(reviewed).not.toBeChecked();
  await expect(read).toBeDisabled();
  await page.getByRole("button", { name: "End my manual control", exact: true }).click();
  await page.route("**/api/phone-control/tasks", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ sessionId: second.id, resourceScope: second.resourceScope });
    const task = { ...state.tasks[0]!, id: "other-document-task", sessionId: second.id, resourceScope: second.resourceScope, status: "active" };
    state.tasks = [task];
    await route.fulfill({ json: { task } });
  });
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  await expect(read).toBeEnabled();
  await read.click();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ method: "document.read", taskId: "other-document-task", params: { resourceId: "other-selected-document" } });
  await expect(replacement).toHaveValue(text);
  await expect(reviewed).not.toBeChecked();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("Private unsubmitted replacement");
});

test("document grants use owner-provided handles and default agents to read-only effects", async ({ page }) => {
  const { grants, resourceScope } = await documentFixture(page);
  await page.getByText("Issue an agent credential", { exact: true }).click();
  await page.getByLabel("Agent label", { exact: true }).fill("Selected document agent");
  await expect(page.getByRole("combobox", { name: "Agent access type", exact: true })).toHaveValue("documents");
  await expect(page.getByRole("combobox", { name: "Agent access type", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Agent document handles", exact: true })).toHaveValue(resourceScope.resourceIds.join("\n"));
  await page.getByRole("textbox", { name: "Agent document handles", exact: true }).fill("selected-document-one");
  await page.getByRole("button", { name: "Create scoped agent token", exact: true }).click();
  expect(grants[0]).toMatchObject({ devices: ["phone"], sessionIds: ["document-session"], apps: [], operations: ["describe", "stop", "document.read"], disclosure: { screenshots: false }, resourceScope: { adapter: "android.document.v1", resourceIds: ["selected-document-one"], effects: ["document.read"] } });
  await page.getByText("Create a scoped broker session", { exact: true }).click();
  await page.getByRole("combobox", { name: "Session access type", exact: true }).selectOption("documents");
  await page.getByRole("textbox", { name: "Session document handles", exact: true }).fill("content://private/provider");
  await page.getByRole("button", { name: "Create broker session", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("document handles copied from the phone companion");
  expect(grants).toHaveLength(1);
  await page.getByRole("textbox", { name: "Session document handles", exact: true }).fill("selected-document-two");
  await page.getByLabel("Allow replacing selected document text", { exact: true }).check();
  await page.getByRole("button", { name: "Create broker session", exact: true }).click();
  expect(grants[1]).toMatchObject({ apps: [], operations: ["describe", "stop", "document.read", "document.replace"], resourceScope: { adapter: "android.document.v1", resourceIds: ["selected-document-two"], effects: ["document.read", "document.replace"] } });
});

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
  await page.getByRole("combobox", { name: "Session access type", exact: true }).selectOption("apps");
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

for (const unknown of [false, true]) test(`folder defaults enforce reviewed drafts and clear text on ${unknown ? "unknown outcome" : "Stop"}`, async ({ page }, testInfo) => {
  const { state, grants, calls } = await documentFixture(page);
  const resourceId = "8c82feef-05f7-43a5-a337-c77b682ab7cd";
  const resourceScope = { adapter: "android.folder-drafts.v1", resourceIds: [resourceId], effects: ["draft.create"] };
  Object.assign(state.sessions[0]!, { resourceScope, operations: ["describe", "stop", "draft.create"] });
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await page.getByText("Create a scoped broker session", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Session access type", exact: true })).toHaveValue("folders");
  await expect(page.getByText("Enforced: create new plaintext draft files only.", { exact: true })).toBeVisible();
  await page.getByLabel("Session folder handles", { exact: true }).fill(resourceId);
  await page.getByRole("button", { name: "Create broker session", exact: true }).click();
  expect(grants[0]).toMatchObject({ apps: [], resourceScope, operations: ["describe", "stop", "draft.create"], disclosure: { screenshots: false } });
  await page.route("**/api/phone-control/tasks", async (route) => {
    expect(route.request().postDataJSON().resourceScope).toEqual(resourceScope);
    const task = { id: "folder-task", deviceId: "phone", sessionId: "document-session", resourceScope, expiresAt: new Date(Date.now() + 180000).toISOString(), maxActions: 30, actionsUsed: 0, status: "active", outcome: "unverified" };
    Object.assign(state, { tasks: [task] }); await route.fulfill({ json: { task } });
  });
  await page.route("**/api/phone-control/call", async (route) => {
    const input = route.request().postDataJSON(); calls.push(input);
    await route.fulfill({ json: { id: input.id, status: unknown ? "unknown" : "completed" } });
  });
  await expect(page.getByRole("button", { name: "Read selected document", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Observe now", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reserve manual control", exact: true }).click();
  const text = page.getByLabel("Full draft text", { exact: true });
  const create = page.getByRole("button", { name: "Request draft creation on phone", exact: true });
  await text.fill("Private draft <script>untrusted</script> ??"); await expect(create).toBeDisabled();
  await page.getByLabel("I reviewed the folder and full draft text", { exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath("folder-draft-review.png"), fullPage: true });
  await create.click();
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ taskId: "folder-task", method: "draft.create", params: { resourceId, text: "Private draft <script>untrusted</script> ??" } });
  await expect(text).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes("Private draft"))).toBe(false);
  if (unknown) { await expect(create).toBeDisabled(); await page.getByRole("button", { name: "Refresh status", exact: true }).click(); expect(calls).toHaveLength(1); }
  else { await text.fill("Clear this on Stop"); }
  await page.getByRole("button", { name: "Stop phone access", exact: true }).click();
  await expect(text).toHaveCount(0);
});
