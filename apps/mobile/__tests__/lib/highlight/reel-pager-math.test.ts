/** Pure page math of the swipe viewer (jits-a4fw.5, spec 8.3). */
import {
  clampIndex,
  mergeReelItems,
  pageIndexFromOffset,
  pageLayout,
  poolAssignment,
  prefetchTargets,
  shouldLoadMore,
  slotForIndex,
  swipeDirection,
} from "@/lib/highlight/reel-pager-math";
import { isCaughtUpAttempt } from "@/lib/highlight/reel-pager-math";
import { reel } from "../../support/reel-fixtures";

describe("page math", () => {
  it("lays pages out at the page height and finds the page an offset rests on", () => {
    expect(pageLayout(844, 3)).toEqual({ length: 844, offset: 2532, index: 3 });
    expect(pageIndexFromOffset(0, 844, 5)).toBe(0);
    expect(pageIndexFromOffset(844 * 2 + 300, 844, 5)).toBe(2);
    expect(pageIndexFromOffset(844 * 2 + 500, 844, 5)).toBe(3);
    expect(pageIndexFromOffset(844 * 9, 844, 5)).toBe(4);
    expect(pageIndexFromOffset(-80, 844, 5)).toBe(0);
    expect(pageIndexFromOffset(500, 0, 5)).toBe(0);
  });

  it("clamps indexes", () => {
    expect(clampIndex(7, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(1.6, 3)).toBe(1);
    expect(clampIndex(2, 0)).toBe(0);
    expect(clampIndex(Number.NaN, 4)).toBe(0);
  });

  it("swipe direction", () => {
    expect(swipeDirection(2, 3)).toBe("next");
    expect(swipeDirection(3, 2)).toBe("previous");
    expect(swipeDirection(2, 2)).toBeNull();
  });
});

describe("pool assignment (index mod 3)", () => {
  it("serves previous, current and next, each on its own slot", () => {
    expect(poolAssignment(0, 5)).toEqual([0, 1, null]);
    expect(poolAssignment(1, 5)).toEqual([0, 1, 2]);
    expect(poolAssignment(4, 5)).toEqual([3, 4, null]);
    expect(poolAssignment(0, 1)).toEqual([0, null, null]);
    expect(poolAssignment(0, 0)).toEqual([null, null, null]);
  });

  it("a one-page swipe re-points exactly one slot; the visible and preloaded pages keep theirs", () => {
    for (let i = 1; i < 8; i++) {
      const before = poolAssignment(i, 10);
      const after = poolAssignment(i + 1, 10);
      const changed = before.filter((v, k) => v !== after[k]);
      expect(changed).toHaveLength(1);
      expect(slotForIndex(i + 1, i, 10)).toBe(slotForIndex(i + 1, i + 1, 10));
      expect(slotForIndex(i, i, 10)).toBe(slotForIndex(i, i + 1, 10));
    }
  });

  it("slotForIndex is null outside the window", () => {
    expect(slotForIndex(5, 2, 10)).toBeNull();
    expect(slotForIndex(3, 2, 10)).toBe(0);
  });
});

describe("prefetch and pagination", () => {
  it("prefetches i + 1 and i + 2 only (the previous page is already in its slot)", () => {
    expect(prefetchTargets(3, 10)).toEqual([4, 5]);
    expect(prefetchTargets(0, 10)).toEqual([1, 2]);
    expect(prefetchTargets(8, 10)).toEqual([9]);
    expect(prefetchTargets(0, 1)).toEqual([]);
  });

  it("the loading page after the last reel is a valid rest only with a footer", () => {
    expect(pageIndexFromOffset(3 * 844, 844, 3)).toBe(2);
    expect(pageIndexFromOffset(3 * 844, 844, 3, true)).toBe(3);
  });

  it("loads more within 2 of the last loaded reel", () => {
    expect(shouldLoadMore(6, 10)).toBe(false);
    expect(shouldLoadMore(7, 10)).toBe(true);
    expect(shouldLoadMore(9, 10)).toBe(true);
    expect(shouldLoadMore(0, 0)).toBe(false);
  });

  it("appends a page without duplicates (AC 4.5)", () => {
    const merged = mergeReelItems([reel(1), reel(2)], [reel(2), reel(3), reel(3), reel(4)]);
    expect(merged.map((r) => r.highlightId)).toEqual(["h1", "h2", "h3", "h4"]);
    expect(mergeReelItems([reel(1)], [])).toHaveLength(1);
  });
});

describe("C-V2 attempt detection (both platforms)", () => {
  const base = { active: 4, lastIndex: 4, pageHeight: 800 };
  it("iOS: the bounce past the last page by more than 48 pt", () => {
    expect(isCaughtUpAttempt({ ...base, platform: "ios", endOffsetY: 4 * 800 + 60 })).toBe(true);
    expect(isCaughtUpAttempt({ ...base, platform: "ios", endOffsetY: 4 * 800 + 30 })).toBe(false);
    expect(isCaughtUpAttempt({ ...base, platform: "ios", endOffsetY: 4 * 800 + 60, active: 3 })).toBe(false);
  });
  it("Android: the offset clamps, so the finger's travel up decides", () => {
    expect(isCaughtUpAttempt({ ...base, platform: "android", endOffsetY: 4 * 800, touchDeltaY: 80 })).toBe(true);
    expect(isCaughtUpAttempt({ ...base, platform: "android", endOffsetY: 4 * 800, touchDeltaY: 20 })).toBe(false);
    expect(isCaughtUpAttempt({ ...base, platform: "android", touchDeltaY: -120 })).toBe(false);
    expect(isCaughtUpAttempt({ ...base, platform: "android", touchDeltaY: 120, active: 2 })).toBe(false);
  });
  it("never on an empty lane", () => {
    expect(isCaughtUpAttempt({ platform: "ios", active: 0, lastIndex: -1, pageHeight: 800, endOffsetY: 500 })).toBe(false);
  });
});
