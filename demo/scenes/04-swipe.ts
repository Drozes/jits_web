import { pause } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Swipe Discovery";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page }: SceneContext) => {
  await navigateTo(page, "/arena/swipe");
  await pause(page, "SCENE_INTRO");

  // Helper: click a swipe action button by icon, with animation wait
  async function tapSwipeButton(iconClass: string) {
    const btn = page.locator("button").filter({ has: page.locator(`svg.${iconClass}`) }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      // Wait for card transition animation (0.3s ease) to settle
      await page.waitForTimeout(400);
      await pause(page, "INTERACTION");
      return true;
    }
    return false;
  }

  // Alternate pass/like to show both actions
  await tapSwipeButton("lucide-x");
  await tapSwipeButton("lucide-heart");
  await tapSwipeButton("lucide-x");
  await tapSwipeButton("lucide-heart");

  await pause(page, "FEATURE_SHOWCASE");
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
