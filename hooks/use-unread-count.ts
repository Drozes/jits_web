"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UnreadCountRow } from "@/lib/api/chat-queries";

const POLL_INTERVAL_MS = 30_000;
const REFRESH_EVENT = "unread-counts-refresh";

/** Dispatch this from anywhere to force an immediate re-poll */
export function refreshUnreadCounts() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/**
 * Polls get_unread_counts every 30s, on window focus, and on refresh events.
 * Returns total unread message count across all conversations.
 */
export function useUnreadCount(): number {
  const [total, setTotal] = useState(0);

  const fetchCounts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_unread_counts");
    const rows = (data as UnreadCountRow[] | null) ?? [];
    setTotal(rows.reduce((sum, r) => sum + r.unread_count, 0));
  }, []);

  useEffect(() => {
    fetchCounts();

    const interval = setInterval(fetchCounts, POLL_INTERVAL_MS);
    window.addEventListener("focus", fetchCounts);
    window.addEventListener(REFRESH_EVENT, fetchCounts);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", fetchCounts);
      window.removeEventListener(REFRESH_EVENT, fetchCounts);
    };
  }, [fetchCounts]);

  return total;
}
