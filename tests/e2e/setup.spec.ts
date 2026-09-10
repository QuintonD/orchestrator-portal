import { createServer } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as base, expect } from "./fixtures.js";
// Exercise the actual private gateway and authentication, without the sample
// workspace's preconnected runtime or prepared team masking first-run gaps.

const test = base.extend<{ workspace: { url: string; directory: string } }>({
  workspace: async ({ page }, use) => {
    const root = path.resolve("test-results", "onboarding-workspaces");
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(path.join(root, "private-"));
    const child = spawn(process.execPath, ["tests/e2e/private-gateway.mjs", directory], { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, env: { ...process.env, NODE_ENV: "test" } });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Private test gateway did not start")), 15_000);
        child.once("message", (message: { url: string }) => { clearTimeout(timer); resolve(message.url); });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("exit", () => { clearTimeout(timer); reject(new Error("Private test gateway exited before startup")); });
      });
      await page.goto(url);
      await page.getByLabel("Your name").fill("Setup operator");
      await page.getByLabel("Passphrase", { exact: true }).fill("Synthetic setup passphrase");
      await page.getByRole("button", { name: "Create workspace", exact: true }).click();
      await expect(page).toHaveURL(`${url}/setup`);
      await expect(page.getByRole("heading", { name: "Make this workspace yours" })).toBeVisible();
      await use({ url, directory });
    } finally {
      await page.goto("about:blank");
      if (child.connected) child.send("stop");
      const timer = setTimeout(() => child.kill(), 5_000);
      await exited; clearTimeout(timer);
      if (!directory.startsWith(`${root}${path.sep}`)) throw new Error("Workspace cleanup escaped test directory");
      await rm(directory, { recursive: true, force: true });
    }
  },
});

test("fresh setup prepares a real local brief and can continue locally without connections", async ({ page, workspace }, testInfo) => {
  await expect(page.getByRole("heading", { name: "Your first local brief is ready" })).toBeVisible();
  const connections = await (await page.request.get(`${workspace.url}/api/connectors`)).json();
  expect(connections.connectors).toHaveLength(0);
  await page.getByRole("button", { name: "Start with this workspace", exact: false }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start with this workspace", exact: false })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Read my local brief" }).click();
  await expect(page.getByRole("dialog")).toContainText("Local guide");
  await page.goto(`${workspace.url}/setup?flow=local`);
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page).toHaveURL(`${workspace.url}/personal`);
  await page.goto(`${workspace.url}/setup`);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`first-run-${theme}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Continue later" }).click();
  await page.getByRole("button", { name: "Set up my flow" }).click();
  await expect(page).toHaveURL(`${workspace.url}/setup`);
});

test("assistant setup recovers a saved source, prepares one role and sends only after review", async ({ page, workspace }, testInfo) => {
  let checks = 0;
  const turns: unknown[] = [];
  const runtime = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/models") {
      checks++;
      if (checks === 1) response.writeHead(503).end("{}");
      else response.end(JSON.stringify({ data: [{ id: "setup-fixture" }] }));
    } else if (request.url === "/v1/chat/completions") {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      turns.push(JSON.parse(Buffer.concat(chunks).toString()));
      response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "What outcome would you like to start with?" } }] }));
    } else response.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) => runtime.listen(0, "127.0.0.1", resolve));
  try {
    await page.getByRole("button", { name: "Local model or subscription", exact: false }).click();
    const dialog = page.getByRole("dialog", { name: "Add connection" });
    await dialog.getByLabel("Connection name").fill("My local assistant");
    await dialog.getByLabel("API base address").fill(`http://127.0.0.1:${(runtime.address() as AddressInfo).port}/v1`);
    await dialog.getByLabel("Access mode").selectOption("local");
    await dialog.getByLabel("Model ID").fill("setup-fixture");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Add and check" }).click();
    await expect(dialog.getByRole("heading", { name: "Connection saved; one more step" })).toBeVisible();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    const resumeUrl = page.url();
    await page.reload();
    await expect(page.getByRole("button", { name: "Prepare one assistant" })).toHaveCount(0);
    await page.getByRole("button", { name: "Check connection", exact: true }).click();
    await page.getByRole("button", { name: "Prepare one assistant" }).click();
    const team = page.getByRole("dialog", { name: "A team, already prepared" });
    await expect(team.getByRole("checkbox", { checked: true })).toHaveCount(1);
    await expect(team.getByLabel("Prepare the first brief", { exact: false })).not.toBeChecked();
    await expect(team.getByRole("button", { name: "Add prepared team" })).toBeDisabled();
    await expect(team.getByLabel("Configured provider")).toHaveValue("local");
    await expect(team.getByLabel("Configured provider")).toBeDisabled();
    await team.getByLabel("The runtime is already restricted", { exact: false }).check();
    await team.getByRole("button", { name: "Add prepared team" }).click();
    await expect(team).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open my first conversation" })).toBeVisible();
    expect(turns).toHaveLength(0);
    await page.reload();
    const saved = await (await page.request.get(`${workspace.url}/api/connectors`)).json(); expect(saved.connectors).toHaveLength(1);
    const profiles = await (await page.request.get(`${workspace.url}/api/assistants`)).json();
    expect(profiles.assistants.filter((item: { mode: string }) => item.mode === "runtime")).toHaveLength(1);
    await page.getByRole("button", { name: "Open my first conversation" }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(/Ask what outcome I want/);
    expect(turns).toHaveLength(0);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.locator(".message--assistant")).toContainText("What outcome would you like to start with?");
    await expect(page.locator(".message--assistant")).toContainText("claimed");
    expect(turns).toHaveLength(1);
    await page.goto(`${workspace.url}/agents`);
    await page.getByRole("button", { name: "Pause dispatch", exact: true }).click();
    await page.goto(resumeUrl);
    await expect(page.getByRole("heading", { name: "Your assistant needs a check" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open my first conversation" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("paused-setup.png"), fullPage: true });
  } finally {
    runtime.closeAllConnections(); await new Promise<void>((resolve) => runtime.close(() => resolve()));
  }
});

