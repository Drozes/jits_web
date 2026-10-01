import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4983",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4983",
    reuseExistingServer: true,
    // Canned invite previews for e2e/invite-landing.spec.ts (the preview is
    // fetched server-side with the service key, so the browser cannot mock
    // it). An already-running dev server must be started with this too.
    env: { E2E_INVITE_FIXTURES: "1" },
    timeout: 120000,
  },
});
