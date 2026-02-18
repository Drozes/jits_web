import { pause } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Record Results";
export const requiresSecondAccount = false;

export const shouldRun = ({ shared }: { shared: { matchId?: string } }) =>
  !!shared.matchId;

export const run = async ({ pageA: page, shared }: SceneContext) => {
  // Each scene gets a fresh context, so navigate to the results page explicitly
  await navigateTo(page, `/match/${shared.matchId}/results`);
  await pause(page, "SCENE_INTRO");

  // Click Submission
  const submissionBtn = page.getByRole("button", { name: "Submission" });
  await submissionBtn.click();
  await pause(page, "INTERACTION");

  // Select winner (first combobox = winner select)
  const winnerTrigger = page.locator('button[role="combobox"]').first();
  await winnerTrigger.click();
  await pause(page, "INTERACTION");

  // Pick the first option (Account A)
  const firstOption = page.locator('[role="option"]').first();
  await firstOption.click();
  await pause(page, "INTERACTION");

  // Select submission type (second combobox)
  const submissionTrigger = page.locator('button[role="combobox"]').nth(1);
  await submissionTrigger.click();
  await pause(page, "INTERACTION");

  // Pick "Rear Naked Choke" or the first available option
  const rncOption = page.locator('[role="option"]').filter({ hasText: /Rear Naked Choke/i });
  if (await rncOption.isVisible()) {
    await rncOption.click();
  } else {
    await page.locator('[role="option"]').first().click();
  }
  await pause(page, "INTERACTION");

  // Fill finish time (2:30)
  const minuteInput = page.locator('input[type="number"][placeholder="Min"]');
  const secondInput = page.locator('input[type="number"][placeholder="Sec"]');
  await minuteInput.fill("2");
  await secondInput.fill("30");
  await pause(page, "INTERACTION");

  // Submit result
  const submitBtn = page.getByRole("button", { name: "Submit Result" });
  await submitBtn.click();

  // Wait for result to be processed
  await page.waitForTimeout(3000);
  await pause(page, "FEATURE_SHOWCASE");
};

export default { sceneName, requiresSecondAccount, shouldRun, run } satisfies Scene;
