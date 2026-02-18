import { pause, scrollDown } from "../helpers/pause";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Dashboard Tour";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page }: SceneContext) => {
  // Should already be on dashboard after login
  await page.waitForSelector("h1");
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll to stat cards
  await scrollDown(page, 250);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll to challenges section
  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll to recent activity
  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, "TRANSITION");
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
