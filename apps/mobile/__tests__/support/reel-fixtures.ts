import type { ReelItem } from "@/lib/highlight/reel-types";

/** A lane item for the swipe viewer suites (own by default). */
export function reel(n: number, over: Partial<ReelItem> = {}): ReelItem {
  return {
    highlightId: `h${n}`,
    matchId: `m${n}`,
    matchVideoId: `v${n}`,
    source: "own",
    isOwn: true,
    version: 1,
    durationS: 28,
    posterPath: `p${n}.jpg`,
    posterUrl: `https://signed/p${n}.jpg`,
    opponentName: `Opp ${n}`,
    readyAt: "2026-10-04T12:00:00Z",
    unseen: true,
    viewerIsParticipant: true,
    subjectAthleteId: "me",
    ...over,
  };
}
