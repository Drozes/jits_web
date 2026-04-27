import { pause } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Send Challenge";
export const requiresSecondAccount = true;

export const shouldRun = ({ accounts }: { accounts: { secondary: { athleteId?: string } } }) =>
  !!accounts.secondary.athleteId;

export const run = async ({ pageA: page, accounts, shared }: SceneContext) => {
  const athleteId = accounts.secondary.athleteId!;

  // Navigate to opponent's profile
  await navigateTo(page, `/athlete/${athleteId}`);
  await pause(page, "SCENE_INTRO");

  // Click Challenge button
  const challengeBtn = page.getByRole("button", { name: "Challenge" });
  await challengeBtn.click();
  await pause(page, "INTERACTION");

  // Wait for sheet to open, then select Ranked match type
  const rankedBtn = page.getByRole("button", { name: "Ranked" });
  await rankedBtn.waitFor({ state: "visible", timeout: 5000 });
  await rankedBtn.click();
  await pause(page, "INTERACTION");

  // Wait for ELO stakes to load (case-insensitive, partial match)
  await page
    .getByText(/elo stakes/i)
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  await pause(page, "FEATURE_SHOWCASE");

  // Fill weight
  await page.fill("input#challenge-weight", "175");
  await pause(page, "INTERACTION");

  // Check weight confirmation
  await page.click("#confirm-weight");
  await pause(page, "INTERACTION");

  // Send challenge
  const sendBtn = page.getByRole("button", { name: /send challenge/i });
  await sendBtn.click();

  // Wait for success state (case-insensitive)
  await page
    .getByText(/challenge sent/i)
    .waitFor({ state: "visible", timeout: 10000 });
  await pause(page, "FEATURE_SHOWCASE");

  // Navigate to pending challenges to extract challenge ID
  await navigateTo(page, "/match/pending");
  await pause(page, "SCENE_INTRO");

  // Click the "Sent" tab to reveal sent challenges
  const sentTab = page.getByRole("tab", { name: /Sent/ });
  await sentTab.click();
  await pause(page, "INTERACTION");

  // Extract challengeId from the first lobby link in the sent tab
  const lobbyLink = page.locator('a[href^="/match/lobby/"]').first();
  const href = await lobbyLink
    .getAttribute("href", { timeout: 5000 })
    .catch(() => null);
  if (href) {
    shared.challengeId = href.replace("/match/lobby/", "");
    console.log(`  Challenge ID: ${shared.challengeId}`);
  } else {
    console.log("  Warning: Could not find challenge link on pending page");
  }

  await pause(page, "FEATURE_SHOWCASE");
};

export default { sceneName, requiresSecondAccount, shouldRun, run } satisfies Scene;
