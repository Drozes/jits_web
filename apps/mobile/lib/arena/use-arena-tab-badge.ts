/**
 * The Arena tab's badge, read from the app-wide stores (spec section 7,
 * jits-dq85.16). See `arenaTabBadge` for the rules.
 *
 * Reads the incoming count and the live bit from `arena-store.ts`, the
 * fresh incoming count from the bell store, and the result to confirm from
 * `active-match-store.ts`; it owns nothing, so the tab bar can mount it
 * without opening a channel of its own.
 *
 * The red count is the larger of the Arena's own incoming count and the
 * bell's fresh incoming count. The Arena store counts only what it can raise
 * right now (the challenge in hand while offline, lobby-present challengers
 * while live), so on its own an offline athlete with two fresh challenges
 * (for example opened from pushes) would see a red 2 on the bell and nothing
 * on the Arena tab. AC-T1 has no live condition, so the tab follows the bell.
 * Every challenge behind that count shows on the Arena (spec 14, "Arena tab
 * red count"): the prompt or its IncomingStrip, the offer strip, the `+N` on
 * the leading strip, or, for a challenger who is off the mat, the neutral
 * AwayStrip (`useChallengeDeepLink`'s `away`). So a red count here always has
 * something visible behind it, even when nothing can be answered yet.
 * The bell leaves out a challenge this device dismissed without answering
 * (decision Q3, see `splitPendingByFreshness`), so a manual go-offline with a
 * challenge tucked away clears the red count here too.
 */
import { useAuth } from "@/lib/auth/hooks";
import { useMatchToConfirm } from "@/lib/match-flow/active-match-store";
import type { TabBadge } from "@/lib/navigation/tab-badge";
import { useFreshIncomingCount } from "@/lib/notifications/bell-store";
import { useArenaIncomingCount, useIsArenaLive } from "./arena-store";
import { arenaTabBadge } from "./mat-board";

export function useArenaTabBadge(): TabBadge | null {
  const { athlete } = useAuth();
  // Primitive selectors: the tab bar is always mounted, and must not
  // re-render on every Arena store change (isBusy, outgoing, and so on).
  const incomingCount = useArenaIncomingCount();
  const isLive = useIsArenaLive();
  const freshIncoming = useFreshIncomingCount();
  const hasConfirm = useMatchToConfirm(athlete?.id ?? null) !== null;
  return arenaTabBadge({
    incomingCount: Math.max(incomingCount, freshIncoming),
    isLive,
    hasConfirm,
  });
}
