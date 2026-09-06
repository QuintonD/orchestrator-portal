import { expect, test } from "./fixtures.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

test("Obsidian setup checks, searches and refreshes a selected vault", async ({ page }, testInfo) => {
  const base = path.resolve("test-results", "knowledge-fixtures");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, "vault-"));
  const title = `Vault evidence ${testInfo.project.name} ${Date.now()}`;
  await mkdir(path.join(directory, "Projects"));
  await writeFile(path.join(directory, "Projects", "launch #1.md"), `# ${title}\n\nSynthetic launch evidence from a selected vault.`);
  try {
    await page.goto("/connections");
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
    await dialog.getByLabel("Source", { exact: true }).selectOption("obsidian-vault");
    await dialog.getByLabel("Connection name").fill(title);
    await dialog.getByLabel("Vault folder").fill(`"${directory}"`);
    await dialog.getByLabel("Index the selected documents").check();
    await dialog.getByRole("button", { name: "Add and check" }).click();
    await expect(dialog.getByRole("heading", { name: "Your source is ready" })).toBeVisible();
    await expect(dialog).toContainText("1 documents indexed");
    await dialog.getByRole("button", { name: "Prepare this team", exact: true }).click();
    const team = page.getByRole("dialog", { name: "A team, already prepared" });
    await expect(team.getByLabel("Team connection")).not.toHaveValue("workspace");
    await team.getByRole("button", { name: "Add team & prepare reports" }).click();
    await expect(team).not.toBeVisible();
    await page.goto("/brain");
    const document = page.getByRole("button").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await document.click();
    await expect(page.getByRole("dialog", { name: title })).toContainText("Synthetic launch evidence");
    await page.keyboard.press("Escape");
    await page.goto("/connections");
    await page.getByRole("button", { name: `Remove ${title}`, exact: true }).click();
    await page.getByRole("dialog", { name: `Remove ${title}?` }).getByRole("button", { name: "Remove connection", exact: true }).click();
    await page.goto("/brain");
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  } finally {
    if (!directory.startsWith(`${base}${path.sep}`)) throw new Error("Fixture cleanup escaped its test directory");
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed folder check is saved once and can recover", async ({ page }, testInfo) => {
  const base = path.resolve("test-results", "knowledge-fixtures");
  await mkdir(base, { recursive: true });
  const parent = await mkdtemp(path.join(base, "recovery-"));
  const directory = path.join(parent, "notes");
  const name = `Recovery ${testInfo.project.name} ${Date.now()}`;
  try {
    await page.goto("/connections");
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
    await dialog.getByLabel("Connection name").fill(name);
    await dialog.getByLabel("Document folder").fill(directory);
    await dialog.getByLabel("Index the selected documents").check();
    await dialog.getByRole("button", { name: "Add and check" }).click();
    await expect(dialog.getByRole("heading", { name: "Connection saved; one more step" })).toBeVisible();
    await mkdir(directory);
    await writeFile(path.join(directory, "ready.txt"), "The folder is now available.");
    await dialog.getByRole("button", { name: "Retry check" }).click();
    await expect(dialog.getByRole("heading", { name: "Your source is ready" })).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
    await page.getByRole("dialog", { name: `Remove ${name}?` }).getByRole("button", { name: "Remove connection", exact: true }).click();
  } finally {
    if (!parent.startsWith(`${base}${path.sep}`)) throw new Error("Fixture cleanup escaped its test directory");
    await rm(parent, { recursive: true, force: true });
  }
});

test("Notion explains page scope and requires a secret and index consent", async ({ page }, testInfo) => {
  await page.goto("/connections");
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add connection", exact: true });
  await dialog.getByLabel("Source", { exact: true }).selectOption("notion");
  await expect(dialog).toContainText("Only these pages are indexed");
  await expect(dialog.getByLabel("Notion connection secret")).toHaveAttribute("type", "password");
  await dialog.getByLabel("Page links or IDs").fill("https://notion.so/11111111111111111111111111111111");
  await dialog.getByRole("button", { name: "Add and check" }).click();
  await expect(dialog.getByLabel("Notion connection secret")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("notion-setup.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Add connection", exact: true })).toBeFocused();
});

test("Grok handoff previews a local file and imports a claimed report once", async ({ page }, testInfo) => {
  await page.goto("/connections");
  const panel = page.getByRole("region", { name: "Work with Grok Bot" });
  const title = `Grok review ${testInfo.project.name} ${Date.now()}`;
  await panel.getByRole("button", { name: "Prepare a new task" }).click();
  await panel.getByLabel("Task title", { exact: true }).fill(title);
  await panel.getByRole("button", { name: "Save handoff" }).click();
  await expect(panel.getByRole("button", { name: "Copy task", exact: true })).toBeVisible();
  await panel.getByText("View saved task text", { exact: true }).click();
  await expect(panel.getByLabel("Saved Grok Bot task text")).toContainText(title);
  await panel.getByLabel("Result file", { exact: false }).setInputFiles({ name: "grok-result.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic Grok Bot findings. <script>alert('untrusted')</script> remains plain text.") });
  await panel.getByRole("button", { name: "Preview import" }).click();
  await expect(panel.getByRole("heading", { name: "Review before importing" })).toBeVisible();
  await expect(panel.locator(".grok-result")).toContainText("<script>");
  await expect(panel.locator(".grok-result script")).toHaveCount(0);
  await panel.getByRole("button", { name: "Confirm import as claimed" }).click();
  await expect(panel.getByRole("heading", { name: "Result saved in Reports" })).toBeVisible();
  await panel.getByRole("link", { name: "Open Reports" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).click();
  const report = page.getByRole("dialog", { name: title, exact: true });
  await expect(report).toContainText("claimed");
  await expect(report.getByRole("button", { name: "Copy correction for Grok Bot" })).toBeVisible();
  await expect(report.getByRole("button", { name: "Send correction", exact: true })).toHaveCount(0);
  await report.getByRole("button", { name: "Useful", exact: true }).click();
  await expect(page.getByText("Review saved. The original evidence is preserved.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("grok-report.png"), fullPage: true });
});
