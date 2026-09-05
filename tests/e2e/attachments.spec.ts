import { expect, test } from "./fixtures.js";

test("text attachment is previewed and sent only with an explicit message", async ({ page }) => {
  await page.goto("/assistant");
  const input = page.getByLabel("Attach text file");
  await input.setInputFiles({ name: "test-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic release notes") });
  await expect(page.locator(".attachment-preview")).toContainText("test-notes.txt");
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await page.getByLabel("Message", { exact: true }).fill("Review this attachment");
  const sent = page.waitForRequest(request => request.url().endsWith("/api/messages") && request.method() === "POST");
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await sent).postDataJSON().body).toContain("Synthetic release notes");
  await expect(page.locator(".attachment-preview")).not.toBeVisible();
});

test("unsupported and oversized attachments do not replace a valid selection", async ({ page }) => {
  await page.goto("/assistant");
  const input = page.getByLabel("Attach text file");
  await input.setInputFiles({ name: "keep.md", mimeType: "text/markdown", buffer: Buffer.from("Keep this draft") });
  await expect(page.locator(".attachment-preview")).toContainText("keep.md");
  for (const file of [
    { name: "blocked.exe", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") },
    { name: "too-large.txt", mimeType: "text/plain", buffer: Buffer.alloc(13 * 1024, "a") },
  ]) {
    await input.setInputFiles(file);
    await expect(page.getByRole("status")).toContainText("up to 12 KB");
    await expect(page.locator(".attachment-preview")).toContainText("keep.md");
  }
  await page.getByRole("button", { name: "Remove attachment" }).click();
  await expect(page.locator(".attachment-preview")).not.toBeVisible();
});
