import { test, expect } from "@playwright/test";

// Field labels on the branded auth surfaces are uppercased with CSS
// `text-transform`, which the accessible-name computation applies, so these
// locators are anchored case-insensitive regexes rather than literal strings.
const EMAIL_FIELD = /^email$/i;
const PASSWORD_FIELD = /^password$/i;
const SIGN_IN_CTA = /^sign in$/i;

test.describe("Public pages", () => {
  test("login page renders with form fields", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel(EMAIL_FIELD)).toBeVisible();
    await expect(page.getByPlaceholder("m@example.com")).toBeVisible();
    await expect(page.getByLabel(PASSWORD_FIELD)).toBeVisible();
    await expect(page.getByRole("button", { name: SIGN_IN_CTA })).toBeVisible();
  });

  test("login page keeps the SSO and account-recovery paths", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /sign in with google/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in with apple/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /register with email/i }),
    ).toHaveAttribute("href", "/signup");
    await expect(
      page.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  test("signup page renders with form fields", async ({ page }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { name: /create account/i }),
    ).toBeVisible();
    // `sign-up-form.tsx` renders standalone <label> elements with no `htmlFor`
    // and no placeholders, so its fields have no accessible name to target.
    // Asserting by input type until that form gets label associations.
    // `.first()` rides out the brief double-render `next dev` shows while it
    // cold-compiles the route; the retrying assertion still proves one is live.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(
      page.getByText("Reset Your Password", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(EMAIL_FIELD)).toBeVisible();
  });
});

test.describe("Auth redirects", () => {
  test("unauthenticated user is redirected from home to login", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("button", { name: SIGN_IN_CTA })).toBeVisible();
  });

  test("unauthenticated user is redirected from profile to login", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("button", { name: SIGN_IN_CTA })).toBeVisible();
  });
});
