import type { Page } from "@playwright/test";

const DEFAULTS = {
  SCENE_INTRO: 2000,
  INTERACTION: 800,
  TRANSITION: 1500,
  FEATURE_SHOWCASE: 3000,
  SCROLL_STEP: 600,
} as const;

type PauseType = keyof typeof DEFAULTS;

function getDuration(type: PauseType): number {
  const envKey = `DEMO_PAUSE_${type}`;
  const envVal = process.env[envKey];
  if (envVal) return parseInt(envVal, 10);

  const speed = parseFloat(process.env.DEMO_SPEED ?? "1");
  return Math.round(DEFAULTS[type] / speed);
}

export async function pause(page: Page, type: PauseType): Promise<void> {
  await page.waitForTimeout(getDuration(type));
}

export async function scrollDown(page: Page, pixels = 300): Promise<void> {
  await page.evaluate(
    (px) => window.scrollBy({ top: px, behavior: "smooth" }),
    pixels,
  );
  await pause(page, "SCROLL_STEP");
}
