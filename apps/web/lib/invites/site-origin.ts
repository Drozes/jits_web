/** Public host fallback on a Vercel deploy with no site URL configured. */
export const DEFAULT_PUBLIC_ORIGIN = "https://elorated.com";

function normalise(value: string | undefined, assumeHttps: boolean): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `${assumeHttps ? "https" : "http"}://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Stable public origin for absolute URLs that leave the site (the invite
 * og:image, contract 6). Never VERCEL_URL: that is the per-deployment host,
 * which sits behind Vercel Deployment Protection (crawlers get a 401) and
 * pins every shared card to one old deployment.
 *
 * Order: NEXT_PUBLIC_SITE_URL (https://elorated.com in production), then
 * Vercel's production domain, then the default public host on a Vercel
 * deploy, then localhost for local dev and e2e.
 */
export function publicSiteOrigin(env: Record<string, string | undefined> = process.env): string {
  return (
    normalise(env.NEXT_PUBLIC_SITE_URL, true) ??
    normalise(env.VERCEL_PROJECT_PRODUCTION_URL, true) ??
    (env.VERCEL ? DEFAULT_PUBLIC_ORIGIN : "http://localhost:4983")
  );
}
