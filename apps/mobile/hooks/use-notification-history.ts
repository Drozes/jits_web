import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getNotificationHistoryResult } from "@jits/shared/api/queries";
import type { NotificationItem } from "@jits/shared/types/notification";
import {
  toHighlightNotificationItems,
  type HighlightNotificationItem,
} from "@/lib/notifications/notification-items";
import {
  readMyHighlights,
  useBellRefreshCount,
  useForegroundEffect,
  useHighlightsChangedCount,
  useOnCountChange,
} from "@/lib/highlight/highlight-store";
import { useBellFocusCount } from "@/lib/notifications/bell-store";

/** Bell feed size for ready reels (jr_be spec 015 section 16.6.4). */
const HIGHLIGHT_LIMIT = 10;

/**
 * The bell feed's two sources for the given athlete: `history` (challenges
 * and match results from `getNotificationHistoryResult`) and `highlights` (ready
 * reels from `getMyHighlights`: only reels the athlete was notified about;
 * none while `highlight_clips_enabled` is off). The host merges them with
 * the pending list via `buildBellLists`.
 *
 * Run once, by the app-wide `BellBootstrap` (jits-dq85.7). The full feed is
 * read on mount and on `refresh()` (the panel opening). The highlight half,
 * which also drives the badge, is re-read cheaply when a header with a bell
 * gains focus (`notifyBellFocused`) and on a real return to the foreground,
 * so a reel watched elsewhere stops counting as unread; those reads go
 * through the shared, deduped `readMyHighlights` (the bell + Home cost one
 * RPC). A focus while a full read is still in flight is skipped: that read
 * already covers it (this is what keeps the first tab root's focus, which
 * lands right after mount, from repeating the mount read). A reel marked
 * seen or dismissed anywhere re-reads it at once (forced), and Home's
 * pull-to-refresh re-reads the whole feed. A failed highlight read keeps the
 * previous rows. A failed history read (a query error, or a rejection) keeps
 * the previous feed and never cancels an older read that later succeeds; a
 * slow older read never overwrites a newer one that already applied.
 */
export function useNotificationHistory(athleteId: string | undefined) {
  const [base, setBase] = React.useState<NotificationItem[]>([]);
  const [highlights, setHighlights] = React.useState<HighlightNotificationItem[]>([]);
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

  // Full reads not yet resolved; a header focus during one is redundant.
  const fullReadsInFlight = React.useRef(0);
  // Sequence of the newest full read started, and of the newest one whose
  // history applied. A read applies only if it succeeded and is newer than
  // the last applied one: a slow mount read never overwrites a forced one
  // from a panel open or pull-to-refresh, and a failed newer read never
  // throws away an older good one (mirrors `usePendingChallenges`).
  const baseSeq = React.useRef(0);
  const lastAppliedBaseSeq = React.useRef(0);

  /** The full feed; `force` skips the shared highlight read's dedupe (panel open, pull). */
  const fetch = React.useCallback(async (force = false) => {
    if (!athleteId) return;
    const id = ++baseSeq.current;
    fullReadsInFlight.current++;
    try {
      const [result] = await Promise.all([
        getNotificationHistoryResult(supabase, athleteId, 30),
        fetchHighlights(force),
      ]);
      if (!alive.current || !result.ok || id <= lastAppliedBaseSeq.current) return;
      lastAppliedBaseSeq.current = id;
      setBase(result.items);
    } catch {
      // Best effort: keep the previous feed; the next open or pull re-reads it.
    } finally {
      fullReadsInFlight.current--;
    }
  }, [athleteId, fetchHighlights]);

  React.useEffect(() => {
    void fetch();
  }, [fetch]);

  // A header focus re-reads the reels, unless a full read (the mount read,
  // a panel open) is still in flight and will already bring them.
  useOnCountChange(useBellFocusCount(), () => {
    if (fullReadsInFlight.current === 0) void fetchHighlights();
  });
  // A return to the foreground re-reads the whole feed (not forced): a match
  // result or an answered challenge may have landed while the app was away.
  useForegroundEffect(() => void fetch());
  useOnCountChange(useHighlightsChangedCount(), () => void fetchHighlights(true));
  useOnCountChange(useBellRefreshCount(), () => void fetch(true));

  const unseenHighlights = React.useMemo(
    () => highlights.filter((h) => h.unread).length,
    [highlights],
  );

  const refresh = React.useCallback(() => fetch(true), [fetch]);
  return { history: base, highlights, unseenHighlights, refresh };
}
