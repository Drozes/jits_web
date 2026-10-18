import { test, expect } from "@playwright/test";
import { APP_STORE_LIVE, expectStoreBadges } from "./store-badges";

// The locked web app (specs/web-landing/spec.md): "/" is the landing page and
// everything outside the allow-list redirects to "/". The dev server gets the
// same env through playwright.config.ts; stop it before switching states.
const WEB_APP_ENABLED = process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true";
const ZERO_ID = "00000000-0000-4000-8000-000000000000";

// The teaser v2 hero (specs/web-landing/addendum-teaser-v2.md).
const VIDEOS = ["/landing/videos/sparring-01-v1-720.mp4", "/landing/videos/sparring-01-v1-1080.mp4"];
const POSTER = "/landing/videos/sparring-01-v1-poster.jpg";
/** Ticker line format (addendum 7.2 with the owner's Q4 resolution: no belts). */
const TICK =
  /^(122\.5|136|149|162|175\.5|188\.5|202|215) LBS · (WIN ▲([3-9]|1\d|20)|LOSS ▼([3-9]|1[0-8])|DRAW [▲▼][1-3])$/;
const HERO_LINE = APP_STORE_LIVE ? "Get the app" : "Coming Soon";

test.skip(WEB_APP_ENABLED, "web app enabled: the lock is off");

