import { pause } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Accept Challenge";
export const requiresSecondAccount = true;

export const shouldRun = ({ shared }: { shared: { challengeId?: string } }) =>
  !!shared.challengeId;

export const run = async ({ pageB, shared }: SceneContext) => {
  if (!pageB) throw new Error("Account B page not available");

  // Account B navigates to the lobby
  await navigateTo(pageB, `/match/lobby/${shared.challengeId}`);
  await pause(pageB, "SCENE_INTRO");

  // View the VS layout and ELO stakes
  await pause(pageB, "FEATURE_SHOWCASE");

  // Fill weight
  await pageB.fill("input#lobby-weight", "180");
  await pause(pageB, "INTERACTION");

  // Confirm weight
  await pageB.click("#confirm-lobby-weight");
  await pause(pageB, "INTERACTION");

  // Accept the challenge
  const acceptBtn = pageB.getByRole("button", { name: "Accept" });
  await acceptBtn.click();

  // Wait for page to refresh to accepted state
  await pageB
    .getByRole("button", { name: /start match/i })
    .waitFor({ state: "visible", timeout: 10000 });
  await pause(pageB, "FEATURE_SHOWCASE");
};

export default { sceneName, requiresSecondAccount, shouldRun, run } satisfies Scene;
