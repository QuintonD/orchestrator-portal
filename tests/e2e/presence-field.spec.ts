import { test, expect } from "./fixtures.js";

test("reference field respects motion controls in both themes and leaves the command entry intact", async ({ page }, testInfo) => {
  await page.goto("/");
  const field = page.locator(".system-focus .presence-field");
  await expect(field.locator("svg")).toBeVisible();
  await page.getByRole("combobox", { name: "Assistant motion", exact: true }).selectOption("still");
  await expect(field).toHaveAttribute("data-motion", "paused");
  await expect(field.locator("button, canvas, img")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask your assistant" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const time = await field.locator("svg").getAttribute("data-time");
    await page.waitForTimeout(100);
    expect(await field.locator("svg").getAttribute("data-time")).toBe(time);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/design/reference-presence/${testInfo.project.name}-${theme}.png` });
  }
});

test("only a pending source check moves the field and motion preferences adapt live", async ({ page }) => {
  await page.route("**/api/overview", async route => {
    const data = await (await route.fetch()).json();
    await route.fulfill({ json: { ...data, connectors: data.connectors.map((source: object) => ({ ...source, status: "degraded", lastSyncAt: null })) } });
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/connectors/*/sync", async route => {
    await pending;
    await route.fulfill({ status: 502, json: { error: "Source unavailable" } });
  });
  await page.goto("/");
  const field = page.locator(".system-focus .presence-field");
  await expect(field).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: "Refresh sources", exact: true }).click();
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveAttribute("data-motion", "paused");
  expect(await field.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(field).toHaveAttribute("data-motion", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(field).toHaveAttribute("data-motion", "running");
  release();
  await expect(field).toHaveAttribute("data-motion", "paused");
  await expect(page.getByRole("heading", { name: "A source needs a check." })).toBeVisible();
  expect(await field.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
});
