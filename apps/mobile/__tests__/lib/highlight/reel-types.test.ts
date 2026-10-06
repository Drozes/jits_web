import type { MyHighlightItem } from "@jits/shared/api/highlight-share";
import { canManageReel, ownReelItem, reelSecondaryAction } from "@/lib/highlight/reel-types";

const row = {
  highlightId: "h1",
  matchId: "m1",
  matchVideoId: "v1",
  version: 2,
  durationS: 28,
  posterPath: "p.jpg",
  opponentName: "D. Okafor",
  readyAt: "2026-10-06T12:00:00Z",
  unseen: true,
} as unknown as MyHighlightItem;

describe("reel item contract", () => {
  it("an own reel is always participant, with the viewer as its subject when known", () => {
    const item = ownReelItem(row, "https://signed/p.jpg", "me-1");
    expect(item).toMatchObject({ source: "own", isOwn: true, viewerIsParticipant: true, subjectAthleteId: "me-1" });
    expect(canManageReel(item)).toBe(true);
    expect(reelSecondaryAction(item)).toBe("open_match");
  });

  it("ownership never comes from source: an own-source fixture with isOwn false manages nothing", () => {
    expect(canManageReel({ ...ownReelItem(row, null), isOwn: false })).toBe(false);
  });

  it("leaves the subject unset when the viewer id is not available", () => {
    const item = ownReelItem(row, null);
    expect(item.viewerIsParticipant).toBe(true);
    expect("subjectAthleteId" in item).toBe(false);
  });

  it("offers View profile for a reel the viewer did not fight in, and nothing without a subject", () => {
    expect(reelSecondaryAction({ viewerIsParticipant: false, subjectAthleteId: "ath-9" })).toBe("view_profile");
    expect(reelSecondaryAction({ subjectAthleteId: "ath-9" })).toBe("view_profile");
    expect(reelSecondaryAction({ viewerIsParticipant: false, subjectAthleteId: null })).toBeNull();
    expect(reelSecondaryAction({})).toBeNull();
  });
});
