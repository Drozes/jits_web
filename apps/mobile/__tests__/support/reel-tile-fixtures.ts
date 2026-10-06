import type { ReelItem } from "@/lib/highlight/reel-types";
import type { BuildingReel } from "@/lib/highlight/reel-lane";

/** A ready lane item (own by default). */
export function reelItem(id: string, over: Partial<ReelItem> = {}): ReelItem {
  return {
    highlightId: id,
    matchId: `m-${id}`,
    matchVideoId: `v-${id}`,
    source: "own",
    isOwn: true,
    version: 1,
    durationS: 28.4,
    posterPath: `${id}.jpg`,
    posterUrl: `https://signed/${id}.jpg`,
    opponentName: "D. Okafor",
    readyAt: "2026-10-06T10:00:00Z",
    unseen: false,
    viewerIsParticipant: true,
    ...over,
  };
}

/** A building (in-flight) reel. */
export function buildingReel(matchId: string, over: Partial<BuildingReel> = {}): BuildingReel {
  return {
    matchId,
    matchVideoId: `v-${matchId}`,
    highlightId: null,
    reelState: "rendering",
    step: 2,
    waitDeadlineAt: null,
    serverNow: null,
    opponentName: "L. Tanaka",
    playedAt: "2026-10-06T09:00:00Z",
    posterPath: null,
    posterUrl: null,
    ...over,
  };
}
