import { test, expect } from "./fixtures.js";

test("personal project produces a draft and records acceptance without claiming execution", async ({ page }, info) => {
  await page.goto("/personal?area=projects");
  const name = `Project ${info.project.name} ${Date.now()}`;
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill(name); await page.getByLabel("The outcome", { exact: true }).fill("Prepare a research protocol to compare project supervision time."); await page.getByLabel("Success criteria", { exact: true }).fill("Include measurable outcomes and a baseline comparison.");
  await page.getByLabel("Work type").selectOption("research"); await page.getByRole("button", { name: "Prepare my plan" }).click();
  await page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) }).click();
  const dialog = page.getByRole("dialog", { name, exact: true }); await expect(dialog.locator(".personal-stages > li")).toHaveCount(3);
  // A dedicated profile avoids sharing source turns with other concurrent journeys.
  const result = await page.request.post("/api/assistants", { data: { name: `Draft ${name}`, purpose: "Produce concrete project deliverables", connectorId: "demo", cadence: "manual", providerPolicy: "local", spendingLimit: 0, scope: [], criteria: "A useful draft with evidence and explicit limits", runtimePolicyConfirmed: true } });
  expect(result.ok()).toBeTruthy(); const assistant = await result.json(); await page.reload(); await page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) }).click();
  await dialog.getByRole("combobox", { name: "Assistant", exact: true }).selectOption(assistant.id); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Prepare deliverables" }).click();
  await expect(dialog.locator(".personal-draft").first()).toContainText("Working plan");
  await dialog.getByRole("button", { name: "Pause", exact: true }).click(); await dialog.getByLabel("Acceptance evidence").first().fill("Inspected the plan: the baseline and outcome measures are explicit."); await dialog.getByRole("button", { name: "Accept stage", exact: true }).first().click(); await expect(dialog.locator(".personal-stages > li").first()).toContainText("accepted");
  await page.reload(); await page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) }).click(); await expect(dialog).toContainText("Inspected the plan");
});

test("statement preview, duplicate protection and category correction are usable", async ({ page }, info) => {
  await page.goto("/personal?area=money"); await page.getByRole("button", { name: "Import statement", exact: true }).click();
  const source = `Statement ${info.project.name} ${Date.now()}`, description = `Groceries ${Date.now()}`, date = new Date().toISOString().slice(0, 10);
  const csv = `id,date,description,amount,type,category,currency\none,${date},${description},12.35,expense,Other,EUR`;
  await page.getByLabel("Source name").fill(source); await page.getByLabel("CSV contents").fill(csv); await page.getByRole("button", { name: "Preview import" }).click(); await expect(page.getByRole("dialog")).toContainText("1 new"); await page.getByRole("button", { name: "Save 1 records" }).click();
  await page.getByRole("button", { name: description, exact: true }).click(); await page.getByLabel("Category", { exact: true }).fill("Groceries"); await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.locator("tr").filter({ hasText: description })).toContainText("Groceries");
  await page.getByRole("button", { name: "Import statement", exact: true }).click(); await page.getByLabel("Source name").fill(source); await page.getByLabel("CSV contents").fill(csv); await page.getByRole("button", { name: "Preview import" }).click(); await expect(page.getByRole("dialog")).toContainText("1 unchanged"); await page.getByRole("button", { name: "Save 1 records" }).click(); await expect(page.getByRole("button", { name: description, exact: true })).toHaveCount(1);
});

test("goals, check-in undo, goal-linked agenda and calendar export work end to end", async ({ page }, info) => {
  const name = `Focused reading ${info.project.name} ${Date.now()}`;
  await page.goto("/personal?area=life"); await page.getByRole("button", { name: "New goal", exact: true }).click(); await page.getByLabel("Goal", { exact: true }).fill(name); await page.getByLabel("Why it matters").fill("Make space for learning"); await page.getByRole("button", { name: "Save goal" }).click();
  const card = page.locator(".money-category").filter({ has: page.getByRole("button", { name, exact: true }) }); await card.getByRole("button", { name: "Check in", exact: true }).click();
  await page.getByLabel("Progress (sessions)").fill("2"); await page.getByLabel("What helped or got in the way?").fill("A quiet morning helped."); await page.getByRole("button", { name: "Record progress" }).click(); await expect(page.getByRole("dialog")).toContainText("A quiet morning helped.");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByRole("dialog")).not.toContainText("A quiet morning helped."); await page.getByRole("button", { name: "Close dialog" }).click();
  await card.getByRole("button", { name: "Make time" }).click(); await expect(page.getByLabel("Supports a goal")).not.toHaveValue(""); await page.getByRole("button", { name: "Save commitment" }).click();
  await expect(page.locator(".personal-agenda-row").filter({ hasText: `Make time for ${name}` })).toBeVisible();
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("link", { name: "Export calendar" }).click(); expect((await downloadPromise).suggestedFilename()).toBe("orchestrator-agenda.ics");
  await page.getByRole("button", { name: `Complete Make time for ${name}`, exact: true }).click(); await expect(page.getByRole("button", { name: `Complete Make time for ${name}`, exact: true })).toHaveCount(0);
});

test("personal surfaces remain readable in both themes and at narrow widths", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const theme of ["light", "dark"]) {
    await page.goto("/personal"); await page.evaluate((theme) => localStorage.setItem("orchestrator-theme", theme), theme);
    for (const area of ["today", "projects", "money", "life"]) {
      await page.goto(`/personal?area=${area}`); await expect(page.locator(".personal-workspace h1")).toBeVisible();
      await expect(page.locator(".personal-card").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("money plan saves limits and can inspect a previous month", async ({ page }, info) => {
  await page.goto("/personal?area=money"); await page.getByRole("button", { name: "My money plan", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  const categories = page.getByRole("textbox", { name: /^Category \d+/ }); await categories.last().fill(`Learning ${info.project.name}`);
  await page.getByRole("spinbutton", { name: /Monthly amount/ }).last().fill("100");
  await page.getByRole("button", { name: "Save money plan", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Statement month").fill("2026-01"); await expect(page.getByLabel("Statement month")).toHaveValue("2026-01");
});
