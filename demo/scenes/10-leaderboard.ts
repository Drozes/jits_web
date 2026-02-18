import { pause, scrollDown } from "../helpers/pause";
import { tapNavItem } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Leaderboard";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page }: SceneContext) => {
  await tapNavItem(page, "/leaderboard");
  await pause(page, "SCENE_INTRO");

  // Scroll through gym rankings
  await scrollDown(page, 250);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll through athlete rankings
  await scrollDown(page, 400);
  await pause(page, "FEATURE_SHOWCASE");

  await scrollDown(page, 400);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, "TRANSITION");
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
