/** The full-screen page's bottom meta (spec 8.2; owner decision 2026-10-14: the @handle replaced Open match / View profile). */
import { pageMeta, reelDuration, reelMetaLine } from "@/lib/highlight/reel-meta";
import { reel } from "../../support/reel-fixtures";

const detail = {
  highlightId: "h1",
  matchVideoId: "v1",
  matchId: "m1",
  version: 1,
  clipsEnabled: true,
  shareEnabled: true,
  caption: { athleteName: "Ana", opponentName: "Bea", matchType: "ranked", outcome: "win", eloAfter: 1, eloDelta: 1, technique: null, playedAt: "2026-10-04T15:00:00Z" },
} as never;

describe("reel meta", () => {
  it("formats the mono line `OCT 04 · 0:28`", () => {
    expect(reelDuration(28.4)).toBe("0:28");
    expect(reelDuration(75)).toBe("1:15");
    expect(reelDuration(null)).toBe("0:00");
    expect(reelMetaLine("2026-10-04T15:00:00Z", 28)).toBe("OCT 04 · 0:28");
    expect(reelMetaLine(null, 28)).toBe("0:28");
  });

  it("single-reel (no lane item): the viewer's own handle and the match date, no title, no secondary action", () => {
    const m = pageMeta(detail, null, "ana.bjj");
    expect(m).toEqual({ dateIso: "2026-10-04T15:00:00Z", instagramHandle: "ana.bjj" });
    expect(m).not.toHaveProperty("title");
    expect(m).not.toHaveProperty("secondary");
  });

  it("pager, own item: the viewer's handle, as stored", () => {
    expect(pageMeta(detail, reel(1), "Ana.Bjj").instagramHandle).toBe("Ana.Bjj");
    expect(pageMeta(detail, reel(1, { subjectInstagramHandle: "ignored" }), "ana").instagramHandle).toBe("ana");
  });

  it.each([null, undefined, "", "  "])("no handle (%p) reads as null", (handle) => {
    expect(pageMeta(detail, reel(1), handle).instagramHandle).toBeNull();
    expect(pageMeta(detail, null, handle).instagramHandle).toBeNull();
  });

  it("not yours: the item's subject handle, never the viewer's", () => {
    const item = reel(1, { isOwn: false, source: "friend", opponentName: "C. Ruiz", subjectInstagramHandle: "cruiz" });
    expect(pageMeta(detail, item, "ana").instagramHandle).toBe("cruiz");
    expect(pageMeta(detail, reel(2, { isOwn: false, source: "friend" }), "ana").instagramHandle).toBeNull();
  });
});
