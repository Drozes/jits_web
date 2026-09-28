/**
 * Paths a signed-out visitor may load; every other path is redirected to
 * /login by the proxy (lib/supabase/proxy.ts). A listed path also covers
 * everything below it.
 *
 * NOTE: /design is intentionally NOT public: the design section (incl. the
 * internal /design/board Kanban) is gated behind login.
 * /terms and /privacy are public for store reviewers and Meta's Live-mode
 * check (jits-s6mi.7).
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
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
