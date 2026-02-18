import { pause } from "../helpers/pause";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Login";
export const requiresSecondAccount = false;
export const skipAuth = true;

export const run = async ({ pageA: page, accounts }: SceneContext) => {
  // Navigate to login page (this scene uses an unauthenticated context)
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input#email");
  await pause(page, "SCENE_INTRO");

  // Type credentials with visible keystrokes
  await page.locator("input#email").pressSequentially(accounts.primary.email, { delay: 40 });
  await pause(page, "INTERACTION");

  await page.locator("input#password").pressSequentially(accounts.primary.password, { delay: 40 });
  await pause(page, "INTERACTION");

  // Submit
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
    waitUntil: "commit",
  });
  await page.waitForSelector('nav a[href="/"]', { timeout: 15_000 });
  await pause(page, "FEATURE_SHOWCASE");
};

export default { sceneName, requiresSecondAccount, skipAuth, run } satisfies Scene;
