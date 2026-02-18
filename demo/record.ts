import { test } from "@playwright/test";
import { saveAuthState, createSceneContext } from "./helpers/auth";
import { mkdirSync, rmSync } from "fs";
import type { BrowserContext, Page } from "@playwright/test";
import type { Scene, SharedState } from "./scenes/types";

import scene01 from "./scenes/01-login";
import scene02 from "./scenes/02-dashboard";
import scene03 from "./scenes/03-arena";
import scene04 from "./scenes/04-swipe";
import scene05 from "./scenes/05-athlete-profile";
import scene06 from "./scenes/06-send-challenge";
import scene07 from "./scenes/07-accept-challenge";
import scene08 from "./scenes/08-match-live";
import scene09 from "./scenes/09-record-results";
import scene10 from "./scenes/10-leaderboard";
import scene11 from "./scenes/11-messages";
import scene12 from "./scenes/12-profile";

const SCENES: Scene[] = [
  scene01,
  scene02,
  scene03,
  scene04,
  scene05,
  scene06,
  scene07,
  scene08,
  scene09,
  scene10,
  scene11,
  scene12,
];

// Per-scene timeout (ms) — prevents one stuck scene from stalling the run
const SCENE_TIMEOUT = 60_000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Scene "${label}" timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

test("Record full demo", async ({ browser }) => {
  const baseURL = "http://localhost:3000";
  const outputDir = "./demo/output";
  const tmpDir = `${outputDir}/.tmp`;
  const scenesDir = `${outputDir}/scenes`;

  const accountA = {
    email: process.env.DEMO_ACCOUNT_A_EMAIL!,
    password: process.env.DEMO_ACCOUNT_A_PASSWORD!,
  };

  const accountB = {
    email: process.env.DEMO_ACCOUNT_B_EMAIL!,
    password: process.env.DEMO_ACCOUNT_B_PASSWORD!,
    athleteId: process.env.DEMO_ACCOUNT_B_ATHLETE_ID,
  };

  if (!accountA.email || !accountA.password) {
    throw new Error(
      "Missing DEMO_ACCOUNT_A_EMAIL or DEMO_ACCOUNT_A_PASSWORD. Copy .env.demo.example to .env.demo and fill in credentials.",
    );
  }

  // Clean previous output and create directories
  rmSync(scenesDir, { recursive: true, force: true });
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(`${scenesDir}/account-a`, { recursive: true });
  mkdirSync(`${scenesDir}/account-b`, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  console.log("\n=== JITS Demo Recorder ===\n");
  console.log(`Account A: ${accountA.email}`);
  console.log(`Account B: ${accountB.email || "(not configured)"}`);
  console.log(`Speed: ${process.env.DEMO_SPEED ?? "1"}x\n`);

  // Authenticate once off-screen (no video) and save state for reuse
  console.log("Authenticating Account A...");
  const authStateA = await saveAuthState(browser, { ...accountA, baseURL });

  let authStateB: Awaited<ReturnType<typeof saveAuthState>> | null = null;
  if (accountB.email && accountB.password) {
    console.log("Authenticating Account B...");
    authStateB = await saveAuthState(browser, { ...accountB, baseURL });
  }

  const shared: SharedState = {
    conversationId: process.env.DEMO_CONVERSATION_ID,
  };

  const accounts = { primary: accountA, secondary: accountB };
  let recorded = 0;
  let skipped = 0;

  console.log("\n=== Recording scenes ===");

  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    const sceneNum = String(i + 1).padStart(2, "0");
    const sceneSlug = slugify(scene.sceneName);
    const filename = `${sceneNum}-${sceneSlug}.webm`;

    console.log(`\n--- ${sceneNum}: ${scene.sceneName} ---`);

    // Pre-checks — skip without creating a browser context
    if (scene.requiresSecondAccount && !authStateB) {
      console.log("  Skipped — Account B not configured");
      skipped++;
      continue;
    }

    if (scene.shouldRun && !scene.shouldRun({ shared, accounts })) {
      console.log("  Skipped — prerequisites not met");
      skipped++;
      continue;
    }

    // Create a fresh recording context for Account A
    const { context: ctxA, page: pageA } = await createSceneContext(browser, {
      baseURL,
      videoDir: tmpDir,
      storageState: scene.skipAuth ? undefined : authStateA,
    });

    // Load the app shell so nav is available (unless scene handles its own flow)
    if (!scene.skipAuth) {
      await pageA.goto("/", { waitUntil: "commit" });
      await pageA
        .waitForSelector('nav a[href="/"]', { timeout: 10_000 })
        .catch(() => {});
    }

    // Create Account B recording context if this scene needs it
    let ctxB: BrowserContext | null = null;
    let pageB: Page | null = null;

    if (scene.requiresSecondAccount && authStateB) {
      ({ context: ctxB, page: pageB } = await createSceneContext(browser, {
        baseURL,
        videoDir: tmpDir,
        storageState: authStateB,
      }));
      await pageB.goto("/", { waitUntil: "commit" });
      await pageB
        .waitForSelector('nav a[href="/"]', { timeout: 10_000 })
        .catch(() => {});
    }

    // Grab video references before any closes
    const videoA = pageA.video();
    const videoB = pageB?.video();

    let success = false;
    try {
      await withTimeout(
        scene.run({
          browser,
          pageA,
          pageB: pageB ?? undefined,
          baseURL,
          accounts,
          shared,
        }),
        SCENE_TIMEOUT,
        scene.sceneName,
      );
      success = true;
      console.log(`  Done: ${scene.sceneName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAILED: ${scene.sceneName} — ${msg}`);
    } finally {
      // Close contexts to finalize video
      await ctxA.close();
      if (ctxB) await ctxB.close();

      // Only save video for scenes that completed successfully
      if (success) {
        if (videoA) await videoA.saveAs(`${scenesDir}/account-a/${filename}`);
        if (videoB) await videoB.saveAs(`${scenesDir}/account-b/${filename}`);
        recorded++;
      } else {
        skipped++;
      }
    }
  }

  // Clean up temp directory (raw Playwright hash-named files)
  rmSync(tmpDir, { recursive: true, force: true });

  console.log("\n=== Recording complete ===");
  console.log(`  Recorded: ${recorded} scenes`);
  console.log(`  Skipped:  ${skipped} scenes`);
  console.log(`\nScene videos: ${scenesDir}/`);
  console.log("Run 'npm run demo:process' to convert and concatenate.\n");
});
