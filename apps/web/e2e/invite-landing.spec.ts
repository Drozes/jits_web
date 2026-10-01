import { test, expect } from "@playwright/test";

// Fixture tokens resolved by lib/invites/e2e-fixtures.ts when the dev server
// runs with E2E_INVITE_FIXTURES=1 (playwright.config.ts sets it).
const CHALLENGE = "e2eChallengeTokenAAAAA";
const JOIN = "e2eJoinTokenAAAAAAAAAA";
const UNAVAILABLE = "e2eUnavailableTokenAAA";

const INSTAGRAM_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0)";

test.describe("Invite landing /c/[token]", () => {
  test("challenge: card copy, big code, one red CTA, app links, safe headers", async ({ page }) => {
    const response = await page.goto(`/c/${CHALLENGE}`);
    expect(response?.status()).toBe(200);
    const headers = await response!.allHeaders();
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toBe("noindex");
    // `next dev` forces "no-cache, must-revalidate" on every page; a production
    // build serves the configured "private, no-store" (verified with next start).
    expect(headers["cache-control"]).toMatch(/no-store|no-cache/);
    expect(headers["set-cookie"]).toMatch(/er_invite=e2eChallengeTokenAAAAA;.*HttpOnly/i);

    await expect(page).toHaveTitle("ALEX R. challenges you | ELO RATED");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ALEX R\. challenges you/i);
    await expect(page.getByText("1,482 ELO · 172 LBS · Jiu-jitsu match")).toBeVisible();
    await expect(page.getByTestId("invite-code")).toHaveText("K7Q-4M2");

    const appStore = page.getByRole("link", { name: /get it on the app store/i });
    await expect(appStore).toBeVisible();
    await expect(page.getByRole("link", { name: /open in app/i })).toHaveAttribute(
      "href",
      `elorated://c/${CHALLENGE}`,
    );
    await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up on web/i })).toHaveAttribute(
      "href",
      `/signup?next=${encodeURIComponent(`/c/${CHALLENGE}`)}`,
    );
    // No in-app browser hint in a normal browser.
    await expect(page.getByTestId("in-app-browser-hint")).toHaveCount(0);

    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveAttribute("content", new RegExp(`/c/${CHALLENGE}/opengraph-image`));
    // `next dev` always resolves file-based OG images against localhost, so
    // the public-origin rule (never VERCEL_URL) is pinned by page.test.ts and
    // was verified on `next start` with NEXT_PUBLIC_SITE_URL and VERCEL_URL set.
    const ogUrl = new URL((await og.getAttribute("content")) ?? "");
    expect(ogUrl.hostname).not.toMatch(/\.vercel\.app$/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  });

  test("join: join copy, no code", async ({ page }) => {
    await page.goto(`/c/${JOIN}`);
    await expect(page).toHaveTitle("Join ALEX R. on ELO RATED");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Join ALEX R\. on ELO RATED/i);
    await expect(page.getByText("1,482 ELO · Jiu-jitsu", { exact: true })).toBeVisible();
    await expect(page.getByTestId("invite-code")).toHaveCount(0);
  });

  test("unavailable: generic message, App Store, no cookie", async ({ page }) => {
    const response = await page.goto(`/c/${UNAVAILABLE}`);
    expect((await response!.allHeaders())["set-cookie"] ?? "").not.toContain("er_invite");
    await expect(page.getByTestId("invite-unavailable")).toBeVisible();
    await expect(
      page.getByText("This invite is no longer available. Ask your training partner for a new one."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /get it on the app store/i })).toBeVisible();
  });

  test("malformed token reads as unavailable", async ({ page }) => {
    await page.goto("/c/not-a-token");
    await expect(page.getByTestId("invite-unavailable")).toBeVisible();
  });

  test("signup on the invite path shows the banner and drops the gym requirement", async ({ page }) => {
    await page.goto(`/signup?next=${encodeURIComponent(`/c/${CHALLENGE}`)}`);
    await expect(
      page.getByRole("status").filter({ hasText: "Alex challenged you. Create your account to accept." }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: "Free agent (no gym)" })).toHaveCount(1);
    // One-tap OAuth and a way back to log in, both carrying ?next=.
    const alternatives = page.getByTestId("invite-signup-alternatives");
    await expect(alternatives.getByRole("button", { name: /apple/i })).toBeVisible();
    await expect(alternatives.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(alternatives.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/c/${CHALLENGE}`)}`,
    );
  });

  test("OG image is a JPEG under 250 KB", async ({ request }) => {
    for (const token of [CHALLENGE, JOIN, UNAVAILABLE]) {
      const res = await request.get(`/c/${token}/opengraph-image`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/jpeg");
      expect((await res.body()).byteLength).toBeLessThan(250 * 1024);
    }
  });

  test("AASA is served as JSON with only /c/*", async ({ request }) => {
    const res = await request.get("/.well-known/apple-app-site-association", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(body.applinks.details[0].appIDs).toEqual(["JK9Q5E3HT8.com.elorated.mobile"]);
    expect(body.applinks.details[0].components).toEqual([
      expect.objectContaining({ "/": "/c/*" }),
    ]);
  });

  test("invite-events rejects bad input and landing_viewed", async ({ request }) => {
    const bad = await request.post("/api/invite-events", { data: { token: "x", step: "link_copied" } });
    expect(bad.status()).toBe(400);
    const viewed = await request.post("/api/invite-events", {
      data: { token: CHALLENGE, step: "landing_viewed" },
    });
    expect(viewed.status()).toBe(400);
    const ok = await request.post("/api/invite-events", {
      data: { token: CHALLENGE, step: "link_copied", in_app_browser: null },
    });
    expect(ok.status()).toBe(204);
  });
});

test.describe("Invite landing inside Instagram", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: INSTAGRAM_UA });

  test("shows the Open in Safari hint and fits the phone width", async ({ page }) => {
    await page.goto(`/c/${CHALLENGE}`);
    await expect(page.getByTestId("in-app-browser-hint")).toContainText("Open in Safari");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/invite-landing-instagram.png", fullPage: true });
  });
});
