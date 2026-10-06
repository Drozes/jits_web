import * as React from "react";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import type { CardPhase } from "@/lib/film-room/card-status";
import { LibraryPoster } from "@/components/film-room/library-poster";
import { FilmRoomSkeleton } from "@/components/film-room/film-room-states";
import type { StillAthlete } from "@/components/film-room/opening-still";

/** What the Matches tab hands every match it renders. */
export interface MatchRenderContext {
  /** Memoised per screen, so memoised cards skip unrelated re-renders. */
  viewer: StillAthlete;
  viewerId: string | null;
  /** Opened on this device, or the seen set is not read yet (no NEW flash). */
  seen: boolean;
  /** The server's Film status phase for a recent match (`useFilmRoomPhases`). */
  phase: CardPhase | null;
  /** Stable across renders; pushes match detail (the card may push the player itself). */
  onOpen: (matchId: string) => void;
}

/** Renders one match of the feed (a memoised component). The screen keys it by match id. */
export type RenderMatch = (item: MatchLibraryItem, ctx: MatchRenderContext) => React.ReactElement;

/**
 * How the Matches tab draws its list: matches per row, one match, and the
 * cold-load placeholder. The seam for the feed card (jits-a4fw.4): swap the
 * screen's layout for `{ perRow: 1, renderMatch: (item, ctx) => <MatchFeedCard .../>,
 * Skeleton: FeedSkeleton }` and nothing else in the screen changes.
 */
export interface MatchListLayout {
  perRow: 1 | 2;
  renderMatch: RenderMatch;
  Skeleton: React.ComponentType;
}

/**
 * Today's layout, carried from the Film Room: two 3:4 posters per row and
 * the poster grid skeleton. Replaced by the full-width feed card in wave 2.
 */
export const POSTER_GRID_LAYOUT: MatchListLayout = {
  perRow: 2,
  renderMatch: (item, ctx) => (
    <LibraryPoster
      item={item}
      viewer={ctx.viewer}
      seen={ctx.seen}
      onOpen={ctx.onOpen}
      phase={ctx.phase}
    />
  ),
  Skeleton: FilmRoomSkeleton,
};
