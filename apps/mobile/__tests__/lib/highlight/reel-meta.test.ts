/** The full-screen page's bottom meta (spec 8.2, 8.6). */
import { metaFromDetail, pageMeta, reelDuration, reelMetaLine, secondaryHref } from "@/lib/highlight/reel-meta";
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

  it("single-reel: own reel, no title, Open match to match detail", () => {
    const m = metaFromDetail(detail);
    expect(m).toMatchObject({ secondary: "open_match", matchId: "m1" });
    expect(m).not.toHaveProperty("title");
    expect(secondaryHref(m)).toBe("/(app)/match-detail/m1");
  });

  it("pager, own item: Open match, no title", () => {
    const m = pageMeta(detail, reel(1));
    expect(m).toMatchObject({ secondary: "open_match" });
    expect(m).not.toHaveProperty("title");
  });

  it("not yours and not a participant: View profile (C-V5), no title", () => {
    const item = reel(1, { isOwn: false, source: "friend", viewerIsParticipant: false, subjectAthleteId: "ath-9", opponentName: "C. Ruiz" });
    const m = pageMeta(detail, item);
    expect(m).toMatchObject({ secondary: "view_profile" });
    expect(m).not.toHaveProperty("title");
    expect(secondaryHref(m)).toBe("/(app)/athlete/ath-9");
  });

  it("not yours but a participant: Open match", () => {
    const m = pageMeta(detail, reel(1, { isOwn: false, viewerIsParticipant: true }));
    expect(secondaryHref(m)).toBe("/(app)/match-detail/m1");
  });

  it("no subject and not a participant: no secondary action", () => {
    expect(secondaryHref(pageMeta(detail, reel(1, { isOwn: false, viewerIsParticipant: false, subjectAthleteId: null })))).toBeNull();
  });
});
