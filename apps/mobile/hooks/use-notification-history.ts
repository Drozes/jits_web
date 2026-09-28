import * as React from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { getNotificationHistory } from "@jits/shared/api/queries";
import type { NotificationItem } from "@jits/shared/types/notification";
import {
  mergeBellItems,
  toHighlightNotificationItems,
  type BellItem,
  type HighlightNotificationItem,
} from "@/lib/notifications/notification-items";
import {
  readMyHighlights,
  useBellRefreshCount,
  useForegroundEffect,
  useHighlightsChangedCount,
  useOnCountChange,
} from "@/lib/highlight/highlight-store";

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
 * and on a real return to the foreground, so a reel watched elsewhere stops
 * counting as unread; those reads go through the shared, deduped
 * `readMyHighlights` (four bells + Home cost one RPC). A reel marked seen or
 * dismissed anywhere re-reads it at once (forced), and Home's pull-to-refresh
 * re-reads the whole feed. A failed highlight read keeps the previous rows.
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

  // Only the newest highlight read may write (a slow focus read must not
  // overwrite a forced one that landed after a seen mark).
  const highlightSeq = React.useRef(0);
  const fetchHighlights = React.useCallback(async (force = false) => {
    if (!athleteId) return;
    const id = ++highlightSeq.current;
    try {
      const res = await readMyHighlights({ limit: HIGHLIGHT_LIMIT }, { force });
      if (!alive.current || id !== highlightSeq.current || !res.ok) return;
      setHighlights(res.data.clipsEnabled ? toHighlightNotificationItems(res.data.items) : []);
    } catch {
      // Best effort: the bell never fails because of highlights.
    }
  }, [athleteId]);

  /** The full feed; `force` skips the shared highlight read's dedupe (panel open, pull). */
  const fetch = React.useCallback(async (force = false) => {
    if (!athleteId) return;
    setIsLoading(true);
    try {
      const [result] = await Promise.all([
        getNotificationHistory(supabase, athleteId, 30),
        fetchHighlights(force),
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

  useForegroundEffect(() => void fetchHighlights());
  useOnCountChange(useHighlightsChangedCount(), () => void fetchHighlights(true));
  useOnCountChange(useBellRefreshCount(), () => void fetch(true));

  const items: BellItem[] = React.useMemo(() => mergeBellItems(base, highlights), [base, highlights]);
  const unseenHighlights = React.useMemo(
    () => highlights.filter((h) => h.unread).length,
    [highlights],
  );

  const refresh = React.useCallback(() => fetch(true), [fetch]);
  return { items, unseenHighlights, isLoading, refresh };
}
