import * as React from "react";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import type { CardPhase } from "@/lib/film-room/card-status";
import type { StillAthlete } from "@/components/film-room/opening-still";
import { MatchFeedCard } from "./match-feed-card";
import { MatchFeedSkeleton } from "./match-feed-skeleton";

/** What the Matches tab hands every match it renders. */
export interface MatchRenderContext {
  /** Memoised per screen, so memoised cards skip unrelated re-renders. */
  viewer: StillAthlete;
  viewerId: string | null;
  /** Opened on this device, or the seen set is not read yet (no NEW flash). */
  seen: boolean;
  /** The server's Film status phase for a recent match (`useFilmRoomPhases`). */
  phase: CardPhase | null;
  /** FIRST MATCH / FIRST WIN for this match (a stable array). */
  tags: readonly string[];
  /** This match's card teaches the recording helper (C-L6). */
  noFilmHelper: boolean;
  /** Stable across renders; opens match detail and marks the match seen. */
  onOpen: (matchId: string) => void;
}

/** Renders one match of the feed (a memoised component). The screen keys it by match id. */
export type RenderMatch = (item: MatchLibraryItem, ctx: MatchRenderContext) => React.ReactElement;

/**
 * How the Matches tab draws its list: matches per row, one match, and the
 * cold-load placeholder.
 */
export interface MatchListLayout {
  perRow: 1 | 2;
  renderMatch: RenderMatch;
  Skeleton: React.ComponentType;
}

/**
 * The feed (specs/matches-tab 6.2, jits-a4fw.4): one full-width
 * `MatchFeedCard` per row and a three-card skeleton. It replaced the Film
 * Room's two-up 3:4 poster grid.
 */
export const FEED_LAYOUT: MatchListLayout = {
  perRow: 1,
  renderMatch: (item, ctx) => <MatchFeedCard item={item} {...ctx} />,
  Skeleton: MatchFeedSkeleton,
};
