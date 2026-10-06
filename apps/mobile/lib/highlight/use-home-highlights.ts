import * as React from "react";
import type { ReelItem } from "./reel-types";
import { buildLaneTiles, type ReelTileModel } from "./reel-lane";
import { useReelLane } from "./use-reel-lane";

export interface UseHomeHighlightsResult {
  /** The Highlights carousel's tiles; empty means the carousel is hidden (clips off, or a failed read with nothing cached). */
  tiles: ReelTileModel[];
  /** Ready items in lane order (phase 1: own reels only). */
  items: ReelItem[];
  loadMore: () => void;
  /** Re-read every source (`force` skips the shared read throttle; pull to refresh passes true). */
  refetch: (force?: boolean) => void;
  /** Clears a reel's ring at once when the viewer opens it. */
  markSeenLocally: (highlightId: string) => void;
}

/**
 * Home's ONE Highlights carousel (specs/matches-tab sections 7.2 and 7.3,
 * owner round 2 R2-1). Phase 1 has a single source, the athlete's own reels
 * (`useReelLane(athleteId, "home")`). Friend, nearby and Elo highlights
 * (jr_be-tjx, jr_be-880, jr_be-o7c) join HERE as further source hooks merged
 * into the same `items` (own building, own unseen, then every other ready
 * item newest first, de-duplicated with own winning), never as a second
 * carousel.
 *
 * `matchCount` is the athlete's completed match count: a number once known
 * (0 picks the first-highlight CTA and ghost), `null` when it cannot be known
 * (the summary failed: the "has matches" copy), `undefined` while it is still
 * loading. With clips on and nothing to show yet, an unknown count keeps the
 * skeletons up rather than flashing the wrong empty-state copy.
 *
 * A failed read never shows an error on Home: with nothing cached the
 * carousel hides quietly (spec 10.4).
 */
export function useHomeHighlights(athleteId: string | undefined, matchCount: number | null | undefined): UseHomeHighlightsResult {
  const own = useReelLane(athleteId, "home");
  const { items, inFlight, clipsEnabled, loading, error, hasMore } = own;

  const tiles = React.useMemo(() => {
    const nothingYet = items.length === 0 && inFlight.length === 0;
    return buildLaneTiles({
      laneKey: "home",
      items,
      building: inFlight,
      clipsEnabled,
      loading: loading || (clipsEnabled && nothingYet && matchCount === undefined && error === null),
      failed: error !== null,
      hasMore,
      matchCount: matchCount ?? null,
    });
  }, [items, inFlight, clipsEnabled, loading, error, hasMore, matchCount]);

  return { tiles, items, loadMore: own.loadMore, refetch: own.refetch, markSeenLocally: own.markSeenLocally };
}
