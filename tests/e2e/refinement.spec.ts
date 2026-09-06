import { test, expect } from "./fixtures.js";

test("next decision is visible without scrolling and command retains its target", async ({ page }) => {
  await page.goto("/");
  const decision = page.getByRole("region", { name: "Next decision" });
  await expect(decision).toBeInViewport();
  await expect(page.getByText("Assistant brief", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Ask your assistant" }).fill("Prepare a source-linked status brief");
  await page.getByRole("button", { name: "Continue in conversation" }).click();
  await expect(page).toHaveURL(/connector=demo&draft=/);
  await expect(page.locator(".composer textarea")).toHaveValue("Prepare a source-linked status brief");
});

test("discovery prepares a detected source without adding it silently", async ({ page }) => {
  await page.route("**/api/setup/discovery", (route) => route.fulfill({ json: { tools: [{ kind: "openclaw-cli", name: "OpenClaw", available: true }] } }));
  await page.goto("/connections");
  await page.getByRole("button", { name: "OpenClaw · connect" }).click();
  await expect(page.getByLabel("Source", { exact: true })).toHaveValue("openclaw-cli");
  await expect(page.getByRole("button", { name: "Add and check" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("assistant setup begins with a useful editable brief", async ({ page }) => {
  await page.goto("/agents?setup=1");
  await expect(page.getByRole("heading", { name: "Project oversight" })).toBeVisible();
  await expect(page.getByLabel("Existing runtime")).toHaveValue("demo");
  await expect(page.locator('input[type="checkbox"]')).not.toBeChecked();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Project oversight");
  await expect(page.getByLabel("What should it help you achieve?")).not.toHaveValue("");
  await page.getByLabel("Name", { exact: true }).fill(`First brief ${Date.now()}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Start my brief" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("button").filter({ has: page.getByRole("heading", { name: /First brief/ }) }).first()).toContainText("claimed");
});

test("empty workspace offers setup without empty metrics", async ({ page }) => {
  await page.route("**/api/overview", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, connectors: [], attention: [], feed: [], projects: [], recurring: [], latestMetric: null } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Find my sources" })).toBeVisible();
  await expect(page.locator(".pulse-strip, .dashboard-grid .card, .portal-command")).toHaveCount(0);
  await page.getByRole("button", { name: "Find my sources" }).click();
  await expect(page.getByRole("region", { name: "Local discovery" })).toBeVisible();
});

test("dark and reduced motion retain readable states at narrow width", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("orchestrator-theme", "dark"));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/agents");
  await expect(page.locator(".assistant-sigil").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".assistant-sprite").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: "test-results/refinement-agents-narrow-dark.png", fullPage: true });
});

test("stale sources offer a refresh and keep failures visible", async ({ page }) => {
  await page.route("**/api/overview", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, connectors: data.connectors.map((source: object) => ({ ...source, status: "degraded", lastSyncAt: null })) } });
  });
  await page.route("**/api/connectors/*/sync", (route) => route.fulfill({ status: 502, json: { error: "Source unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Refresh sources" }).click();
  await expect(page.getByRole("status")).toContainText("connections need a check");
  await expect(page.getByRole("heading", { name: "A source needs a check." })).toBeVisible();
});

test("discovery failure can be retried", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/setup/discovery", (route) => ++calls === 1
    ? route.fulfill({ status: 500, json: { error: "Unavailable" } })
    : route.fulfill({ json: { tools: [] } }));
  await page.goto("/connections");
  await expect(page.getByRole("heading", { name: "Discovery unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Scan again" }).click();
  await expect(page.getByText("No supported local tools found. Start with a folder of notes.")).toBeVisible();
});

test("secondary destinations remain reachable from the compact navigation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: testInfo.project.name === "desktop" ? "More destinations" : "Open navigation", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  await drawer.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true, level: 1 })).toBeVisible();
  await expect(drawer).not.toBeVisible();
});

test("mobile report titles retain space beside delivery metadata", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/reports");
  const title = page.locator(".report-row h2").first();
  await expect(title).toBeVisible();
  expect((await title.boundingBox())!.width).toBeGreaterThan(200);
  await expect(page.getByRole("region", { name: "Report delivery states" })).toBeVisible();
});
