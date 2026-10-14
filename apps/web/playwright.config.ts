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
    // it). The web app lock and App Store URL are passed through so the server
    // and the specs agree (specs/web-landing/spec.md). reuseExistingServer
    // reuses a running dev server with whatever env it was started with:
    // stop any running dev server before switching flag states.
    env: {
      E2E_INVITE_FIXTURES: "1",
      NEXT_PUBLIC_WEB_APP_ENABLED: process.env.NEXT_PUBLIC_WEB_APP_ENABLED ?? "",
      NEXT_PUBLIC_APP_STORE_URL: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "",
    },
    timeout: 120000,
  },
});
