/**
 * Pure carousel rules (specs/matches-tab 5, 7.2, 10.2 to 10.5, 12.3).
 */
import {
  __resetSessionPulses,
  appendReelPage,
  buildLaneTiles,
  claimSessionPulse,
  fallbackInFlight,
  landedReels,
  mergeFirstPage,
  nextReelCursor,
  pagerItems,
  unseenFirst,
  visibleBuilding,
  type BuildingReel,
  type LaneTileInputs,
} from "@/lib/highlight/reel-lane";
import type { ReelItem } from "@/lib/highlight/reel-types";
import type { CardPhase } from "@/lib/film-room/card-status";
import { libItem, libVideo } from "../../support/film-fixtures";

function reel(id: string, over: Partial<ReelItem> = {}): ReelItem {
  return {
    highlightId: id,
    matchId: `m-${id}`,
    matchVideoId: `v-${id}`,
    source: "own",
    isOwn: true,
    version: 1,
    durationS: 28,
    posterPath: `${id}.jpg`,
    posterUrl: `https://signed/${id}.jpg`,
    opponentName: "Ana",
    readyAt: "2026-10-06T10:00:00.123456+00:00",
    unseen: false,
    ...over,
  };
}

function building(matchId: string, over: Partial<BuildingReel> = {}): BuildingReel {
  return {
    matchId,
    matchVideoId: null,
    highlightId: null,
    reelState: "rendering",
    step: 2,
    waitDeadlineAt: null,
    serverNow: null,
    opponentName: "Ana",
    playedAt: null,
    posterPath: null,
    posterUrl: null,
    ...over,
  };
}

const ids = (items: ReelItem[]) => items.map((i) => i.highlightId);
const kinds = (input: LaneTileInputs) => buildLaneTiles(input).map((t) => (t.kind === "ghost" ? `ghost:${t.variant}${t.faint ? ":faint" : ""}` : t.kind === "cta" ? `cta:${t.variant}` : t.kind));

describe("nextReelCursor", () => {
  it("passes the B1 cursor strings back verbatim", () => {
    expect(
      nextReelCursor({ items: [reel("a")], nextBefore: "2026-10-06T10:00:00.123456+00:00", nextBeforeId: "a" }, 10),
    ).toEqual({ before: "2026-10-06T10:00:00.123456+00:00", beforeId: "a" });
  });

  it("is null on a short page (last page, either backend)", () => {
    expect(nextReelCursor({ items: [reel("a")], nextBefore: null, nextBeforeId: null }, 10)).toBeNull();
    expect(nextReelCursor({ items: [], nextBefore: null, nextBeforeId: null }, 10)).toBeNull();
  });

  it("falls back to the last item's readyAt (time only) on a full page from an older backend", () => {
    const items = [reel("a"), reel("b", { readyAt: "2026-10-05T09:00:00.5+00:00" })];
    expect(nextReelCursor({ items, nextBefore: null, nextBeforeId: null }, 2)).toEqual({
      before: "2026-10-05T09:00:00.5+00:00",
      beforeId: null,
    });
  });
});

describe("ordering", () => {
  it("puts unseen first and keeps newest-first within each group", () => {
    const items = [reel("1"), reel("2", { unseen: true }), reel("3"), reel("4", { unseen: true })];
    expect(ids(unseenFirst(items))).toEqual(["2", "4", "1", "3"]);
  });

  it("appends a page without moving tiles on screen, de-duplicated", () => {
    const current = [reel("1", { unseen: true }), reel("2")];
    const page = [reel("2"), reel("3"), reel("4", { unseen: true })];
    expect(ids(appendReelPage(current, page))).toEqual(["1", "2", "4", "3"]);
  });

  it("merges a full refetched first page with the old tail, de-duplicated", () => {
    const current = [reel("1"), reel("2", { readyAt: "2026-10-05T00:00:00Z" }), reel("3", { readyAt: "2026-10-01T00:00:00Z" })];
    const first = [reel("0", { unseen: true, readyAt: "2026-10-07T00:00:00Z" }), reel("1", { readyAt: "2026-10-06T00:00:00Z" })];
    expect(ids(mergeFirstPage(current, first, true))).toEqual(["0", "1", "2", "3"]);
  });

  it("drops the old tail when the refetched first page is the last page", () => {
    expect(ids(mergeFirstPage([reel("1"), reel("2")], [reel("1")], false))).toEqual(["1"]);
  });

  it("drops a duplicate inside the first page", () => {
    expect(ids(mergeFirstPage([], [reel("1"), reel("1")], false))).toEqual(["1"]);
  });
});

