import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "./fixtures.js";

test("reasoning is easy to set, persists, and changes only the chosen assistant's requests", async ({ page }, testInfo) => {
  const turns: Array<{ reasoning_effort?: string; max_tokens?: number; max_completion_tokens?: number; model: string }> = [];
  const source = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/models") { response.end(JSON.stringify({ data: [{ id: "reasoning-fixture" }] })); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    turns.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Synthetic answer with the requested effort." } }] }));
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  let connectorId = ""; const ids: string[] = [];
  try {
    const created = await page.request.post("/api/connectors", { data: { name: `Reasoning ${testInfo.project.name} ${Date.now()}`, kind: "openai-compatible", config: { endpoint: `http://127.0.0.1:${(source.address() as AddressInfo).port}/v1`, model: "reasoning-fixture", accessMode: "local", policyConfirmed: true } } });
    expect(created.status()).toBe(201); connectorId = (await created.json()).id;
    expect((await page.request.post(`/api/connectors/${connectorId}/sync`)).status()).toBe(200);
    await page.goto(`/agents?source=${connectorId}`);
    const catalog = page.getByRole("dialog", { name: "A team, already prepared" });
    await catalog.getByRole("button", { name: "Clear selection" }).click();
    await catalog.getByLabel("Find a role").fill("Code review");
    await catalog.getByLabel("Reviewer Code review", { exact: true }).check();
    await expect(catalog.getByLabel("Reasoning level", { exact: true })).toHaveValue("default");
    await catalog.getByLabel("Reasoning level", { exact: true }).selectOption("medium");
    await catalog.getByLabel("The runtime is already restricted", { exact: false }).check();
    await catalog.getByRole("button", { name: "Add prepared team", exact: true }).click();
    await expect(catalog).not.toBeVisible();
    const profile = (await (await page.request.get("/api/assistants")).json()).assistants.find((p: { connectorId: string }) => p.connectorId === connectorId);
    ids.push(profile.id); expect(profile.reasoningEffort).toBe("medium"); expect(turns).toHaveLength(0);
    const second = await page.request.post("/api/assistants", { data: { name: `Second ${testInfo.project.name} ${Date.now()}`, connectorId, purpose: "Another synthetic assistant", criteria: "A bounded synthetic result", cadence: "manual", providerPolicy: "local", runtimePolicyConfirmed: true } });
    expect(second.status()).toBe(201); ids.push((await second.json()).id);
    await page.goto(`/assistant?assistant=${profile.id}`);
    const effort = page.getByLabel("Reasoning level", { exact: true });
    await expect(effort).toHaveValue("medium");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Keep this draft while I change effort.");
    // Keyboard access and a failed save must preserve both the persisted preference and draft.
    await effort.focus(); await expect(effort).toBeFocused();
    await page.route(`**/api/assistants/${profile.id}/reasoning`, async (route) => {
      if (route.request().method() === "PUT") await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Synthetic busy source; preference not saved." }) });
      else await route.continue();
    });
    await effort.selectOption("high");
    await expect(page.getByRole("alert")).toContainText("preference not saved");
    await expect(effort).toHaveValue("medium");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Keep this draft while I change effort.");
    await page.unroute(`**/api/assistants/${profile.id}/reasoning`);
    await effort.selectOption("high");
    await expect(page.getByRole("status").filter({ hasText: "Reasoning preference saved." })).toBeVisible();
    expect(turns).toHaveLength(0);
    // The server can commit a preference even when its response never reaches the client.
    await page.route(`**/api/assistants/${profile.id}/reasoning`, async (route) => {
      if (route.request().method() === "PUT") { await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await effort.selectOption("medium");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(effort).toHaveValue("medium");
    await expect(effort).toBeEnabled();
    expect(turns).toHaveLength(0);
    await page.unroute(`**/api/assistants/${profile.id}/reasoning`);
    await effort.selectOption("high");
    await expect(page.getByRole("status").filter({ hasText: "Reasoning preference saved." })).toBeVisible();
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.locator(".message--assistant").last()).toContainText("Synthetic answer");
    expect(turns).toEqual([{ model: "reasoning-fixture", stream: false, reasoning_effort: "high", max_completion_tokens: 4096, messages: expect.any(Array) }]);
    await page.reload(); await expect(effort).toHaveValue("high");
    await page.screenshot({ path: testInfo.outputPath("assistant-reasoning.png"), fullPage: true });
    expect(await page.locator(".conversation-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 740, height: 360 });
    const send = page.getByRole("button", { name: "Send message", exact: true });
    await send.evaluate((element) => element.scrollIntoView({ block: "center" }));
    expect(await send.evaluate((element) => {
      const button = element.getBoundingClientRect(), card = element.closest(".conversation-card")!.getBoundingClientRect();
      const target = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
      return button.bottom <= card.bottom && (target === element || element.contains(target));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("reasoning-landscape.png"), fullPage: true });
    await page.setViewportSize(viewport);
    await effort.selectOption("default");
    await expect(page.getByRole("status").filter({ hasText: "Reasoning preference saved." })).toBeVisible();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Now use the source setting.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.locator(".message--assistant")).toHaveCount(2);
    expect(turns[1]!.reasoning_effort).toBeUndefined(); expect(turns[1]!.max_tokens).toBe(4096);
    expect((await (await page.request.get(`/api/assistants/${ids[1]}/reasoning`)).json()).effort).toBe("default");
  } finally {
    for (const id of ids) await page.request.delete(`/api/assistants/${id}`);
    if (connectorId) await page.request.delete(`/api/connectors/${connectorId}`);
    await new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve()));
  }
});

test("demo explains source control without offering a simulated reasoning setting", async ({ page }) => {
  await page.goto("/assistant?assistant=atlas");
  await expect(page.locator(".assistant-reasoning")).toContainText("Demo responses are simulated");
  await expect(page.getByLabel("Reasoning level", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
});

test("a failed preference read blocks sending but leaves assistant switching and recovery available", async ({ page }) => {
  await page.route("**/api/assistants/atlas/reasoning", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic preference read failure" }) }));
  await page.goto("/assistant?assistant=atlas");
  await expect(page.getByRole("alert")).toContainText("preference read failure");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Retain my draft until settings load.");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Conversation assistant")).toBeEnabled();
  await page.unroute("**/api/assistants/atlas/reasoning");
  await page.getByRole("button", { name: "Retry reasoning settings" }).click();
  await expect(page.locator(".assistant-reasoning")).toContainText("Demo responses are simulated");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Retain my draft until settings load.");
});
