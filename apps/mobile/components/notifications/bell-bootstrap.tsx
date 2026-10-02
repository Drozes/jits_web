/**
 * The one owner of the notification bell (jits-dq85.7): the only
 * pending-challenges realtime channel, the only notification feed and the
 * only panel, for the whole signed-in app.
 *
 * Mounted once in `app/(app)/_layout.tsx`, beside the Stack (like
 * `ArenaBootstrap`). Renders for any non-PENDING athlete (every athlete who
 * can reach a tab header, so no bell is ever dead) and is keyed by
 * athlete id, so a sign-out or an athlete switch tears the channel down and
 * the next athlete starts clean. Header bells read `bell-store.ts`.
 *
 * Badge (jits-dq85.8): FRESH incoming challenges (created within
 * `ARENA_CHALLENGE_FRESH_MS`) plus unseen highlight reels. Older pending
 * challenges are listed under "Missed" and never counted; expired ones are
 * dropped. The lists are re-derived at the moment the next fresh challenge
 * goes stale (or a listed one expires), so the badge drops without a
 * per-second tick.
 *
 * Re-sync: realtime does not replay events missed while the socket was down
 * (the app backgrounded, which also takes the athlete offline), so the
 * pending list is re-read in full on a return to the foreground, when the
 * panel opens and on Home's pull-to-refresh.
 */
import * as React from "react";
import { usePathname, useRouter } from "expo-router";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import {
  usePendingChallenges,
  type PendingChallenge,
} from "@jits/shared/hooks/use-pending-challenges";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { useNotificationHistory } from "@/hooks/use-notification-history";
import {
  useBellRefreshCount,
  useForegroundEffect,
  useOnCountChange,
} from "@/lib/highlight/highlight-store";
import {
  bellItemRoute,
  buildBellLists,
  nextFreshnessChangeAt,
  splitPendingByFreshness,
  type BellItem,
} from "@/lib/notifications/notification-items";
import {
  closeBell,
  publishBellBadge,
  registerBellHost,
  useBellOpen,
} from "@/lib/notifications/bell-store";
import { openHref } from "@/lib/deep-links/tab-root-route";
import {
  isIncomingChallengeDismissed,
  subscribeIncomingChallengeEnded,
} from "@/lib/arena/arena-store";
import { NotificationPanel } from "./notification-panel";

export function BellBootstrap() {
  const { athlete } = useAuth();
  // Any signed-in athlete who can reach a tab header (active or inactive; a
  // PENDING one is sent to profile setup) gets the host, so every header
  // bell has a panel to open.
  if (!athlete || athlete.status === ATHLETE_STATUS.PENDING) return null;
  return <BellHost key={athlete.id} athleteId={athlete.id} />;
}

/** Longest timer we arm; setTimeout overflows past 2^31-1 ms. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * The clock the bell's lists are derived at: re-read whenever `pending`
 * changes and again at the next boundary (`nextFreshnessChangeAt`), not on a
 * tick. Every timer fire stores a NEW snapshot object, so even a fire that
 * lands a little before the boundary (timer coalescing after a resume)
 * re-renders and arms another timer for the same boundary.
 */
function useBoundaryNow(pending: PendingChallenge[]): number {
  const [clock, setClock] = React.useState(() => ({ now: Date.now() }));
  // A layout effect, so a new list is re-derived at the current time before
  // paint (the previous clock may be hours old when nothing was listed).
  React.useLayoutEffect(() => {
    setClock({ now: Date.now() });
  }, [pending]);

  const at = nextFreshnessChangeAt(pending, clock.now);
  React.useEffect(() => {
    if (at === null) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, at - Date.now()));
    const t = setTimeout(() => setClock({ now: Date.now() }), delay);
    return () => clearTimeout(t);
  }, [at, clock]);
  return clock.now;
}

function BellHost({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const open = useBellOpen();
  const {
    challenges: pending,
    refetch: refetchPending,
    loaded: pendingLoaded,
  } = usePendingChallenges(
    supabase,
    athleteId,
  );
  const { history, highlights, unseenHighlights, refresh } = useNotificationHistory(athleteId);

  const now = useBoundaryNow(pending);
  // Challenges the Arena dismissed on this device without answering (decision
  // Q3: a manual go-offline drops one tucked with Later, and sends nothing,
  // so it is still pending server-side). No Arena surface will raise them
  // again, so they are listed as Missed and never counted: a red bell or tab
  // count, or a deep link, would point at nothing. Re-derived whenever the
  // Arena reports an incoming challenge ended, which a dismissal does.
  const [dismissedVersion, setDismissedVersion] = React.useState(0);
  React.useEffect(
    () => subscribeIncomingChallengeEnded(() => setDismissedVersion((v) => v + 1)),
    [],
  );
  const freshCount = React.useMemo(
    () => splitPendingByFreshness(pending, now, isIncomingChallengeDismissed).fresh.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissedVersion re-reads the dismissed set
    [pending, now, dismissedVersion],
  );
  const { feed, missed } = React.useMemo(
    () => buildBellLists(history, highlights, pending, now, isIncomingChallengeDismissed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissedVersion re-reads the dismissed set
    [history, highlights, pending, now, dismissedVersion],
  );

  React.useEffect(() => {
    publishBellBadge(freshCount + unseenHighlights, freshCount, pendingLoaded);
  }, [freshCount, unseenHighlights, pendingLoaded]);

  // Re-read the pending list where realtime may have missed events. The
  // history hook re-reads its whole feed on foreground, panel open and Home's
  // pull-to-refresh (only the reels on a header focus).
  const refetchRef = React.useRef(refetchPending);
  refetchRef.current = refetchPending;
  const resyncPending = React.useCallback(() => void refetchRef.current(), []);
  useForegroundEffect(resyncPending);
  useOnCountChange(useBellRefreshCount(), resyncPending);

  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;
  React.useEffect(
    () =>
      registerBellHost(() => {
        void refreshRef.current();
        resyncPending();
      }),
    [resyncPending],
  );

  // The panel lives above the Stack, not in a screen, so it does not go
  // away with a screen. Anything that navigates without a row tap (a push
  // notification tap, an incoming-challenge sheet entering a match) must not
  // leave it open over the new screen.
  const pathname = usePathname();
  const lastPathname = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (open) closeBell();
  }, [pathname, open]);

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (!next) closeBell();
  }, []);

  // Close the panel first, then open the row's screen. Through `openHref`:
  // a tab root (a challenge row's /arena) is navigated to in place, never
  // pushed, so a row tapped from the Arena's own header does not stack a
  // second Arena; a detail screen (reel, match) is pushed as before.
  const handleItemPress = React.useCallback(
    (item: BellItem) => {
      const route = bellItemRoute(item);
      if (!route) return;
      closeBell();
      openHref(router, route);
    },
    [router],
  );

  return (
    <NotificationPanel
      open={open}
      onOpenChange={handleOpenChange}
      items={feed}
      missed={missed}
      onItemPress={handleItemPress}
    />
  );
}
