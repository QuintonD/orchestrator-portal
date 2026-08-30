import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4400",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "cross-env ORCHESTRATOR_DEMO=1 ORCHESTRATOR_DATA_DIR=./test-results/e2e-data npm start",
    url: "http://127.0.0.1:4400/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