test("knowledge setup retains index consent and leads directly to searchable evidence", async ({ page, workspace }, testInfo) => {
  const notes = path.join(workspace.directory, "chosen-notes");
  await mkdir(notes); await writeFile(path.join(notes, "first.md"), "# Setup evidence\n\nA synthetic note for the first search.");
  await writeFile(path.join(notes, "binary.md"), Buffer.from("unsupported\0binary"));
  await page.getByRole("button", { name: "Bring my notes", exact: false }).click();
  await page.getByRole("button", { name: "Local documents", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Add connection" });
  await dialog.getByLabel("Document folder").fill(notes);
  await dialog.getByRole("button", { name: "Add and check" }).click();
  await expect(dialog.getByLabel("Index the selected documents", { exact: false })).toBeFocused();
  expect((await (await page.request.get(`${workspace.url}/api/connectors`)).json()).connectors).toHaveLength(0);
  await dialog.getByLabel("Index the selected documents", { exact: false }).check();
  await dialog.getByRole("button", { name: "Add and check" }).click();
  await expect(dialog.getByRole("heading", { name: "Your source is ready with limited coverage" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Bring my notes", exact: false })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Search my knowledge" })).toBeVisible();
  await expect(page.getByText("Some content is available", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("knowledge-ready.png"), fullPage: true });
  await page.getByRole("button", { name: "Search my knowledge" }).click();
  await expect(page.getByRole("heading", { name: "Setup evidence", exact: true })).toBeVisible();
});

test("discovery and setup failures stay actionable without erasing progress", async ({ page, workspace }) => {
  await page.route("**/api/setup/discovery", (route) => route.fulfill({ status: 503, json: { error: "Synthetic offline discovery" } }));
  await page.goto(`${workspace.url}/setup?flow=assistant&source=removed-source`);
  await expect(page.getByText("That connection is no longer available", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Local model or subscription", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry discovery" })).toBeVisible();
  await page.unroute("**/api/setup/discovery");
  await page.getByRole("button", { name: "Retry discovery" }).click();
  await expect(page.getByRole("button", { name: "Retry discovery" })).toHaveCount(0);
  await page.route("**/api/connectors", (route) => route.fulfill({ status: 503, json: { error: "Synthetic unavailable setup" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Synthetic unavailable setup");
  await expect(page.getByRole("heading", { name: "Your first local brief is ready" })).toHaveCount(0);
  await page.unroute("**/api/connectors");
  await page.getByRole("button", { name: "Retry setup" }).click();
  await expect(page.getByRole("heading", { name: "Your first local brief is ready" })).toBeVisible();
});

test("a failed knowledge check does not claim partial content is available", async ({ page, workspace }) => {
  await page.getByRole("button", { name: "Bring my notes", exact: false }).click();
  await page.getByRole("button", { name: "Local documents", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Add connection" });
  await dialog.getByLabel("Document folder").fill(path.join(workspace.directory, "missing-notes"));
  await dialog.getByLabel("Index the selected documents", { exact: false }).check();
  await dialog.getByRole("button", { name: "Add and check" }).click();
  await expect(dialog.getByRole("heading", { name: "Connection saved; one more step" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Check connection", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search my knowledge" })).toHaveCount(0);
  await expect(page.getByText("Some content is available", { exact: false })).toHaveCount(0);
});

test("legacy metered profiles lead to review instead of a blocked first conversation", async ({ page, workspace }) => {
  await page.route("**/api/connectors", async (route) => {
    const data = await (await route.fetch()).json();
    await route.fulfill({ json: { ...data, connectors: [{ id: "legacy", name: "Legacy runtime", kind: "hermes-api", status: "connected", capabilities: ["message.send"], lastSyncAt: new Date().toISOString(), latencyMs: 1, error: null }] } });
  });
  await page.route("**/api/assistants", async (route) => {
    const data = await (await route.fetch()).json();
    await route.fulfill({ json: { ...data, assistants: [...data.assistants, { ...data.assistants[0], id: "legacy-profile", connectorId: "legacy", name: "Legacy assistant", mode: "runtime", providerPolicy: "metered", runtimePolicyConfirmed: true, state: "ready" }] } });
  });
  await page.goto(`${workspace.url}/setup?flow=assistant&source=legacy`);
  await expect(page.getByRole("heading", { name: "Your assistant needs a check" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review my team" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open my first conversation" })).toHaveCount(0);
});
