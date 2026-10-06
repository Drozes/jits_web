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
 */
export function useMatchesRefresh(
  refresh: () => void,
  busy: boolean,
  refreshError: Error | null,
): { refreshing: boolean; onRefresh: () => void } {
  const pull = usePullToRefresh(refresh, busy);
  const pending = React.useRef({ active: false, sawBusy: false });
  const startPull = pull.onRefresh;

  const onRefresh = React.useCallback(() => {
    pending.current = { active: true, sawBusy: false };
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

  return { refreshing: pull.refreshing, onRefresh };
}
