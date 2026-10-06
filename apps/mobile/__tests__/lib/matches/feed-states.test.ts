/**
 * Matches feed state rules (specs/matches-tab 10.1 to 10.3).
 *
 * Source: apps/mobile/lib/matches/feed-states.ts
 */
import { drawsNoFilmCaption, firstTags, isLowData, isZeroState, noFilmHelperMatchId, tagsFor } from "@/lib/matches/feed-states";
import type { CardStatus } from "@/lib/film-room/card-status";
import { libItem, libVideo } from "../../support/film-fixtures";

describe("firstTags (C-L3, C-L4, AC 6.5)", () => {
  it("tags the oldest match and the oldest win once the history is fully loaded", () => {
    const items = [
      libItem({ match_id: "new", outcome: "win" }),
      libItem({ match_id: "mid", outcome: "win" }),
      libItem({ match_id: "old", outcome: "loss" }),
    ];
    const tags = firstTags(items, false);
    expect(tagsFor(tags, "old")).toEqual(["FIRST MATCH"]);
    expect(tagsFor(tags, "mid")).toEqual(["FIRST WIN"]);
    expect(tagsFor(tags, "new")).toEqual([]);
  });

  it("one match can be both", () => {
    const tags = firstTags([libItem({ match_id: "a", outcome: "loss" }), libItem({ match_id: "b", outcome: "win" })], false);
    expect(tagsFor(tags, "b")).toEqual(["FIRST MATCH", "FIRST WIN"]);
  });

  it("no tags while more pages exist (the last loaded match is not the oldest)", () => {
    expect(firstTags([libItem({ match_id: "a" })], true).size).toBe(0);
  });

  it("no FIRST WIN without a win; nothing for an empty list", () => {
    const tags = firstTags([libItem({ match_id: "a", outcome: "draw" })], false);
    expect(tagsFor(tags, "a")).toEqual(["FIRST MATCH"]);
    expect(firstTags([], false).size).toBe(0);
  });

  it("an untagged match gets the same empty array every time (stable for memo)", () => {
    const tags = firstTags([], false);
    expect(tagsFor(tags, "x")).toBe(tagsFor(tags, "y"));
  });
});

describe("drawsNoFilmCaption (the one C-L7 predicate)", () => {
  const none = libItem({ videos: [] });
  it.each<[CardStatus, boolean]>([
    [{ kind: "none" }, true],
    [{ kind: "no_film" }, true],
    [{ kind: "collecting" }, false],
    [{ kind: "waiting", remainingMs: 1000 }, false],
    [{ kind: "building" }, false],
    [{ kind: "uploading", progress: 0.4 }, false],
    [{ kind: "paused", progress: 0.4 }, false],
    [{ kind: "processing" }, false],
  ])("zero-video card, status %o -> %s", (status, want) => {
    expect(drawsNoFilmCaption(none, status)).toBe(want);
  });

  it("never for a card with video rows (that one gets the deck badge)", () => {
    expect(drawsNoFilmCaption(libItem(), { kind: "no_film" })).toBe(false);
  });
});

describe("noFilmHelperMatchId (C-L6 once per screen)", () => {
  const items = [libItem({ match_id: "film" }), libItem({ match_id: "nf-1", videos: [] }), libItem({ match_id: "nf-2", videos: [] })];
  const NONE = (): CardStatus => ({ kind: "none" });

  it("is the first card that draws C-L7", () => {
    expect(noFilmHelperMatchId(items, false, NONE)).toBe("nf-1");
  });

  it("a zero-video no_film card (nobody recorded) gets it", () => {
    expect(noFilmHelperMatchId(items, false, () => ({ kind: "no_film" }))).toBe("nf-1");
  });

  it("skips a zero-video card whose film is still coming; the helper moves to the next C-L7 card", () => {
    const statusOf = (i: { match_id: string }): CardStatus => (i.match_id === "nf-1" ? { kind: "collecting" } : { kind: "none" });
    expect(noFilmHelperMatchId(items, false, statusOf)).toBe("nf-2");
  });

  it("is none while the carousel shows C-L6", () => {
    expect(noFilmHelperMatchId(items, true, NONE)).toBeNull();
  });

  it("ignores matches that have video rows without a poster", () => {
    expect(noFilmHelperMatchId([libItem({ match_id: "x", videos: [libVideo({ poster_url: null })] })], false, NONE)).toBeNull();
  });
});

describe("zero and low data (10.1)", () => {
  it("zero only once loaded, without an error or a filter", () => {
    expect(isZeroState({ loading: false, error: null, items: [], filtered: false })).toBe(true);
    expect(isZeroState({ loading: true, error: null, items: [], filtered: false })).toBe(false);
    expect(isZeroState({ loading: false, error: new Error("x"), items: [], filtered: false })).toBe(false);
    expect(isZeroState({ loading: false, error: null, items: [], filtered: true })).toBe(false);
    expect(isZeroState({ loading: false, error: null, items: [1], filtered: false })).toBe(false);
  });

  it("low data is 1 to 3 matches, nothing more to page, no filter", () => {
    expect(isLowData({ items: [1], hasMore: false, filtered: false })).toBe(true);
    expect(isLowData({ items: [1, 2, 3], hasMore: false, filtered: false })).toBe(true);
    expect(isLowData({ items: [1, 2, 3, 4], hasMore: false, filtered: false })).toBe(false);
    expect(isLowData({ items: [1], hasMore: true, filtered: false })).toBe(false);
    expect(isLowData({ items: [1], hasMore: false, filtered: true })).toBe(false);
    expect(isLowData({ items: [], hasMore: false, filtered: false })).toBe(false);
  });
});

describe("feed list tuning (review m1)", () => {
  it("mounts a small window: 4 rows first, window 7, clipped subviews on Android only", () => {
    const { FEED_LIST_TUNING } = require("@/lib/matches/feed-list-tuning");
    const { Platform } = require("react-native");
    expect(FEED_LIST_TUNING).toEqual({ initialNumToRender: 4, windowSize: 7, removeClippedSubviews: Platform.OS === "android" });
  });
});
