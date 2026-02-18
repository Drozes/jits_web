import type { Page, BrowserContext, Browser, BrowserContextOptions } from "@playwright/test";

const DEVICE: Pick<
  BrowserContextOptions,
  "viewport" | "deviceScaleFactor" | "isMobile" | "hasTouch"
> = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const VIDEO_SIZE = { width: 390, height: 844 };

/**
 * Log in and return serialized storage state (cookies + localStorage).
 * No video recording — purely to capture auth tokens for reuse.
 */
export async function saveAuthState(
  browser: Browser,
  opts: { email: string; password: string; baseURL: string },
) {
  const context = await browser.newContext({ ...DEVICE, baseURL: opts.baseURL });
  const page = await context.newPage();
  await login(page, opts);
  const state = await context.storageState();
  await context.close();
  return state;
}

/**
 * Create a browser context with video recording and optional pre-auth.
 * Each scene gets its own context so the video is tight — no dead time.
 */
export async function createSceneContext(
  browser: Browser,
  opts: {
    baseURL: string;
    videoDir: string;
    storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>;
  },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...DEVICE,
    baseURL: opts.baseURL,
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    recordVideo: { dir: opts.videoDir, size: VIDEO_SIZE },
  });
  const page = await context.newPage();
  return { context, page };
}

export async function login(
  page: Page,
  opts: { email: string; password: string },
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input#email");
  await page.fill("input#email", opts.email);
  await page.fill("input#password", opts.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
    waitUntil: "commit",
  });
  await page.waitForSelector('nav a[href="/"]', { timeout: 15_000 });
}
