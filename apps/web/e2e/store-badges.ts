import { expect, type Locator, type Page } from "@playwright/test";
import { APP_STORE_URL, PLAY_STORE_URL } from "../lib/app-links";

// Same parsing as the app (lib/app-links.ts), read from the env the dev
// server also gets through playwright.config.ts, so the specs and the page agree.
export const APP_STORE_LIVE = APP_STORE_URL !== null;
export const PLAY_STORE_LIVE = PLAY_STORE_URL !== null;

/**
 * Both official store badges inside `scope` (default: the first badge block
 * on the page): a store link once its listing is set, else the
 * non-interactive "Coming soon" group. A badge is never the red CTA.
 */
export async function expectStoreBadges(page: Page, scope?: Locator) {
  const badges = scope ?? page.getByTestId("store-badges").first();
  if (APP_STORE_LIVE) {
    await expect(badges.getByRole("link", { name: "Download ELO RATED on the App Store" })).toHaveAttribute("href", APP_STORE_URL!);
  } else {
    await expect(badges.getByRole("group", { name: "App Store: coming soon" })).toBeVisible();
  }
  if (PLAY_STORE_LIVE) {
    await expect(badges.getByRole("link", { name: "Get ELO RATED on Google Play" })).toHaveAttribute("href", PLAY_STORE_URL!);
  } else {
    await expect(badges.getByRole("group", { name: "Google Play: coming soon" })).toBeVisible();
  }
  await expect(badges.getByRole("link")).toHaveCount(Number(APP_STORE_LIVE) + Number(PLAY_STORE_LIVE));
}
