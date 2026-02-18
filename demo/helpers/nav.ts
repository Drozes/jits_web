import type { Page } from "@playwright/test";
import { pause } from "./pause";

export async function navigateTo(page: Page, path: string): Promise<void> {
  // Use "commit" to avoid waiting for streaming SSR to complete —
  // Next.js Suspense streaming can keep connections open indefinitely
  // if a server query stalls.
  await page
    .goto(path, { timeout: 15_000, waitUntil: "commit" })
    .catch(() => {
      console.log(`    Warning: goto ${path} timed out, continuing anyway`);
    });
  await waitForContent(page);
  await pause(page, "TRANSITION");
}

export async function tapNavItem(page: Page, href: string): Promise<void> {
  await page.click(`nav a[href="${href}"]`);
  await page
    .waitForURL((url) => url.pathname.startsWith(href), { timeout: 10_000 })
    .catch(() => {
      console.log(`    Warning: waitForURL ${href} timed out`);
    });
  await waitForContent(page);
  await pause(page, "TRANSITION");
}

async function waitForContent(page: Page): Promise<void> {
  // Wait for real content to appear (animate-page-in class)
  await page
    .waitForSelector(".animate-page-in", { timeout: 10_000 })
    .catch(() => {
      // Fallback: just wait for any content to settle
    });
  await page.waitForTimeout(500);
}
