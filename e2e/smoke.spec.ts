import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("login page renders with form fields", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("text=Login").first()).toBeVisible();
    await expect(page.getByPlaceholder("m@example.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /login/i }),
    ).toBeVisible();
  });

  test("signup page renders with form fields", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.locator("text=Sign up").first()).toBeVisible();
    await expect(page.getByPlaceholder("m@example.com")).toBeVisible();
  });

  test("forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(
      page.locator("text=Reset Your Password").first(),
    ).toBeVisible();
  });
});

test.describe("Auth redirects", () => {
  test("unauthenticated user is redirected from home to login", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.locator("text=Login").first()).toBeVisible();
  });

  test("unauthenticated user is redirected from profile to login", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
    await expect(page.locator("text=Login").first()).toBeVisible();
  });
});
