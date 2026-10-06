import * as React from "react";
import { useRouter } from "expo-router";
import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import { buildLaneTiles, REEL_LANE_COPY, type ReelTileModel } from "@/lib/highlight/reel-lane";
import type { UseReelLaneResult } from "@/lib/highlight/use-reel-lane";
import { logHighlightEvent } from "@/lib/highlight/highlight-event";
import { ReelCarousel } from "./reel-carousel";
import { laneLoadMore, openReelFromLane, type LanePageSource } from "./open-reel";

/**
 * Opens a tapped reel through the one viewer seam (`openReelFromLane`, the
 * swipe viewer with the lane's `loadMore`), clears its ring at once, and logs
 * the surface's funnel step (spec 13). `position` is the reel's index among
 * the READY tiles (the pager index), not its tile position: building, ghost,
 * CTA and See all tiles are not counted.
 */
function useOpenFromLane(markSeenLocally: (id: string) => void, source: LanePageSource) {
  const router = useRouter();
  const latest = React.useRef(source);
  latest.current = source;
  return React.useCallback(
    (items: ReelItem[], startIndex: number, lane: ReelLaneKey) => {
      const item = items[startIndex];
      if (!item) return;
      if (lane === "home") {
        logHighlightEvent(item.highlightId, "home_card_tapped", {
          source: "home",
          surface: "carousel",
          position: startIndex,
          unseen: item.unseen,
          reel_source: item.source,
        });
      } else {
        logHighlightEvent(item.highlightId, "matches_reel_tapped", { source: "matches", position: startIndex, unseen: item.unseen });
      }
      const loadMore = laneLoadMore(items, latest.current);
      if (openReelFromLane(router, { items, startIndex, lane, loadMore })) markSeenLocally(item.highlightId);
    },
    [router, markSeenLocally],
  );
}

/**
 * Home's Highlights carousel (C-HM3, spec 7). The host owns the lane
 * (`useHomeHighlights`) so its pull to refresh can refetch it; this draws
 * the tiles and handles taps. Renders nothing when `tiles` is empty (clips
 * off, or a failed read: Home stays quiet).
 */
export function HomeHighlightsCarousel({
  tiles,
  pageSource,
  markSeenLocally,
  onCtaPress,
}: {
  tiles: ReelTileModel[];
  /** The lane's loaded items and cursor, so the swipe viewer can page past the tiles. */
  pageSource: LanePageSource;
  markSeenLocally: (highlightId: string) => void;
  onCtaPress?: (tile: Extract<ReelTileModel, { kind: "cta" }>) => void;
}) {
  const open = useOpenFromLane(markSeenLocally, pageSource);
  return <ReelCarousel title={REEL_LANE_COPY.title.home} laneKey="home" tiles={tiles} onOpenReel={open} onCtaPress={onCtaPress} />;
}

/**
 * The Matches tab's "Your highlights" carousel (C-M2, spec 6.1), for the
 * screen's `carousel` slot. The screen owns the lane
 * (`useReelLane(athleteId, "matches", { fallbackInFlight })`) so its pull to
 * refresh re-reads it with the library (AC 2.3). Pages further reels as the
 * row nears its end. Renders nothing with clips off or a failed read with
 * nothing cached (the screen's own error panel covers the feed).
 */
export function MatchesReelCarousel({
  lane,
  viewerId = null,
  matchCount,
  testID,
}: {
  lane: UseReelLaneResult;
  /** The signed-in athlete, for the swipe viewer's further pages. */
  viewerId?: string | null;
  /** Completed match count when known (0 picks the first-highlight ghosts); null or omitted reads as "has matches". */
  matchCount?: number | null;
  testID?: string;
}) {
  const { items, inFlight, clipsEnabled, loading, error, hasMore, loadMore, loadingMore, markSeenLocally, cursor } = lane;
  const tiles = React.useMemo(
    () =>
      buildLaneTiles({
        laneKey: "matches",
        items,
        building: inFlight,
        clipsEnabled,
        loading,
        failed: error !== null,
        hasMore,
        matchCount: matchCount ?? null,
      }),
    [items, inFlight, clipsEnabled, loading, error, hasMore, matchCount],
  );
  const open = useOpenFromLane(markSeenLocally, { loaded: items, cursor, viewerId });
  // A failed page may be retried by scrolling on (`loadMore` guards a running load itself).
  const onEndReached = hasMore && !loadingMore ? loadMore : undefined;
  return (
    <ReelCarousel
      title={REEL_LANE_COPY.title.matches}
      laneKey="matches"
      tiles={tiles}
      onOpenReel={open}
      onEndReached={onEndReached}
      testID={testID}
    />
  );
}
