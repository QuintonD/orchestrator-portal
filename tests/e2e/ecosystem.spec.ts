import { test, expect } from "./fixtures.js";
import type { EcosystemSnapshot } from "../../packages/contracts/src/index.js";

const initial = (): EcosystemSnapshot => ({ version: 1, assistants: Array.from({ length: 5 }, (_, i) => ({ id: `fixture-${i}`, connectorId: "demo", state: "ready" })), connectors: [{ id: "demo", status: "connected", lastSyncAt: new Date().toISOString() }], attentionCount: 0, dispatchPaused: false, reportCount: 0, latestReport: null });

test("ecosystem follows navigation, grows actual identities, and preserves controls", async ({ page }, info) => {
  let snapshot = initial();
  await page.route("**/api/presence", route => route.fulfill({ json: snapshot }));
  await page.goto("/");
  const hero = page.locator(".ecosystem-hero .presence-field");
  await expect(hero).toHaveAttribute("data-state", "resting");
  await expect(page.locator(".ecosystem-dock__button")).toBeHidden();
  await page.getByRole("button", { name: "Open ecosystem", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Your ecosystem" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "At ease" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sound off", exact: true })).toHaveAttribute("aria-pressed", "false");
  await panel.getByRole("combobox", { name: "Assistant motion" }).selectOption("still");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open ecosystem", exact: true })).toBeFocused();
  await page.getByRole("navigation", { name: info.project.name === "mobile" ? "Mobile navigation" : "Primary navigation", exact: true }).getByRole("button", { name: "Team", exact: true }).click();
  const dock = page.locator(".ecosystem-dock__button");
  await expect(dock).toBeVisible();
  await expect(dock.locator(".presence-field")).toHaveAttribute("data-motion", "paused");
  await dock.click();
  await panel.getByRole("combobox", { name: "Assistant motion" }).selectOption("full");
  const field = panel.locator(".presence-field");
  await expect(field).toHaveAttribute("data-motion", "running");
  snapshot = { ...snapshot, assistants: [...snapshot.assistants, { id: "new-assistant", connectorId: "demo", state: "running" }] };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("orchestrator:request", { detail: { id: "fixture", active: false } })));
  await expect(field.locator('[data-node="member-new-assistant"]')).toBeVisible();
  await expect(field).toHaveAttribute("data-state", "growing");
  await expect(panel.getByRole("heading", { name: "1 assistant working" })).toBeVisible();
  await expect(field.locator('[data-activity="running"]')).toHaveCount(1);
  await expect(field.locator("[data-node]")).toHaveCount(7);
  await page.screenshot({ path: `test-results/ecosystem/${info.project.name}-panel.png` });
  await page.keyboard.press("Escape");
  await expect(dock).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("unavailable snapshot retains the last team and exposes retry without claiming motion", async ({ page }) => {
  let failed = false;
  await page.route("**/api/presence", route => route.fulfill(failed ? { status: 503, json: { error: "Unavailable" } } : { json: initial() }));
  await page.goto("/agents");
  const dock = page.locator(".ecosystem-dock__button");
  await expect(dock).toHaveAccessibleName("Open ecosystem: At ease");
  failed = true;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("orchestrator:request", { detail: { id: "fixture", active: false } })));
  await expect(dock).toHaveAccessibleName("Open ecosystem: Snapshot unavailable");
  await expect(dock.locator(".presence-field")).toHaveAttribute("data-motion", "paused");
  await expect(dock.locator("[data-node]")).toHaveCount(6);
  await dock.click();
  const panel = page.getByRole("dialog", { name: "Your ecosystem" });
  await expect(panel.getByText("Showing the last known team.", { exact: false })).toBeVisible();
  failed = false;
  await panel.getByRole("button", { name: "Retry snapshot" }).click();
  await expect(panel.getByRole("heading", { name: "At ease" })).toBeVisible();
});
