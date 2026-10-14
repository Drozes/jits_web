export const APP_STORE_LABEL = "Get it on the App Store";
export const APP_STORE_COMING_SOON_LABEL = "Coming soon to the App Store";

/**
 * The public App Store listing, or null while the app is not public
 * (NEXT_PUBLIC_APP_STORE_URL unset). Only an https URL counts.
 * Target value once live: https://apps.apple.com/app/id6774629438
 */
export function appStoreUrl(): string | null {
  const value = (process.env.NEXT_PUBLIC_APP_STORE_URL ?? "").trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** True once the listing is public (drives the one-red-CTA swap, spec P3). */
export function isAppStoreLive(): boolean {
  return appStoreUrl() !== null;
}
