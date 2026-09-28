import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { getNotificationHistory } from "@jits/shared/api/queries";
import { getMyHighlights } from "@jits/shared/api/highlight-share";
import type { NotificationItem } from "@jits/shared/types/notification";
import {
  mergeBellItems,
  toHighlightNotificationItems,
  type BellItem,
  type HighlightNotificationItem,
} from "@/lib/notifications/notification-items";

/** Bell feed size for ready reels (jr_be spec 014 section 16.6.4). */
const HIGHLIGHT_LIMIT = 10;

/**
 * The bell feed for the given athlete: challenges and match results from
 * `getNotificationHistory`, plus ready-reel items from `getMyHighlights`
 * (only reels the athlete was notified about; none while
 * `highlight_clips_enabled` is off), newest first.
 *
 * The full feed is read on mount and on `refresh()` (the panel opening). The
 * highlight half, which also drives the badge, is re-read cheaply on focus
 * and on return to the foreground, so a reel watched elsewhere stops counting
 * as unread. A failed highlight read keeps the previous highlight rows.
 */
export function useNotificationHistory(athleteId: string | undefined) {
  const [base, setBase] = React.useState<NotificationItem[]>([]);
  const [highlights, setHighlights] = React.useState<HighlightNotificationItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const fetchHighlights = React.useCallback(async () => {
    if (!athleteId) return;
    try {
      const res = await getMyHighlights(supabase, { limit: HIGHLIGHT_LIMIT });
      if (!alive.current || !res.ok) return;
      setHighlights(res.data.clipsEnabled ? toHighlightNotificationItems(res.data.items) : []);
    } catch {
      // Best effort: the bell never fails because of highlights.
    }
  }, [athleteId]);

  const fetch = React.useCallback(async () => {
    if (!athleteId) return;
    setIsLoading(true);
    try {
      const [result] = await Promise.all([
        getNotificationHistory(supabase, athleteId, 30),
        fetchHighlights(),
      ]);
      if (alive.current) setBase(result);
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }, [athleteId, fetchHighlights]);

  React.useEffect(() => {
    void fetch();
  }, [fetch]);

  const firstFocus = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      // Mount already read everything.
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void fetchHighlights();
    }, [fetchHighlights]),
  );

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void fetchHighlights();
    });
    return () => sub.remove();
  }, [fetchHighlights]);

  const items: BellItem[] = React.useMemo(() => mergeBellItems(base, highlights), [base, highlights]);
  const unseenHighlights = React.useMemo(
    () => highlights.filter((h) => h.unread).length,
    [highlights],
  );

  return { items, unseenHighlights, isLoading, refresh: fetch };
}
