import * as React from "react";
import { usePullToRefresh } from "@/lib/cache/use-refocus-refetch";
import { toast } from "@/components/ui/toast";

/** C-E2: a pull to refresh failed while the list is still on screen. */
export const REFRESH_FAILED_TOAST = "Couldn't refresh your matches";

/**
 * Pull to refresh for the Matches tab. The spinner follows only the athlete's
 * own pull (`usePullToRefresh`), never the background revalidates on refocus,
 * match exit or an upload settling. A failed pull with a page still on screen
 * toasts C-E2 once; a failed background revalidate stays quiet, and a cold
 * load failure shows the error panel instead (`refreshError` is null then).
 *
 * A pull that starts while a background revalidate is already in flight
 * (busy at the moment of the pull) is seeded as having seen busy: the read
 * it joins, or the one queued behind it, settles on the next busy-to-idle
 * edge, and a failure there still toasts. Without the seed the pull never
 * saw a rising edge and stayed pending forever.
 */
export function useMatchesRefresh(
  refresh: () => void,
  busy: boolean,
  refreshError: Error | null,
): { refreshing: boolean; onRefresh: () => void } {
  const pull = usePullToRefresh(refresh, busy);
  const pending = React.useRef({ active: false, sawBusy: false });
  // The latest `busy`, read at pull time (state in the closure can be stale).
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const startPull = pull.onRefresh;

  const onRefresh = React.useCallback(() => {
    pending.current = { active: true, sawBusy: busyRef.current };
    startPull();
  }, [startPull]);

  React.useEffect(() => {
    const p = pending.current;
    if (!p.active) return;
    if (busy) {
      p.sawBusy = true;
      return;
    }
    if (!p.sawBusy) return;
    pending.current = { active: false, sawBusy: false };
    if (refreshError) toast.error(REFRESH_FAILED_TOAST);
  }, [busy, refreshError]);

  // The spinner gave up (its max time) without ever seeing a read: drop the
  // pull, so a later background revalidate can never toast on its behalf.
  React.useEffect(() => {
    if (pull.refreshing) return;
    const p = pending.current;
    if (p.active && !p.sawBusy) pending.current = { active: false, sawBusy: false };
  }, [pull.refreshing]);

  return { refreshing: pull.refreshing, onRefresh };
}
