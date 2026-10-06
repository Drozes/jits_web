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
  reuseReels,
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

  it("first load (nothing on screen) orders the first page unseen first", () => {
    const out = mergeFirstPage([], [reel("1"), reel("2", { unseen: true })], false);
    expect(ids(out.items)).toEqual(["2", "1"]);
    expect(out.keptTail).toBe(false);
  });

  it("keeps on-screen order across a refetch; new reels enter at the front, unseen first among new", () => {
    const current = [reel("2", { unseen: true }), reel("1")];
    // Server order (newest first): 4, 3 are new; 2 was watched meanwhile.
    const page = [reel("4"), reel("3", { unseen: true }), reel("2", { unseen: false }), reel("1")];
    const out = mergeFirstPage(current, page, false);
    expect(ids(out.items)).toEqual(["3", "4", "2", "1"]);
    expect(out.items.find((i) => i.highlightId === "2")?.unseen).toBe(false);
  });

  it("a watched tile does not move on the next refetch", () => {
    const current = [reel("a", { unseen: true }), reel("b", { unseen: true }), reel("c")];
    const page = [reel("a", { unseen: true }), reel("b"), reel("c")];
    expect(ids(mergeFirstPage(current, page, false).items)).toEqual(["a", "b", "c"]);
  });

  it("drops a reel that left the first page's range, and duplicates", () => {
    const out = mergeFirstPage([reel("1"), reel("2")], [reel("1"), reel("1")], false);
    expect(ids(out.items)).toEqual(["1"]);
  });

  it("20 loaded + a full 10-item first page whose last item is on screen: keeps the tail (and the old cursor)", () => {
    const at = (i: number) => new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString();
    const old = Array.from({ length: 20 }, (_, i) => reel(`o${i}`, { readyAt: at(i + 2) }));
    // Two new reels arrive; the new first page is n0, n1, o0..o7 (o7 is on screen).
    const page = [reel("n0", { readyAt: at(0) }), reel("n1", { readyAt: at(1) }), ...old.slice(0, 8)];
    const out = mergeFirstPage(old, page, true);
    expect(out.keptTail).toBe(true);
    expect(out.items).toHaveLength(22);
    expect(ids(out.items).slice(0, 3)).toEqual(["n0", "n1", "o0"]);
    expect(ids(out.items).slice(-1)).toEqual(["o19"]);
  });

  it("keeps on-screen reels without parsing timestamps: an unparseable readyAt never drops them", () => {
    const old = Array.from({ length: 15 }, (_, i) => reel(`o${i}`, { readyAt: "not a timestamp" }));
    const page = [reel("n0", { readyAt: "also junk" }), ...old.slice(0, 9)];
    const out = mergeFirstPage(old, page, true);
    expect(out.keptTail).toBe(true);
    expect(ids(out.items)).toEqual(["n0", ...ids(old)]);
  });

  it("regression: an unseen reel shown before the anchor is never lost (probe)", () => {
    // Loaded A..J (only J unseen) then tail K, L: the screen reads J, A..I, K, L.
    const letters = "ABCDEFGHIJ".split("");
    const first = mergeFirstPage([], letters.map((l) => reel(l, { unseen: l === "J" })), true).items;
    const screen = appendReelPage(first, [reel("K"), reel("L")]);
    expect(ids(screen)).toEqual(["J", "A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L"]);
    // A new reel N arrives; the full new first page is N, A..I (anchor I).
    const page = [reel("N"), ..."ABCDEFGHI".split("").map((l) => reel(l))];
    const out = mergeFirstPage(screen, page, true);
    expect(out.keptTail).toBe(true);
    expect(ids(out.items)).toEqual(["N", "J", "A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L"]);
  });

  it("keptTail is false when no on-screen reel outside the new page was kept", () => {
    const old = [reel("a"), reel("b")];
    // Every reel on screen is in the new page: nothing extra kept, so the new first cursor applies.
    expect(mergeFirstPage(old, [reel("n"), reel("a"), reel("b")], true).keptTail).toBe(false);
    // Anchor not on screen: missing reels are dropped.
    expect(mergeFirstPage(old, [reel("n"), reel("m")], true)).toMatchObject({ keptTail: false });
    expect(ids(mergeFirstPage(old, [reel("n"), reel("m")], true).items)).toEqual(["n", "m"]);
    // A short (last) page never keeps a tail.
    expect(mergeFirstPage(old, [reel("a")], false)).toEqual({ items: [old[0]], keptTail: false });
  });

  it("reuses objects only when opponent and duration are unchanged too", () => {
    const a = reel("a");
    expect(reuseReels([a], [reel("a", { opponentName: "Bo" })])[0]).not.toBe(a);
    expect(reuseReels([a], [reel("a", { durationS: 30 })])[0]).not.toBe(a);
  });

  it("20 loaded + a full first page of 10 brand-new reels: drops the tail (new first cursor)", () => {
    const old = Array.from({ length: 20 }, (_, i) => reel(`o${i}`, { readyAt: "2026-09-01T00:00:00Z" }));
    const page = Array.from({ length: 10 }, (_, i) => reel(`n${i}`, { readyAt: "2026-10-01T00:00:00Z" }));
    const out = mergeFirstPage(old, page, true);
    expect(out.keptTail).toBe(false);
    expect(ids(out.items)).toEqual(ids(page));
  });

  it("reuses unchanged reel objects and replaces changed ones", () => {
    const a = reel("a");
    const b = reel("b", { unseen: true });
    const next = reuseReels([a, b], [reel("a"), reel("b", { unseen: false }), reel("c")]);
    expect(next[0]).toBe(a);
    expect(next[1]).not.toBe(b);
    expect(next[1].unseen).toBe(false);
    expect(reuseReels([a], [reel("a", { posterUrl: "https://new" })])[0]).not.toBe(a);
    expect(reuseReels([a], [reel("a", { version: 2 })])[0]).not.toBe(a);
  });
});

describe("building tiles", () => {
  it("hides a building tile whose match already has a ready reel, and duplicates", () => {
    const out = visibleBuilding([building("m-1"), building("m-x"), building("m-x")], [reel("1")]);
    expect(out.map((b) => b.matchId)).toEqual(["m-x"]);
  });

  it("finds reels that landed since the last read", () => {
    expect(ids(landedReels([building("m-1"), building("m-9")], [], [reel("1"), reel("2")]))).toEqual(["1"]);
    expect(landedReels([], [], [reel("1")])).toEqual([]);
  });

  it("a lagging phase (building tile hidden because the reel was already ready) never lands again", () => {
    expect(landedReels([building("m-1")], [reel("1")], [reel("1")])).toEqual([]);
  });

  it("a reel already ready last time does not land, even if a building entry lingered", () => {
    // The hidden building tile was not shown, so nothing lands; and a new version of a ready reel is not a reveal.
    expect(landedReels([building("m-1")], [reel("1")], [reel("1", { version: 2 })])).toEqual([]);
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
