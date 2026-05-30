import { Home, MapPin, Trophy, User, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for the authed-shell navigation, shared by the
 * mobile-style <BottomNavBar/> (below lg) and the desktop <SidebarRail/> (>= lg)
 * so the two navs can never drift.
 */
export interface NavTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_TABS: readonly NavTab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/gyms", label: "Gyms", icon: MapPin },
  { href: "/leaderboard", label: "Rankings", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
] as const;

// Immersive routes (match flow, lobby, join wizard, setup) hide BOTH navs.
// Kept verbatim from the original BottomNavBar list — do not expand scope.
// Note: /profile/setup is a dead pattern (no such route — web activation is
// /eua); kept for parity, do not chase it.
const HIDE_PATTERNS = [
  /^\/session\/[^/]+\/match\//,
  /^\/session\/[^/]+\/lobby/,
  /^\/session\/[^/]+\/join/,
  /^\/match\/[^/]+\/live/,
  /^\/match\/[^/]+\/results/,
  /^\/profile\/setup/,
];

/** True on immersive routes where the persistent shell chrome is hidden. */
export function isImmersiveRoute(pathname: string): boolean {
  return HIDE_PATTERNS.some((p) => p.test(pathname));
}

/** Active-tab logic: exact match for Home, prefix match for the rest. */
export function isActiveTab(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
