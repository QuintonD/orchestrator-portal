import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./fixtures.js";

test("subscription proxy setup recovers and carries a claimed conversation", async ({ page }, testInfo) => {
  let healthChecks = 0;
  const turns: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
  const source = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.headers.authorization !== "Bearer synthetic-browser-key") {
      response.writeHead(401).end(JSON.stringify({ error: "Unauthorized" })); return;
    }
    if (request.url === "/v1/models" && request.method === "GET") {
      healthChecks++;
      if (healthChecks === 1) response.writeHead(503).end(JSON.stringify({ error: "Synthetic startup failure" }));
      else response.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
      return;
    }
    if (request.url === "/v1/chat/completions" && request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      turns.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.end(JSON.stringify({ choices: [{ finish_reason: turns.length === 1 ? "stop" : "length", message: { role: "assistant", content: turns.length === 1 ? "Synthetic model reply <script>untrusted()</script>" : "Synthetic partial reply" } }] }));
      return;
    }
    response.writeHead(404).end("{}");
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${(source.address() as AddressInfo).port}/v1`;
  const name = `Subscription fixture ${testInfo.project.name} ${Date.now()}`;
  try {
    await page.goto("/connections");
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
    await dialog.getByLabel("Source", { exact: true }).selectOption("openai-compatible");
    await dialog.getByLabel("Connection name").fill(name);
    await dialog.getByLabel("API base address").fill(endpoint);
    await dialog.getByLabel("Proxy access token").fill("synthetic-browser-key");
    await dialog.getByLabel("Model ID").fill("fixture-model");
    await expect(dialog.getByLabel("Proxy access token")).toHaveAttribute("type", "password");
    await dialog.getByRole("button", { name: "Add and check" }).click();
    await expect(dialog.getByRole("checkbox")).toBeFocused();
    expect(healthChecks).toBe(0);
    await dialog.getByRole("checkbox").check();
    await page.screenshot({ path: testInfo.outputPath("subscription-setup.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Add and check" }).click();
    await expect(dialog.getByRole("heading", { name: "Connection saved; one more step" })).toBeVisible();
    await expect(dialog).toContainText("HTTP 503");
    await dialog.getByRole("button", { name: "Retry check" }).click();
    await expect(dialog.getByRole("heading", { name: "Your source is ready" })).toBeVisible();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(1);
    expect(healthChecks).toBe(2);
    expect(turns).toHaveLength(0);

    await page.goto("/assistant");
    await page.locator(".connector-select select").selectOption({ label: name });
    const selectionBounds = await page.locator(".connector-select select").boundingBox();
    expect(selectionBounds!.x + selectionBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Synthetic first question");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    const answer = page.locator(".message--assistant").filter({ hasText: "Synthetic model reply" });
    await expect(answer).toContainText("claimed");
    await expect(answer.locator("script")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Synthetic follow up");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.locator(".message--assistant").filter({ hasText: "Synthetic partial reply" })).toContainText("unknown");
    expect(turns).toHaveLength(2);
    expect(turns[1]!.messages).toEqual([
      { role: "user", content: "Synthetic first question" },
      { role: "assistant", content: "Synthetic model reply <script>untrusted()</script>" },
      { role: "user", content: "Synthetic follow up" },
    ]);
    expect(turns[1]!.model).toBe("fixture-model");
    await page.screenshot({ path: testInfo.outputPath("subscription-conversation.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await page.locator(".connector-select select").selectOption({ label: name });
    await expect(page.locator(".message--assistant").filter({ hasText: "Synthetic partial reply" })).toContainText("unknown");

    await page.goto("/connections");
    await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
    await page.getByRole("dialog", { name: `Remove ${name}?` }).getByRole("button", { name: "Remove connection", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  } finally {
    source.closeAllConnections();
    await new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve()));
  }
});
