import * as React from "react";
import { useFocusEffect } from "expo-router";

/** Minimum gap between two focus refetches of one screen. */
export const REFOCUS_REFETCH_MIN_MS = 30_000;

/**
 * Re-run `refetch` when the screen regains focus, skipping the first focus
 * (mount already fetched) and at most once per `REFOCUS_REFETCH_MIN_MS`
 * (counted from mount), so quick tab switches and back navigation do not
 * re-run the reads or re-toast an offline error. Tabs stay mounted, so
 * without this a match or video that landed while another tab was open
 * would not show until a manual pull-to-refresh (which stays unthrottled).
 */
export function useRefetchOnRefocus(refetch: () => void): void {
  const firstFocus = React.useRef(true);
  const lastRefetchAt = React.useRef(Date.now());
  const refetchRef = React.useRef(refetch);
  refetchRef.current = refetch;

  useFocusEffect(
    React.useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      const now = Date.now();
      if (now - lastRefetchAt.current < REFOCUS_REFETCH_MIN_MS) return;
      lastRefetchAt.current = now;
      refetchRef.current();
    }, []),
  );
}

/** Upper bound on the pull spinner, in case a refetch never reports busy. */
const PULL_SPINNER_MAX_MS = 10_000;

/**
 * Pull-to-refresh state that spins only for a refresh the user pulled for.
 * Driving `RefreshControl.refreshing` straight from a background revalidate
 * would make iOS scroll the spinner into view on every focus refetch.
 * `busy` is the caller's "a fetch is running" flag; the spinner stops once
 * it has gone true and back to false after the pull.
 */
export function usePullToRefresh(refetch: () => void, busy: boolean) {
  const [pulled, setPulled] = React.useState(false);
  const sawBusy = React.useRef(false);

  React.useEffect(() => {
    if (!pulled) return;
    if (busy) {
      sawBusy.current = true;
    } else if (sawBusy.current) {
      sawBusy.current = false;
      setPulled(false);
    }
  }, [pulled, busy]);

  React.useEffect(() => {
    if (!pulled) return;
    const t = setTimeout(() => setPulled(false), PULL_SPINNER_MAX_MS);
    return () => clearTimeout(t);
  }, [pulled]);

  const onRefresh = React.useCallback(() => {
    sawBusy.current = false;
    setPulled(true);
    refetch();
  }, [refetch]);

  return { refreshing: pulled, onRefresh };
}
