import * as React from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ViewToken } from "react-native";
import type { ReelItem } from "@/lib/highlight/reel-types";
import { laneSource, type ReelViewerSession } from "@/lib/highlight/reel-viewer-session";
import {
  mergeReelItems,
  pageIndexFromOffset,
  prefetchTargets,
  REEL_VISIBLE_PERCENT,
  shouldLoadMore,
} from "@/lib/highlight/reel-pager-math";
import { prefetchReel } from "@/lib/highlight/reel-prefetch";
import { useReelPlayerPool } from "@/lib/highlight/use-reel-player-pool";
import { useSwipeHint } from "@/lib/highlight/use-swipe-hint";
import { useSwipeTelemetry } from "./use-swipe-telemetry";

export const REEL_VIEWABILITY = { itemVisiblePercentThreshold: REEL_VISIBLE_PERCENT };
/** A drag past the last page by more than this shows C-V2 (spec 8.3). */
export const CAUGHT_UP_OVERSCROLL_PT = 48;
export const CAUGHT_UP_MS = 2_000;

/**
 * The swipe pager's state (spec 8.3): the lane (grown by `loadMore` near the
 * end, no duplicates), the visible page (momentum end, with 80% visibility
 * as the backup), the player pool following it, prefetch of `i + 1`, `i + 2`
 * and `i - 1` (signed and preloaded into their slots), `viewer_swiped` per
 * landing, the once-per-session `viewer_opened` guard, the swipe hint, the
 * end-of-list caption, and the sheet state that suspends paging.
 */
export function useReelPager(session: ReelViewerSession, pageHeight: number) {
  const source = laneSource(session.lane);
  const pool = useReelPlayerPool();
  const [items, setItems] = React.useState<ReelItem[]>(session.items);
  const [active, setActive] = React.useState(session.startIndex);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [caughtUp, setCaughtUp] = React.useState(false);
  const hint = useSwipeHint(items.length);
  const swipe = useSwipeTelemetry(pool, source);
  const s = React.useRef({ active: session.startIndex, items, swiped: new Set<number>(), opened: new Set<string>(), exhausted: !session.loadMore, height: pageHeight }).current;
  s.items = items;
  s.height = pageHeight;

  React.useEffect(() => pool.setActive(active, items.length), [pool, active, items.length]);

  const land = (index: number) => {
    const item = s.items[index];
    if (index === s.active || !item) return;
    const from = s.active;
    s.active = index;
    s.swiped.add(index);
    swipe.landed({ highlightId: item.highlightId, index, direction: index > from ? "next" : "previous" });
    hint.dismiss();
    setActive(index);
  };
  const handlers = React.useRef({ land }).current;
  handlers.land = land;

  // FlatList needs stable handlers; they only pick the active index.
  const [stable] = React.useState(() => ({
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const hit = viewableItems.find((v) => v.isViewable && typeof v.index === "number");
      if (hit && typeof hit.index === "number") handlers.land(hit.index);
    },
    onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      handlers.land(pageIndexFromOffset(e.nativeEvent.contentOffset.y, s.height, s.items.length));
    },
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const lastOffset = (s.items.length - 1) * s.height;
      if (s.exhausted && e.nativeEvent.contentOffset.y - lastOffset > CAUGHT_UP_OVERSCROLL_PT) setCaughtUp(true);
    },
  }));

  React.useEffect(() => {
    if (!caughtUp) return;
    const t = setTimeout(() => setCaughtUp(false), CAUGHT_UP_MS);
    return () => clearTimeout(t);
  }, [caughtUp]);

  React.useEffect(() => {
    const targets = prefetchTargets(active, items.length);
    for (const i of targets) {
      const item = items[i];
      void prefetchReel(item).then((src) => {
        // Dropped when the athlete has moved on.
        if (src && prefetchTargets(s.active, s.items.length).includes(i)) pool.offer(i, `${item.highlightId}:${src.version}`, src);
      });
    }
  }, [active, items, pool, s]);

  React.useEffect(() => {
    if (!session.loadMore || loadingMore || s.exhausted || !shouldLoadMore(active, items.length)) return;
    setLoadingMore(true);
    session
      .loadMore()
      .then((more) => {
        const merged = mergeReelItems(s.items, more);
        if (merged.length === s.items.length) s.exhausted = true;
        else {
          session.items = merged;
          setItems(merged);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [active, items.length, loadingMore, session, s]);

  const firstOpen = React.useCallback((id: string) => {
    if (s.opened.has(id)) return false;
    s.opened.add(id);
    return true;
  }, [s]);
  const wasSwiped = React.useCallback((index: number) => s.swiped.has(index), [s]);

  return { pool, items, active, source, modalOpen, onModalChange: setModalOpen, firstOpen, wasSwiped, hintVisible: hint.visible, caughtUp, loadingMore, ...stable };
}
