"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LivePill } from "@/components/ui/elo-system";
import { useIsArenaLive } from "@/lib/arena/arena-store";
import { isImmersiveRoute } from "./nav-config";

/**
 * Header LIVE pill: while the athlete is live in the Arena, every non-Arena
 * page shows it so they know they can be challenged, and it taps through to
 * the Arena. Renders nothing when offline (and outside the signed-in app,
 * where the store reads "not live"). Parity with mobile's live-header-signal.
 */
export function LiveHeaderSignal() {
  const isLive = useIsArenaLive();
  if (!isLive) return null;
  return <LiveHeaderLink />;
}

// Split out so the pathname is only read while live: offline headers (and
// SSR, which always reads "not live") never touch usePathname.
function LiveHeaderLink() {
  const pathname = usePathname();
  // Exact match: /arena/swipe is not the Arena page and keeps the pill.
  if (pathname === "/arena" || isImmersiveRoute(pathname)) return null;

  return (
    <Link
      href="/arena"
      aria-label="You are live in the Arena. Open Arena"
      className="inline-flex h-8 items-center px-1 transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ borderRadius: "var(--radius-xs)", textDecoration: "none" }}
    >
      <LivePill />
    </Link>
  );
}
