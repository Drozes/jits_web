import { test, expect } from "@playwright/test";

// The locked web app (specs/web-landing/spec.md): "/" is the landing page and
// everything outside the allow-list redirects to "/". The dev server gets the
// same env through playwright.config.ts; stop it before switching states.
const WEB_APP_ENABLED = process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true";
const STORE_LIVE = !!process.env.NEXT_PUBLIC_APP_STORE_URL;
const ZERO_ID = "00000000-0000-4000-8000-000000000000";

test.skip(WEB_APP_ENABLED, "web app enabled: the lock is off");

test.describe("Landing page at /", () => {
  test("renders the landing at / with no web sign-in links", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page).toHaveTitle("ELO RATED: Ranked Jiu-Jitsu");
    await expect(page.getByRole("heading", { level: 1, name: "We are ELO RATED. Are you?" })).toBeVisible();
    await expect(page.getByText("What's your number?")).toBeVisible();
    if (!STORE_LIVE) await expect(page.getByTestId("app-store-coming-soon")).toBeVisible();
    await expect(page.locator('a[href^="/login"], a[href^="/signup"]')).toHaveCount(0);
    const footer = page.getByRole("navigation", { name: "Legal and support" });
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
    await expect(page.getByRole("link", { name: "Conditions" })).toHaveAttribute("href", "/terms/fr");
    await expect(page.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/privacy/fr");
  });

  test.describe("at phone width", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("fits with no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("landing")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: "test-results/landing-390.png", fullPage: true });
    });
  });

  test("loads the hero image", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop project only");
    await page.goto("/");
    const img = page.getByTestId("landing").locator("img").first();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe("Locked routes", () => {
  for (const path of [
    "/login",
    "/signup",
    "/eua",
    "/arena",
    "/profile",
    "/settings",
    `/athlete/${ZERO_ID}`,
    `/matches/${ZERO_ID}`,
    "/design",
    "/api/version",
    "/welcome",
    "/unknown-page",
  ]) {
    test(`${path} redirects to /`, async ({ request, baseURL }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(new URL(res.headers()["location"], baseURL).pathname).toBe("/");
    });
  }

  for (const path of ["/terms", "/terms/fr", "/privacy", "/privacy/fr", "/support", "/forgot-password", "/update-password", "/error"]) {
    test(`${path} renders without a redirect`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }

  test("robots.txt, the manifest and the service worker are served", async ({ request }) => {
    const robots = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(robots.status()).toBe(200);
    // Next writes the field as "User-Agent"; field names are case-insensitive.
    expect(await robots.text()).toMatch(/^User-agent: \*$/im);
    for (const path of ["/manifest.webmanifest", "/sw.js"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200);
    }
  });
});

test.describe("Auth plumbing while locked", () => {
  test("/forgot-password has no link to /login", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByText("Reset Your Password", { exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/login"]')).toHaveCount(0);
  });

  test("/error links Back to ELO RATED at /", async ({ page }) => {
    await page.goto("/error");
    await expect(page.getByRole("link", { name: "Back to ELO RATED" })).toHaveAttribute("href", "/");
  });

  test("/support shows the contact email and how to delete an account", async ({ page }) => {
    await page.goto("/support");
    await expect(page.locator('a[href="mailto:info@elorated.com"]').first()).toBeVisible();
    await expect(page.getByText("Settings > Delete account", { exact: false })).toBeVisible();
  });

  for (const path of ["/confirm", "/auth/callback"]) {
    test(`${path} with no params ends on /error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/error/);
      expect(new URL(page.url()).pathname).toBe("/error");
    });
  }
});