describe("building tiles", () => {
  it("hides a building tile whose match already has a ready reel, and duplicates", () => {
    const out = visibleBuilding([building("m-1"), building("m-x"), building("m-x")], [reel("1")]);
    expect(out.map((b) => b.matchId)).toEqual(["m-x"]);
  });

  it("finds reels that landed since the last read", () => {
    expect(ids(landedReels([building("m-1"), building("m-9")], [reel("1"), reel("2")]))).toEqual(["1"]);
    expect(landedReels([], [reel("1")])).toEqual([]);
  });
});

describe("fallbackInFlight (no B2)", () => {
  const now = Date.parse("2026-10-06T10:00:00Z");
  const phase = (p: Partial<CardPhase>): CardPhase => ({ phase: "building", reason: null, waitRemainingMs: null, ownReel: null, ...p });

  it("maps building to rendering and waiting_for_angle to waiting with a device deadline", () => {
    const items = [
      libItem({ match_id: "a", videos: [libVideo({ video_id: "va", thumbnail_key: "a.jpg" })] }),
      libItem({ match_id: "b", videos: [libVideo({ video_id: "vb", thumbnail_key: null }), libVideo({ video_id: "vb2", thumbnail_key: "b2.jpg" })] }),
    ];
    const out = fallbackInFlight(items, { a: phase({}), b: phase({ phase: "waiting_for_angle", waitRemainingMs: 90_000 }) }, now);
    expect(out).toEqual([
      expect.objectContaining({ matchId: "a", matchVideoId: "va", reelState: "rendering", step: 2, waitDeadlineAt: null, posterPath: "a.jpg", opponentName: "Mina Park" }),
      expect.objectContaining({ matchId: "b", reelState: "waiting", step: 1, waitDeadlineAt: "2026-10-06T10:01:30.000Z", posterPath: "b2.jpg" }),
    ]);
  });

  it("skips settled phases, final own reels, unknown phases and anything past the newest six", () => {
    const items = Array.from({ length: 8 }, (_, i) => libItem({ match_id: `m${i}` }));
    const phases: Record<string, CardPhase> = {
      m0: phase({ phase: "ready" }),
      m1: phase({ ownReel: "ready" }),
      m2: phase({ ownReel: "failed" }),
      m3: phase({ ownReel: "building" }),
      m4: phase({ phase: "collecting" }),
      m6: phase({}),
      m7: phase({}),
    };
    expect(fallbackInFlight(items, phases, now).map((r) => r.matchId)).toEqual(["m3"]);
  });

  it("handles a match with no videos and a negative wait", () => {
    const out = fallbackInFlight([libItem({ match_id: "z", videos: [] })], { z: phase({ phase: "waiting_for_angle", waitRemainingMs: -5 }) }, now);
    expect(out[0]).toMatchObject({ matchVideoId: null, posterPath: null, waitDeadlineAt: "2026-10-06T10:00:00.000Z" });
  });
});

