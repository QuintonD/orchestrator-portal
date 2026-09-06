import { expect, test } from "./fixtures.js";

test("assistant setup produces a reviewable report", async ({ page }, testInfo) => {
  await page.goto("/agents");
  await page.getByRole("button", { name: "Custom assistant", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Set up an assistant" });
  const name = `Project partner ${testInfo.project.name} ${Date.now()}`;
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("What should it help you achieve?").fill("Keep active projects moving and identify missing commitments.");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("I have restricted this runtime", { exact: false }).check();
  await dialog.getByRole("button", { name: "Save assistant" }).click();
  await expect(dialog).not.toBeVisible();
  const assistant = page.locator("article.agent-surface").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await assistant.getByRole("button", { name: "Request report" }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: new RegExp(name) }) }).first().click();
  const report = page.getByRole("dialog");
  await expect(report.getByText("claimed", { exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.getByText("Review saved. The original evidence is preserved.")).toBeVisible();
});

test("council retains distinct assessments and synthesis", async ({ page }) => {
  await page.goto("/councils");
  await page.getByRole("button", { name: "Convene a council" }).click();
  const dialog = page.getByRole("dialog", { name: "Convene a council" });
  await dialog.getByLabel("What decision needs another perspective?").fill("Should the project prioritize reliable source evidence or a larger connector catalog?");
  await dialog.getByLabel("Atlas", { exact: false }).check();
  await dialog.getByLabel("Sage", { exact: false }).check();
  await dialog.getByLabel("Share this question", { exact: false }).check();
  await dialog.getByRole("button", { name: "Request council" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Atlas", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Sage", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Lead synthesis")).toBeVisible();
});

test("watch settings survive reload and filter source activity", async ({ page }, testInfo) => {
  await page.goto("/activity");
  await page.getByRole("button", { name: "Add watch" }).click();
  const dialog = page.getByRole("dialog", { name: "Watch a topic or source" });
  await dialog.getByLabel("Topic or source").fill(`watch-${testInfo.project.name}-${Date.now()}`);
  await dialog.getByRole("button", { name: "Save watch" }).click();
  await page.reload();
  await expect(page.locator(".watch-chips")).toContainText(`watch-${testInfo.project.name}`);
  await page.getByLabel("Filter activity").fill("market scan");
  await expect(page.getByRole("heading", { name: "Market scan in progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conflict detected" })).not.toBeVisible();
});

test("knowledge document opens and Escape restores focus", async ({ page }) => {
  await page.goto("/brain");
  const opener = page.getByRole("button").filter({ has: page.getByRole("heading", { name: "Operating principles", exact: true }) });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Operating principles" });
  await expect(dialog).toContainText("Protect attention");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("portal command carries an editable draft without sending automatically", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Ask your assistant").fill("Review my project priorities");
  await page.getByRole("button", { name: "Continue in conversation" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue("Review my project priorities");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});
