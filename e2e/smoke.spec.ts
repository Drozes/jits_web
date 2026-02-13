import { test, expect } from "@playwright/test";

test.describe("Layout shell", () => {
  test("home page renders header, content, and bottom nav", async ({
    page,
  }) => {
    await page.goto("/");

    // Header with app title
    await expect(page.locator("header")).toContainText("Jits");

    // Bottom nav with all 4 tabs
    const nav = page.locator("nav").last();
    await expect(nav.getByText("Home")).toBeVisible();
    await expect(nav.getByText("Rankings")).toBeVisible();
    await expect(nav.getByText("Arena")).toBeVisible();
    await expect(nav.getByText("Profile")).toBeVisible();

    // Home tab is active (has primary color)
    const homeLink = nav.getByRole("link", { name: "Home" });
    await expect(homeLink).toHaveClass(/text-primary/);
  });

  test("bottom nav links point to correct routes", async ({ page }) => {
    await page.goto("/");

    const nav = page.locator("nav").last();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(
      nav.getByRole("link", { name: "Rankings" }),
    ).toHaveAttribute("href", "/leaderboard");
    await expect(nav.getByRole("link", { name: "Arena" })).toHaveAttribute(
      "href",
      "/arena",
    );
    await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});

test.describe("Login page", () => {
  test("login form renders with email and password fields", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.locator("text=Login").first(),
    ).toBeVisible();
    await expect(page.getByPlaceholder("m@example.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /login/i }),
    ).toBeVisible();
  });
});
