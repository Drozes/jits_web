import { pause, scrollDown } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Athlete Profile";
export const requiresSecondAccount = false;

export const shouldRun = ({ accounts }: { accounts: { secondary: { athleteId?: string } } }) =>
  !!accounts.secondary.athleteId;

export const run = async ({ pageA: page, accounts }: SceneContext) => {
  const athleteId = accounts.secondary.athleteId!;

  await navigateTo(page, `/athlete/${athleteId}`);
  await pause(page, "SCENE_INTRO");

  // Scroll to see stats and actions
  await scrollDown(page, 200);
  await pause(page, "FEATURE_SHOWCASE");

  // Open Compare Stats modal
  const compareBtn = page.getByRole("button", { name: /Compare Stats/ });
  if (await compareBtn.isVisible()) {
    await compareBtn.click();
    await pause(page, "FEATURE_SHOWCASE");

    // Close the modal
    await page.keyboard.press("Escape");
    await pause(page, "INTERACTION");
  }

  // Scroll to head-to-head section
  await scrollDown(page, 300);
  await pause(page, "FEATURE_SHOWCASE");

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, "TRANSITION");
};

export default { sceneName, requiresSecondAccount, shouldRun, run } satisfies Scene;
