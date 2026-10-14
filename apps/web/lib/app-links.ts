import type { Metadata } from "next";

/** App Store Connect app id (apps/mobile/eas.json `ascAppId`). */
export const APP_STORE_ID = "6774629438";

/** Android application id (apps/mobile/app.json). */
export const ANDROID_PACKAGE = "com.elorated.mobile";

const APP_STORE_HOST = "apps.apple.com";
const PLAY_STORE_HOST = "play.google.com";

/**
 * A store listing URL from the environment, or null. Only an https URL on the
 * store's own host counts: anything else (unset, blank, a typo, another
 * host) reads as "not live yet", so a badge never links somewhere wrong.
 * There is deliberately no search fallback: a search page is not a listing,
 * and linking one made the old App Store button claim the app was out.
 */
export function parseStoreUrl(raw: string | undefined, host: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== host) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * The store listings. Both are unset until the listings go public; setting
 * NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL (and redeploying, as
 * NEXT_PUBLIC_* values are inlined at build time) makes the badges live with
 * no code change. Expected values:
 * https://apps.apple.com/app/id6774629438 and
 * https://play.google.com/store/apps/details?id=com.elorated.mobile
 */
export const APP_STORE_URL = parseStoreUrl(process.env.NEXT_PUBLIC_APP_STORE_URL, APP_STORE_HOST);
export const PLAY_STORE_URL = parseStoreUrl(process.env.NEXT_PUBLIC_PLAY_STORE_URL, PLAY_STORE_HOST);

/**
 * Apple's Smart App Banner (`<meta name="apple-itunes-app">`), only once the
 * App Store listing is live: before that the banner would point at an app
 * nobody can install. `appArgument` is the URL the app opens when launched
 * from the banner. There is no Android equivalent (Chrome dropped it).
 */
export function smartAppBanner(appArgument?: string): Metadata["itunes"] {
  if (!APP_STORE_URL) return undefined;
  return appArgument ? { appId: APP_STORE_ID, appArgument } : { appId: APP_STORE_ID };
}
