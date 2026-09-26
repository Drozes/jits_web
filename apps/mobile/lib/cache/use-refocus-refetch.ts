import * as React from "react";
import { useFocusEffect } from "expo-router";

/**
 * Re-run `refetch` every time the screen regains focus, skipping the first
 * focus (mount already fetched). Tabs stay mounted, so without this a match
 * or video that landed while another tab was open would not show until a
 * manual pull-to-refresh.
 */
export function useRefetchOnRefocus(refetch: () => void): void {
  const firstFocus = React.useRef(true);
  const refetchRef = React.useRef(refetch);
  refetchRef.current = refetch;

  useFocusEffect(
    React.useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
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
