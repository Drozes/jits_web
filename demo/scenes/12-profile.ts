import { pause, scrollDown } from "../helpers/pause";
import { tapNavItem } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Profile";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page }: SceneContext) => {
  await tapNavItem(page, "/profile");
  await pause(page, "SCENE_INTRO");

  // Scroll to stats
  await scrollDown(page, 250);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll to match history
  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  // Open share profile sheet
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, "TRANSITION");

  const shareBtn = page.locator("button").filter({ has: page.locator("svg.lucide-share-2") }).first();
  if (await shareBtn.isVisible()) {
    await shareBtn.click();
    await pause(page, "FEATURE_SHOWCASE");

    // Close the sheet
    await page.keyboard.press("Escape");
    await pause(page, "INTERACTION");
  }
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
