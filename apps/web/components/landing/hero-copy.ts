import { APP_STORE_URL } from "@/lib/app-links";

export const HERO_LINE_SOON = "Coming Soon";
export const HERO_LINE_LIVE = "Get the app";

/**
 * The red line under the hero lockup (O14): "Coming Soon" until the App
 * Store listing is set (the same parsed signal that makes the badge live),
 * then "Get the app". Build-time, like every NEXT_PUBLIC_* value.
 */
export function heroLine(appStoreUrl: string | null = APP_STORE_URL): string {
  return appStoreUrl ? HERO_LINE_LIVE : HERO_LINE_SOON;
}
