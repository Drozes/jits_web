import type { MyHighlightItem } from "@jits/shared/api/highlight-share";

/**
 * Shared contract for the reel carousels and the swipe viewer (specs/matches-tab).
 *
 * Phase 1 only produces `own` items. `friend`, `local` and `elo` are reserved for
 * the gated Home lanes (jr_be-tjx, jr_be-o7c and a future local lane); the viewer
 * must already honour `isOwn` so those lanes can join without a viewer change.
 */
export type ReelSource = "own" | "friend" | "local" | "elo";

/** Which surface opened the viewer; drives the lane token and telemetry `source`. */
export type ReelLaneKey = "home" | "matches";

export interface ReelItem {
  highlightId: string;
  matchId: string;
  matchVideoId: string;
  source: ReelSource;
  /**
   * True only when the signed-in athlete is the reel's subject. Owner decision
   * 2026-10-06: a reel that is not yours never offers Share to Instagram, Save to
   * Photos or Improve this reel. Never derive this from `source` alone.
   */
  isOwn: boolean;
  version: number;
  durationS: number;
  /** Storage key of the 9:16 cover; sign before display. */
  posterPath: string | null;
  /** Signed poster URL, null when unsigned or signing failed. */
  posterUrl: string | null;
  /** Display name for the tile caption ("vs {name}" for own reels). */
  opponentName: string | null;
  readyAt: string;
  unseen: boolean;
  /**
   * The signed-in athlete fought in the reel's match. Drives the viewer's
   * secondary action: Open match only when true, else View profile
   * (`athlete/[subjectAthleteId]`). Own reels are always participant. Absent
   * reads as false (spec section 8, round-2 owner decision 2026-10-06).
   */
  viewerIsParticipant?: boolean;
  /** The athlete the reel is about (its subject); null or absent when unknown. */
  subjectAthleteId?: string | null;
}

/**
 * Maps the caller's own highlight row (get_my_highlights) to a lane item. The
 * viewer is always a participant of an own reel and its subject, so pass the
 * viewer's athlete id when the caller has it (absent leaves the subject unset).
 */
export function ownReelItem(item: MyHighlightItem, posterUrl: string | null, viewerId?: string | null): ReelItem {
  return {
    highlightId: item.highlightId,
    matchId: item.matchId,
    matchVideoId: item.matchVideoId,
    source: "own",
    isOwn: true,
    version: item.version,
    durationS: item.durationS,
    posterPath: item.posterPath,
    posterUrl,
    opponentName: item.opponentName,
    readyAt: item.readyAt,
    unseen: item.unseen,
    viewerIsParticipant: true,
    ...(viewerId ? { subjectAthleteId: viewerId } : {}),
  };
}

/**
 * The viewer's secondary action for a reel: Open match only when the viewer
 * fought in it, else View profile of the reel's subject (none when unknown).
 */
export function reelSecondaryAction(
  item: Pick<ReelItem, "viewerIsParticipant" | "subjectAthleteId">,
): "open_match" | "view_profile" | null {
  if (item.viewerIsParticipant === true) return "open_match";
  return item.subjectAthleteId ? "view_profile" : null;
}

/** Owner-only actions on a reel (share, save, improve). */
export function canManageReel(item: Pick<ReelItem, "isOwn">): boolean {
  return item.isOwn === true;
}