test.describe("Landing page at /", () => {
  test("renders the landing at / with no web sign-in links", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page).toHaveTitle("ELO RATED: Ranked Jiu-Jitsu");
    await expect(page.getByRole("heading", { level: 1, name: "We are ELO RATED. Are you?" })).toBeVisible();
    // Intro and HOW IT WORKS are hidden for now (owner, 2026-10-18).
    await expect(page.getByText("What's your number?")).toHaveCount(0);
    await expect(page.getByText("HOW IT WORKS")).toHaveCount(0);
    const heroLine = page.locator('[data-testid="landing-hero"] [data-lk="soon"]:visible');
    await expect(heroLine).toHaveCount(1);
    await expect(heroLine).toHaveText(HERO_LINE);
    // Hero download moment and footer: both official badges, never red.
    const badgeBlocks = page.getByTestId("store-badges");
    await expect(badgeBlocks).toHaveCount(2);
    await expectStoreBadges(page, badgeBlocks.first());
    await expectStoreBadges(page, badgeBlocks.last());
    await expect(page.locator("main [style*='--accent-cta)']")).toHaveCount(0);
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

  test("shows the video poster and plays the right rendition", async ({ page, request }, testInfo) => {
    const poster = await request.get(POSTER, { maxRedirects: 0 });
    expect(poster.status()).toBe(200);
    expect(poster.headers()["content-type"]).toContain("image/jpeg");
    await page.goto("/");
    const video = page.getByTestId("hero-video");
    await expect(video).toHaveAttribute("poster", POSTER);
    // The light file below 1024 CSS px (P15); Playwright's Pixel 5 is 393 wide.
    const rendition = testInfo.project.name === "mobile-chrome" ? "-720.mp4" : "-1080.mp4";
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentSrc)).toMatch(new RegExp(`${rendition}$`));
    // Chromium builds without H.264 cannot play it; there the poster is the designed fallback.
    const h264 = await video.evaluate((el: HTMLVideoElement) => el.canPlayType('video/mp4; codecs="avc1.640028"'));
    if (h264) await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused), { timeout: 10_000 }).toBe(false);
  });

  test("serves the videos while locked, with range requests", async ({ request }) => {
    for (const path of VIDEOS) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("video/mp4");
      const range = await request.get(path, { maxRedirects: 0, headers: { Range: "bytes=0-1023" } });
      expect(range.status()).toBe(206);
      expect(range.headers()["content-range"]).toMatch(/^bytes 0-1023\//);
    }
  });

  test("ends the intro with every lockup part shown", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3500);
    await expect(page.getByTestId("landing-hero")).toHaveAttribute("data-intro", "done");
    const opacities = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-lk]"))
        .filter((el) => el.checkVisibility())
        .map((el) => getComputedStyle(el).opacity),
    );
    expect(opacities.length).toBeGreaterThan(4);
    expect(new Set(opacities)).toEqual(new Set(["1"]));
    await expect(page.locator('[data-testid="landing-hero"] [data-lk="soon"]:visible')).toBeVisible();
  });

  test("shows a SAMPLE tick, aria-hidden, in the ticker format", async ({ page }) => {
    await page.goto("/");
    const ticker = page.getByTestId("hero-ticker");
    await expect(ticker).toHaveAttribute("aria-hidden", "true");
    await expect(ticker).toContainText("SAMPLE", { timeout: 6000 });
    await expect(page.getByTestId("hero-ticker-line")).toHaveText(TICK);
  });

  test("sizes the lockup for the screen's pixel density before hydration (no jump)", async ({ browser, baseURL }) => {
    const width = async (javaScriptEnabled: boolean) => {
      const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, javaScriptEnabled });
      const page = await ctx.newPage();
      await page.goto("/");
      if (javaScriptEnabled) await page.waitForTimeout(1000);
      const box = await page.locator('[data-lockup-set="block"]').boundingBox();
      await ctx.close();
      return box?.width ?? 0;
    };
    const firstPaint = await width(false); // the server HTML and CSS only
    const hydrated = await width(true);
    expect(firstPaint).toBeGreaterThan(0);
    expect(firstPaint).toBeLessThanOrEqual(288); // 864 device px / DPR 3
    expect(Math.abs(hydrated - firstPaint)).toBeLessThan(1);
  });

  for (const [w, h, set] of [[800, 1001, "block"], [800, 1000, "oneline"], [799, 1000, "block"]] as const) {
    test(`shows exactly one lockup set at ${w}x${h} (${set})`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ baseURL, viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto("/");
      const shown = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-lockup-set]"))
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => el.dataset.lockupSet),
      );
      await ctx.close();
      expect(shown).toEqual([set]);
    });
  }

  test("serves today's icons", async ({ request }) => {
    for (const path of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/icon-192.png", "/icon-512.png"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200);
    }
  });

  test("logs no console errors or hydration warnings and loads no CDN fonts or scripts", async ({ page }) => {
    const problems: string[] = [];
    const external: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(String(e)));
    page.on("request", (r) => {
      if (/fonts\.googleapis|fonts\.gstatic|cdnjs/.test(r.url())) external.push(r.url());
    });
    await page.goto("/");
    await page.waitForTimeout(4500);
    expect(problems).toEqual([]);
    expect(external).toEqual([]);
  });

  test.describe("under reduced motion", () => {
    test("renders the end state at once, keeps the poster and shows no ticker", async ({ page }) => {
      // emulateMedia rather than test.use({ reducedMotion }), which this
      // config's projects did not apply (matchMedia still read no-preference).
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      const opacities = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-lk]"))
          .filter((el) => el.checkVisibility())
          .map((el) => getComputedStyle(el).opacity),
      );
      expect(opacities.length).toBeGreaterThan(4);
      expect(new Set(opacities)).toEqual(new Set(["1"]));
      const video = page.getByTestId("hero-video");
      for (let i = 0; i < 4; i++) {
        expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(4000);
      await expect(page.getByTestId("hero-ticker")).toHaveText("");
      await page.screenshot({ path: "test-results/landing-reduced-motion.png" });
    });
  });

  // AC5: no horizontal scroll, the 137 x 31 header logo, and no overlap
  // between the hero line, the hero badges, the header logo and the ticker.
  for (const [w, h] of [[320, 568], [375, 667], [390, 844], [844, 390], [768, 1024], [1280, 800], [1920, 1080]]) {
    test.describe(`layout at ${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h } });

      test("fits, keeps the logo size and nothing overlaps", async ({ page }, testInfo) => {
        await page.goto("/");
        await expect(page.getByTestId("hero-ticker")).toContainText("SAMPLE", { timeout: 6000 });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        const box = async (selector: string) => {
          const b = await page.locator(selector).boundingBox();
          expect(b, selector).not.toBeNull();
          return b!;
        };
        const hero = await box('[data-testid="landing-hero"]');
        const logo = await box('[data-testid="hero-header-logo"] svg');
        expect([Math.round(logo.width), Math.round(logo.height)]).toEqual([137, 31]);
        const parts = {
          logo,
          line: await box('[data-testid="landing-hero"] [data-lk="soon"]:visible'),
          badges: await box('[data-testid="hero-badges"]'),
          ticker: await box('[data-testid="hero-ticker"]'),
        };
        const corners = page.getByTestId("hero-corner");
        await expect(corners).toHaveCount(4);
        for (let i = 0; i < 4; i++) {
          const b = await corners.nth(i).boundingBox();
          expect(b).not.toBeNull();
          (parts as Record<string, typeof logo>)[`corner${i + 1}`] = b!;
        }
        const names = Object.keys(parts) as Array<keyof typeof parts>;
        for (const n of names) {
          const b = parts[n];
          expect(b.x >= hero.x && b.y >= hero.y && b.x + b.width <= hero.x + hero.width && b.y + b.height <= hero.y + hero.height, `${n} inside the hero`).toBe(true);
        }
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const a = parts[names[i]];
            const b = parts[names[j]];
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(overlap, `${names[i]} overlaps ${names[j]}`).toBe(false);
          }
        }
        const size = await page
          .locator('[data-testid="landing-hero"] [data-lk="soon"]:visible')
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(10);
        await page.screenshot({ path: `test-results/landing-${w}x${h}-${testInfo.project.name}.png` });
      });
    });
  }
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

  test("assetlinks.json is served as JSON with no redirect", async ({ request }) => {
    const res = await request.get("/.well-known/assetlinks.json", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(Array.isArray(await res.json())).toBe(true);
  });

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
