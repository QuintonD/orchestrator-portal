import { expect, test } from "@playwright/test";

test("overview preserves signal hierarchy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText("Assistant brief")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project health" })).toBeVisible();
  await expect(page.getByText("Launch copy needs your decision")).toBeVisible();
});

test("operator can message the assistant", async ({ page }) => {
  await page.goto("/assistant");
  const response = await page.request.post("/api/messages", { data: { connectorId: "demo", body: "What is my priority?" } });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.reply.body).toMatch(/launch positioning is the only decision/i);
  expect(result.reply.state).toBe("verified");
});

test("desktop visual surface has no overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop visual check");
  await page.goto("/");
  await expect(page.getByText("Assistant brief")).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({ path: "docs/assets/overview-light.png", fullPage: true });
});

test("secondary surfaces and dark appearance render", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop visual check");
  await page.addInitScript(() => localStorage.setItem("orchestrator-theme", "dark"));
  await page.goto("/assistant");
  await expect(page.getByText("Direct channel")).toBeVisible();
  await expect(page.getByText(/I cleared 14 routine items overnight/)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "docs/assets/assistant-dark.png" });
  await page.goto("/connections");
  await expect(page.getByText("Adapter layer")).toBeVisible();
  await page.screenshot({ path: "test-results/visual-connections-dark.png", fullPage: true });
});

test("dashboard customization is persisted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByRole("dialog", { name: "Customize dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Save dashboard" }).click();
  await expect(page.getByText("Dashboard updated")).toBeVisible();
});

test("mobile navigation keeps the core views reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only assertion");
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation).toBeVisible();
  await page.screenshot({ path: "test-results/visual-overview-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("complementary", { name: "All navigation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "All navigation" }).getByText("Settings")).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await navigation.getByText("Assistant").click();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
});
