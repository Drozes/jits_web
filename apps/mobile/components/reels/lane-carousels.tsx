import * as React from "react";
import { useRouter } from "expo-router";
import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import { buildLaneTiles, REEL_LANE_COPY, type ReelTileModel } from "@/lib/highlight/reel-lane";
import type { UseReelLaneResult } from "@/lib/highlight/use-reel-lane";
import { logHighlightEvent } from "@/lib/highlight/highlight-event";
import { ReelCarousel } from "./reel-carousel";
import { openReelFromLane } from "./open-reel";

/**
 * Opens a tapped reel through the one viewer seam (`openReelFromLane`),
 * clears its ring at once, and logs the surface's funnel step (spec 13).
 */
function useOpenFromLane(markSeenLocally: (id: string) => void) {
  const router = useRouter();
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
      if (openReelFromLane(router, { items, startIndex, lane })) markSeenLocally(item.highlightId);
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
  markSeenLocally,
  onCtaPress,
}: {
  tiles: ReelTileModel[];
  markSeenLocally: (highlightId: string) => void;
  onCtaPress?: (tile: Extract<ReelTileModel, { kind: "cta" }>) => void;
}) {
  const open = useOpenFromLane(markSeenLocally);
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
  matchCount,
  testID,
}: {
  lane: UseReelLaneResult;
  /** Completed match count when known (0 picks the first-highlight ghosts); null or omitted reads as "has matches". */
  matchCount?: number | null;
  testID?: string;
}) {
  const { items, inFlight, clipsEnabled, loading, error, hasMore, loadMore, loadMoreError, loadingMore, markSeenLocally } = lane;
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
  const open = useOpenFromLane(markSeenLocally);
  const onEndReached = hasMore && !loadingMore && !loadMoreError ? loadMore : undefined;
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
