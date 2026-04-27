import { pause } from "../helpers/pause";
import { navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Live Match";
export const requiresSecondAccount = true;

export const shouldRun = ({ shared }: { shared: { challengeId?: string } }) =>
  !!shared.challengeId;

export const run = async ({ pageA, shared }: SceneContext) => {
  // Account A navigates to the lobby
  await navigateTo(pageA, `/match/lobby/${shared.challengeId}`);
  await pause(pageA, "SCENE_INTRO");

  // Set up a listener to capture the match ID from the start_match_from_challenge RPC response
  let rpcMatchId: string | null = null;
  const rpcPromise = pageA.waitForResponse(
    (resp) => resp.url().includes("start_match_from_challenge"),
    { timeout: 15000 },
  );

  // Click Start Match
  const startMatchBtn = pageA.getByRole("button", { name: /start match/i });
  await startMatchBtn.waitFor({ state: "visible", timeout: 10000 });
  await startMatchBtn.click();

  // Wait for the RPC response and extract match ID
  const rpcResponse = await rpcPromise;
  try {
    const body = await rpcResponse.json();
    rpcMatchId = body?.match_id ?? null;
  } catch {
    // Response may not be JSON — continue
  }

  if (rpcMatchId) {
    shared.matchId = rpcMatchId;
    console.log(`  Match ID: ${shared.matchId}`);
  }

  // Give client-side router.push a moment to work
  await pageA.waitForTimeout(2000);

  // If router.push didn't navigate, go directly
  if (!pageA.url().includes("/live") && shared.matchId) {
    await navigateTo(pageA, `/match/${shared.matchId}/live`);
  }

  await pause(pageA, "SCENE_INTRO");

  // Wait for Start Timer button to appear and click it
  const startTimerBtn = pageA.getByRole("button", { name: /start timer/i });
  await startTimerBtn.waitFor({ state: "visible", timeout: 10000 });
  await startTimerBtn.click();
  await pause(pageA, "INTERACTION");

  // Watch the timer tick for a few seconds
  await pageA.waitForTimeout(5000);
  await pause(pageA, "FEATURE_SHOWCASE");

  // Wait for End Match button to appear (replaces Start Timer after RPC completes)
  const endMatchBtn = pageA.getByRole("button", { name: /end match/i });
  await endMatchBtn.waitFor({ state: "visible", timeout: 10000 });
  await endMatchBtn.click();

  // Give client-side router.push a moment, then navigate directly if needed
  await pageA.waitForTimeout(2000);
  if (!pageA.url().includes("/results") && shared.matchId) {
    await navigateTo(pageA, `/match/${shared.matchId}/results`);
  }
  await pause(pageA, "TRANSITION");
};

export default { sceneName, requiresSecondAccount, shouldRun, run } satisfies Scene;
