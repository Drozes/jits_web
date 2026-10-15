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
  /** Display name for the tile caption and the viewer's VoiceOver label: the opponent on an own reel ("vs {name}"), the reel's subject on a reel that is not yours. */
  opponentName: string | null;
  readyAt: string;
  unseen: boolean;
  /**
   * The reel subject's Instagram handle, stored normalized (no @). The viewer
   * shows it as a tappable `@handle` under the date line; null or absent shows
   * nothing. Own items are filled from the signed-in athlete's live profile
   * when the viewer renders (`pageMeta`), so a profile edit shows at once; a
   * reserved non-own lane sets it from its own read.
   */
  subjectInstagramHandle?: string | null;
  /**
   * The athlete the reel is about (its subject); null or absent when unknown.
   * The block filter in use-reel-lane hides a non-own reel whose subject is
   * in a block with me (jits-rog5.11), so a shared lane must set it.
   */
  subjectAthleteId?: string | null;
}

/** Maps the caller's own highlight row (get_my_highlights) to a lane item. */
export function ownReelItem(item: MyHighlightItem, posterUrl: string | null): ReelItem {
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
  };
}

/** Owner-only actions on a reel (share, save, improve). */
export function canManageReel(item: Pick<ReelItem, "isOwn">): boolean {
  return item.isOwn === true;
}
