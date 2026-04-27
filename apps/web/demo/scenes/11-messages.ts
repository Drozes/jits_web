import { pause } from "../helpers/pause";
import { tapNavItem, navigateTo } from "../helpers/nav";
import type { Scene, SceneContext } from "./types";

export const sceneName = "Messages";
export const requiresSecondAccount = false;

export const run = async ({ pageA: page, shared }: SceneContext) => {
  await tapNavItem(page, "/messages");
  await pause(page, "SCENE_INTRO");

  // Click the first conversation or use a known conversation ID
  if (shared.conversationId) {
    await navigateTo(page, `/messages/${shared.conversationId}`);
  } else {
    const firstConvo = page.locator('a[href^="/messages/"]').first();
    if (await firstConvo.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstConvo.click();
      await page
        .waitForURL((url) => /\/messages\/.+/.test(url.pathname), { timeout: 10000 })
        .catch(() => {});
      await pause(page, "TRANSITION");
    } else {
      console.log("  No conversations found — skipping thread view");
      return;
    }
  }

  await pause(page, "SCENE_INTRO");

  // Type a message
  const messageInput = page.getByPlaceholder("Message...");
  if (await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await messageInput.fill("Great match today! Want to run it back?");
    await pause(page, "INTERACTION");

    // Send the message (round button next to input)
    const sendBtn = page.locator("button.rounded-full").last();
    await sendBtn.click();
    await pause(page, "FEATURE_SHOWCASE");
  } else {
    console.log("  Message input not found — skipping message send");
  }
};

export default { sceneName, requiresSecondAccount, run } satisfies Scene;
