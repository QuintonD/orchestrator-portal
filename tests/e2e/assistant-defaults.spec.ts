import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "./fixtures.js";

test("a technical role works on a model connection without changing its configured model", async ({ page }, testInfo) => {
  const turns: Array<{ model: string; messages: Array<{ content: string }>; reasoning_effort?: string }> = [];
  const source = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/models") { response.end(JSON.stringify({ data: [{ id: "chosen-fixture-model" }] })); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    turns.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Please share the diff and its expected behavior before I review it." } }] }));
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  let connectorId = "", profileId = "";
  try {
    const connection = await page.request.post("/api/connectors", { data: { name: `Role fixture ${testInfo.project.name} ${Date.now()}`, kind: "openai-compatible", config: { endpoint: `http://127.0.0.1:${(source.address() as AddressInfo).port}/v1`, model: "chosen-fixture-model", accessMode: "local", policyConfirmed: true } } });
    expect(connection.status()).toBe(201); connectorId = (await connection.json()).id;
    expect((await page.request.post(`/api/connectors/${connectorId}/sync`)).status()).toBe(200);
    await page.goto(`/agents?source=${connectorId}`);
    const dialog = page.getByRole("dialog", { name: "A team, already prepared" });
    await expect(dialog.locator('.template-card input:checked')).toHaveCount(1);
    await expect(dialog.getByLabel("Prepare the first brief", { exact: false })).not.toBeChecked();
    await dialog.getByRole("button", { name: "Clear selection" }).click();
    await dialog.getByLabel("Role category").selectOption("Technical");
    await dialog.getByLabel("Find a role").fill("Code review");
    await expect(dialog.locator(".template-card")).toHaveCount(1);
    await dialog.getByText("Inputs, mandate and model", { exact: true }).click();
    await expect(dialog).toContainText("Diff and nearby implementation");
    await expect(dialog).toContainText("GPT-6 Astra at high effort");
    await dialog.getByLabel("Reviewer Code review", { exact: true }).check();
    await expect(dialog.getByRole("button", { name: "Add prepared team" })).toBeDisabled();
    await dialog.getByLabel("The runtime is already restricted", { exact: false }).check();
    await page.screenshot({ path: testInfo.outputPath("technical-role.png"), fullPage: true });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Add prepared team" }).click();
    await expect(dialog).not.toBeVisible();
    expect(turns).toHaveLength(0);
    const profiles = (await (await page.request.get("/api/assistants")).json()).assistants;
    const profile = profiles.find((p: { connectorId: string }) => p.connectorId === connectorId);
    profileId = profile.id;
    expect(profile).toMatchObject({ templateId: "code-reviewer", mode: "runtime", modelClass: "deep", templateVersion: 2 });
    await page.goto(`/assistant?assistant=${profileId}`);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Review my next change; no diff is attached yet.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.locator(".message--assistant").last()).toContainText("Please share the diff");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.model).toBe("chosen-fixture-model");
    expect(turns[0]!.reasoning_effort).toBeUndefined();
    expect(turns[0]!.messages.at(-1)!.content).toContain("Required inputs: Diff and nearby implementation");
    expect(turns[0]!.messages.at(-1)!.content).toContain("Do not expand permissions, switch models/providers");
  } finally {
    if (profileId) await page.request.delete(`/api/assistants/${profileId}`);
    if (connectorId) await page.request.delete(`/api/connectors/${connectorId}`);
    await new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve()));
  }
});

test("knowledge exposes portable handoffs and accessible benchmark guidance", async ({ page }, testInfo) => {
  const created = await page.request.post("/api/connectors", { data: { name: `Handoff notes ${testInfo.project.name} ${Date.now()}`, kind: "markdown-directory", config: { path: process.cwd() } } });
  const connectorId = (await created.json()).id;
  let profileId = "";
  try {
    // No sync: no workspace files are indexed or included in this prepared task.
    await page.goto(`/agents?source=${connectorId}`);
    const dialog = page.getByRole("dialog", { name: "A team, already prepared" });
    await dialog.getByRole("button", { name: "Clear selection" }).click();
    await dialog.getByText("Choose the right model", { exact: true }).click();
    await dialog.getByText("Benchmark evidence", { exact: false }).click();
    await expect(dialog.getByRole("table")).toContainText("26 (estimate)");
    await expect(dialog).toContainText("Intelligence Index v4.3");
    await page.screenshot({ path: testInfo.outputPath("model-classes.png"), fullPage: true });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByText("Choose the right model", { exact: true }).click();
    await dialog.getByLabel("Find a role").fill("Research");
    await dialog.getByLabel("Quest Research analysis", { exact: true }).check();
    await expect(dialog).toContainText("Prepared task · no dispatch");
    await expect(dialog.getByLabel("The runtime is already restricted", { exact: false })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Add team & prepare reports" }).click();
    await expect(dialog).not.toBeVisible();
    const profile = (await (await page.request.get("/api/assistants")).json()).assistants.find((p: { connectorId: string }) => p.connectorId === connectorId);
    profileId = profile.id;
    const report = (await (await page.request.get("/api/reports")).json()).find((r: { assistantId: string }) => r.assistantId === profile.id);
    expect(report.state).toBe("accepted");
    await page.goto(`/reports?report=${report.id}`);
    await expect(page.getByRole("button", { name: "Copy task" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Required inputs: Research question");
  } finally {
    if (profileId) await page.request.delete(`/api/assistants/${profileId}`);
    await page.request.delete(`/api/connectors/${connectorId}`);
  }
});

test("Grok Bot can use the shared library as an editable manual task", async ({ page }) => {
  await page.goto("/connections");
  await page.getByRole("button", { name: "Prepare a new task" }).click();
  await page.getByLabel("Start from a role").selectOption("writer-editor");
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Writing and editing");
  await expect(page.getByRole("textbox", { name: "What should the Bot do?", exact: true })).toHaveValue(/Recommended class: Balanced/);
  await expect(page.getByRole("textbox", { name: "What makes a useful result?", exact: true })).toHaveValue(/finished draft/);
  await page.getByRole("textbox", { name: "What should the Bot do?", exact: true }).fill("Write a synthetic welcome note using only these supplied facts.");
  await expect(page.getByRole("textbox", { name: "What should the Bot do?", exact: true })).toHaveValue("Write a synthetic welcome note using only these supplied facts.");
  await page.getByRole("button", { name: "Close task editor" }).click();
});
