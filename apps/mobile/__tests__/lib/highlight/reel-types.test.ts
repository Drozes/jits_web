import type { MyHighlightItem } from "@jits/shared/api/highlight-share";
import { canManageReel, ownReelItem } from "@/lib/highlight/reel-types";

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
  it("an own reel is own and manageable; its handle is filled at render, not here", () => {
    const item = ownReelItem(row, "https://signed/p.jpg");
    expect(item).toMatchObject({ source: "own", isOwn: true, posterUrl: "https://signed/p.jpg" });
    expect(canManageReel(item)).toBe(true);
    expect("subjectInstagramHandle" in item).toBe(false);
  });

  it("ownership never comes from source: an own-source fixture with isOwn false manages nothing", () => {
    expect(canManageReel({ ...ownReelItem(row, null), isOwn: false })).toBe(false);
  });
});