describe("buildLaneTiles", () => {
  const base: LaneTileInputs = { laneKey: "home", items: [], building: [], clipsEnabled: true, loading: false, hasMore: false };

  it("is empty with clips off (the carousel is hidden), even with items", () => {
    expect(buildLaneTiles({ ...base, clipsEnabled: false, items: [reel("1")] })).toEqual([]);
    expect(buildLaneTiles({ ...base, laneKey: "matches", clipsEnabled: false })).toEqual([]);
  });

  it("shows skeletons while the first read is in flight (3 on Home, 4 on Matches)", () => {
    expect(kinds({ ...base, clipsEnabled: false, loading: true })).toEqual(["skeleton", "skeleton", "skeleton"]);
    expect(kinds({ ...base, laneKey: "matches", clipsEnabled: false, loading: true })).toHaveLength(4);
  });

  it("is empty after a failed read with nothing to show", () => {
    expect(buildLaneTiles({ ...base, failed: true })).toEqual([]);
  });

  it("Home with zero matches: CTA first highlight then the C-Z2 ghost", () => {
    expect(kinds({ ...base, matchCount: 0 })).toEqual(["cta:first_highlight", "ghost:first_highlight"]);
  });

  it("Home with matches but no reels (or an unknown count): CTA find a match then the C-L5 ghost", () => {
    expect(kinds({ ...base, matchCount: 4 })).toEqual(["cta:find_match", "ghost:next_highlight"]);
    expect(kinds({ ...base, matchCount: null })).toEqual(["cta:find_match", "ghost:next_highlight"]);
  });

  it("Matches with no reels: one ghost and two faint ghosts, copy by match count", () => {
    expect(kinds({ ...base, laneKey: "matches", matchCount: 0 })).toEqual([
      "ghost:first_highlight",
      "ghost:first_highlight:faint",
      "ghost:first_highlight:faint",
    ]);
    expect(kinds({ ...base, laneKey: "matches", matchCount: 2 })[0]).toBe("ghost:next_highlight");
  });

  it("orders building tiles before ready reels and never appends a ghost to building only", () => {
    expect(kinds({ ...base, building: [building("m-x")] })).toEqual(["building"]);
    const tiles = buildLaneTiles({ ...base, items: [reel("1"), reel("2"), reel("3")], building: [building("m-x")] });
    expect(tiles.map((t) => t.key)).toEqual(["building:m-x", "ready:1", "ready:2", "ready:3"]);
  });

  it.each([
    [1, true],
    [2, true],
    [3, false],
  ])("%p ready reels -> trailing C-L5 ghost: %p (owner Q7)", (n, ghost) => {
    const items = Array.from({ length: n }, (_, i) => reel(String(i)));
    const out = kinds({ ...base, laneKey: "matches", items });
    expect(out[out.length - 1] === "ghost:next_highlight").toBe(ghost);
  });

  it("Home caps at 10 ready tiles then see_all when more exist", () => {
    const items = Array.from({ length: 12 }, (_, i) => reel(String(i)));
    const out = kinds({ ...base, items });
    expect(out.filter((k) => k === "ready")).toHaveLength(10);
    expect(out[out.length - 1]).toBe("see_all");
    expect(kinds({ ...base, items: items.slice(0, 10), hasMore: true }).slice(-1)).toEqual(["see_all"]);
    expect(kinds({ ...base, items: items.slice(0, 10) })).not.toContain("see_all");
  });

  it("Matches never shows see_all", () => {
    const items = Array.from({ length: 12 }, (_, i) => reel(String(i)));
    expect(kinds({ ...base, laneKey: "matches", items, hasMore: true })).not.toContain("see_all");
  });

  it("keeps content on screen while refetching (loading with items)", () => {
    expect(kinds({ ...base, loading: true, items: [reel("1"), reel("2"), reel("3")] })).toEqual(["ready", "ready", "ready"]);
  });

  it("pager pages are the ready items only, in tile order", () => {
    const tiles = buildLaneTiles({ ...base, items: [reel("1"), reel("2")], building: [building("m-x")] });
    expect(ids(pagerItems(tiles))).toEqual(["1", "2"]);
  });
});

describe("claimSessionPulse", () => {
  beforeEach(() => __resetSessionPulses());
  it("pulses each reel once per session", () => {
    expect(claimSessionPulse("a")).toBe(true);
    expect(claimSessionPulse("a")).toBe(false);
    expect(claimSessionPulse("b")).toBe(true);
  });
});
