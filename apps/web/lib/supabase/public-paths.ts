/**
 * Paths a signed-out visitor may load; every other path is redirected to
 * /login by the proxy (lib/supabase/proxy.ts). A listed path also covers
 * everything below it.
 *
 * NOTE: /design is intentionally NOT public: the design section (incl. the
 * internal /design/board Kanban) is gated behind login.
 * /terms and /privacy (and their French versions /terms/fr and /privacy/fr,
 * listed explicitly although the prefix rule already covers them) are public
 * for store reviewers and Meta's Live-mode check (jits-s6mi.7).
 * /c (invite landing + its OG image), /api/invite-events (landing telemetry)
 * and /.well-known (apple-app-site-association) are public for invitees,
 * link-preview crawlers and Apple's CDN (016 invites, contract 6).
 * /support is the App Store Support URL (specs/web-landing/spec.md), and
 * /robots.txt is for crawlers.
 */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/confirm",
  "/error",
  "/auth/callback",
  "/terms",
  "/privacy",
  "/terms/fr",
  "/privacy/fr",
  "/c",
  "/api/invite-events",
  "/.well-known",
  "/support",
  "/robots.txt",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

/**
 * Paths served while the web app is locked (NEXT_PUBLIC_WEB_APP_ENABLED is
 * not "true"); every other path is redirected to "/" by the proxy. A listed
 * path also covers everything below it. "/" itself is exact and is rewritten
 * to the landing page.
 */
export const LOCKED_ALLOWED_PATHS = [
  "/terms",
  "/privacy",
  "/support",
  "/c",
  "/.well-known",
  "/api/invite-events",
  "/forgot-password",
  "/update-password",
  "/confirm",
  "/auth/callback",
  "/error",
] as const;

/** Root files the proxy matcher does not already exclude, matched exactly. */
export const LOCKED_ALLOWED_FILES = [
  "/robots.txt",
  "/sw.js",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
] as const;

export function isLockedAllowedFile(pathname: string): boolean {
  return (LOCKED_ALLOWED_FILES as readonly string[]).includes(pathname);
}

export function isLockedAllowedPath(pathname: string): boolean {
  if (pathname === "/" || isLockedAllowedFile(pathname)) return true;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/__nextjs")) return true;
  return LOCKED_ALLOWED_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
