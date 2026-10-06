import * as React from "react";
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from "react-native";
import type { ReelItem } from "@/lib/highlight/reel-types";
import { laneSource, type ReelViewerSession } from "@/lib/highlight/reel-viewer-session";
import {
  isCaughtUpAttempt,
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

/** The pager's fixed FlatList props (spec 8.3): native paging, one page per fling, a 3-page window. */
export const REEL_LIST_PROPS = {
  pagingEnabled: true,
  decelerationRate: "fast",
  snapToAlignment: "start",
  disableIntervalMomentum: true,
  showsVerticalScrollIndicator: false,
  initialNumToRender: 1,
  maxToRenderPerBatch: 2,
  windowSize: 3,
  removeClippedSubviews: Platform.OS === "android",
} as const;

/** Rotation, split view or a status-bar change: keep the visible reel in place (not the first layout). */
export function useKeepPageOnResize(listRef: React.RefObject<{ scrollToOffset: (p: { offset: number; animated: boolean }) => void } | null>, height: number, active: number): void {
  const first = React.useRef(true);
  const activeRef = React.useRef(active);
  activeRef.current = active;
  React.useEffect(() => {
    if (height <= 0) return;
    if (first.current) {
      first.current = false; // initialScrollIndex placed the first layout
      return;
    }
    listRef.current?.scrollToOffset({ offset: activeRef.current * height, animated: false });
  }, [height, listRef]);
}
export const CAUGHT_UP_MS = 2_000;
/** A drag that ends without momentum (rare with paging) lands from its offset after this. */
export const NO_MOMENTUM_FALLBACK_MS = 300;

/**
 * The swipe pager's state (spec 8.3): the lane (grown by `loadMore` near the
 * end, no duplicates, no retry loop after a failure), the visible page
 * (momentum end; viewability only outside a gesture), the player pool
 * following it (the loading page after the last reel plays nothing),
 * prefetch of `i + 1` and `i + 2` (skipped when already loaded or freshly
 * offered), `viewer_swiped` once per landing, the once-per-session
 * `viewer_opened` guard, the swipe hint, C-V2 at the end of a fully loaded
 * lane on both platforms, and the sheet state that suspends paging.
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
  const s = React.useRef({
    active: session.startIndex,
    items,
    loadingMore: false,
    swiped: new Set<number>(),
    opened: new Set<string>(),
    exhausted: !session.loadMore,
    failedAt: null as number | null,
    height: pageHeight,
    gesture: false,
    beginY: 0,
    /** Landed on the loading page; its reel's viewer_swiped is logged once the page delivers it. */
    footerFrom: null as number | null,
    fallback: null as ReturnType<typeof setTimeout> | null,
  }).current;
  s.items = items;
  s.height = pageHeight;
  s.loadingMore = loadingMore;

  React.useEffect(() => pool.setActive(active, items.length), [pool, active, items.length]);

  const land = (index: number) => {
    if (index === s.active) return;
    const from = s.active;
    s.active = index;
    s.swiped.add(index);
    hint.dismiss();
    const item = s.items[index];
    s.footerFrom = item ? null : from;
    // The loading page after the last reel: nothing plays, nothing to log yet.
    if (item) swipe.landed({ highlightId: item.highlightId, index, direction: index > from ? "next" : "previous" });
    setActive(index);
  };
  const handlers = React.useRef({ land }).current;
  handlers.land = land;

  // FlatList needs stable handlers; they only pick the active index.
  const [stable] = React.useState(() => {
    const landAt = (y: number) => handlers.land(pageIndexFromOffset(y, s.height, s.items.length, s.loadingMore));
    const clearFallback = () => {
      if (s.fallback) clearTimeout(s.fallback);
      s.fallback = null;
    };
    return {
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (s.gesture) return; // momentum end decides during a swipe
        const hit = viewableItems.find((v) => v.isViewable && typeof v.index === "number");
        if (hit && typeof hit.index === "number") handlers.land(hit.index);
      },
      onScrollBeginDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        clearFallback();
        s.gesture = true;
        s.beginY = e.nativeEvent.contentOffset.y;
      },
      onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        if (s.exhausted) {
          const end = { platform: Platform.OS, active: s.active, lastIndex: s.items.length - 1, pageHeight: s.height };
          if (isCaughtUpAttempt({ ...end, beginOffsetY: s.beginY, endOffsetY: y })) setCaughtUp(true);
        }
        clearFallback();
        s.fallback = setTimeout(() => {
          s.gesture = false;
          landAt(y);
        }, NO_MOMENTUM_FALLBACK_MS);
      },
      onMomentumScrollBegin: clearFallback,
      onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        clearFallback();
        s.gesture = false;
        landAt(e.nativeEvent.contentOffset.y);
      },
    };
  });
  React.useEffect(() => () => {
    if (s.fallback) clearTimeout(s.fallback);
  }, [s]);

  // The athlete waited on the loading page and it delivered: that landing is a reel now.
  React.useEffect(() => {
    const item = s.footerFrom === null ? undefined : s.items[s.active];
    if (!item || s.footerFrom === null) return;
    swipe.landed({ highlightId: item.highlightId, index: s.active, direction: "next" });
    s.footerFrom = null;
  }, [items, s, swipe]);

  React.useEffect(() => {
    if (!caughtUp) return;
    const t = setTimeout(() => setCaughtUp(false), CAUGHT_UP_MS);
    return () => clearTimeout(t);
  }, [caughtUp]);

  // Re-runs only when the target reels change (not when the lane merely grows).
  const targets = prefetchTargets(active, items.length);
  const targetKey = targets.map((i) => items[i].highlightId).join(",");
  React.useEffect(() => {
    for (const i of prefetchTargets(s.active, s.items.length)) {
      if (pool.isLoaded(i) || pool.hasFreshOffer(i)) continue;
      const item = s.items[i];
      void prefetchReel(item).then((hit) => {
        // Dropped when the athlete has moved on.
        if (hit && s.items[i] === item && prefetchTargets(s.active, s.items.length).includes(i)) {
          pool.offer(i, `${item.highlightId}:${hit.source.version}`, hit.source, hit.signedAt);
        }
      });
    }
  }, [targetKey, pool, s]);

  React.useEffect(() => {
    // A failed read is not retried until the athlete lands somewhere else.
    if (!session.loadMore || loadingMore || s.exhausted || s.failedAt === active || !shouldLoadMore(active, items.length)) return;
    setLoadingMore(true);
    session
      .loadMore()
      .then((more) => {
        s.failedAt = null;
        const merged = mergeReelItems(s.items, more);
        if (merged.length === s.items.length) s.exhausted = true;
        else {
          session.items = merged;
          setItems(merged);
        }
      })
      .catch(() => {
        s.failedAt = s.active;
      })
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
