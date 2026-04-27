/**
 * Polls `get_unread_counts` every 30s, on AppState foreground transitions, and
 * via an exposed `refreshUnreadCounts()` function.
 *
 * Mobile mirror of `apps/web/hooks/use-unread-count.ts`. The web version uses
 * `window.addEventListener("focus", ...)`; mobile uses
 * `AppState.addEventListener("change", ...)`. Manual refresh uses a tiny
 * external pub-sub instead of `window.dispatchEvent`.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { UnreadCountRow } from "@jits/shared/api/chat-queries";
import { supabase } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 30_000;

const refreshListeners = new Set<() => void>();

/** Trigger an immediate re-poll across all `useUnreadCount` consumers. */
export function refreshUnreadCounts(): void {
  for (const fn of refreshListeners) fn();
}

export function useUnreadCount(): number {
  const [total, setTotal] = React.useState(0);

  const fetchCounts = React.useCallback(async () => {
    const { data } = await supabase.rpc("get_unread_counts");
    const rows = (data as UnreadCountRow[] | null) ?? [];
    setTotal(rows.reduce((sum, r) => sum + r.unread_count, 0));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const safeFetch = () => {
      if (cancelled) return;
      void fetchCounts();
    };

    safeFetch();

    const interval = setInterval(safeFetch, POLL_INTERVAL_MS);

    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "active") safeFetch();
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);

    refreshListeners.add(safeFetch);

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
      refreshListeners.delete(safeFetch);
    };
  }, [fetchCounts]);

  return total;
}
