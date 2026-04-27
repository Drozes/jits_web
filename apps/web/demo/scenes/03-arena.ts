import { pause, scrollDown } from "../helpers/pause";
import { tapNavItem } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Arena";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page }: SceneContext) => {
  await tapNavItem(page, "/arena");
  await pause(page, "SCENE_INTRO");

  // Scroll through competitor cards
  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, "TRANSITION");
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
