/**
 * The header rating (jits-1ez5.1, .4).
 *
 * - The width budget: the left side never yields; the chip takes the rest,
 *   and the post-match delta shows only when it fits beside the chip.
 * - The post-match moment ("Header ELO roll"): plays once per rating change,
 *   on the focused tab root only, never on mount, a same-value refetch or a
 *   rating already watched on the verdict; the delta holds about 4s, then
 *   goes. Reduce Motion: landed value at once, the delta shown then removed.
 */
import * as React from "react";
import { AccessibilityInfo } from "react-native";
import { act, render } from "@testing-library/react-native";

const mockAuth: { athlete: { id: string; current_elo: number; highest_elo: number; primary_gym_id: null } | null } = {
  athlete: { id: "a1", current_elo: 1498, highest_elo: 1540, primary_gym_id: null },
};
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => mockAuth,
}));
let mockFocused = true;
jest.mock("@/lib/navigation/use-screen-focused", () => ({
  useScreenFocused: () => mockFocused,
}));
jest.mock("@/components/layout/your-numbers-sheet", () => ({
  YourNumbersSheet: () => null,
}));

import { HeaderElo } from "@/components/layout/header-elo";
import { ROLL_MS, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/rolling-number";
import { CHIP_MAX_WIDTH } from "@/lib/arena/header-chip-model";
import { __setReduceMotionForTests } from "@/lib/motion";
import {
  HEADER_DELTA_HOLD_MS,
  HEADER_ELO_MAX_FONT_SCALE,
  __resetWatchedRatingForTests,
  headerDeltaFits,
  headerDeltaWidth,
  headerEloAnnouncement,
  headerEloLabel,
  headerEloTransition,
  noteRatingWatched,
} from "@/lib/rating/header-elo";

/** Past the roll and RollingNumber's completion fallback. */
const LAND = ROLL_MS + 200;
/** Plenty of room beside the chip (an offline chip on a 390pt phone). */
const ROOMY = 80;

function setRating(rating: number) {
  mockAuth.athlete = { ...mockAuth.athlete!, current_elo: rating };
}

function header(spareWidth: number | null = ROOMY) {
  return <HeaderElo spareWidth={spareWidth} />;
}

beforeEach(() => {
  jest.useFakeTimers();
  __setReduceMotionForTests(false);
  __resetPlayedMomentsForTests();
  __resetWatchedRatingForTests();
  mockFocused = true;
  mockAuth.athlete = { id: "a1", current_elo: 1498, highest_elo: 1540, primary_gym_id: null };
});
afterEach(() => {
  jest.useRealTimers();
  __setReduceMotionForTests(false);
});

describe("the width budget (375pt and 390pt phones)", () => {
  // Measured in the mock: wordmark 68.8, the join 21, so the left side is
  // 89.8 + the rating; the right is the chip + 8 + the 28pt bell, 12 between.
  const WORDMARK_AND_JOIN = 68.8 + 21;
  const leftAt = (scale: number) => WORDMARK_AND_JOIN + 4 * 16 * Math.min(scale, HEADER_ELO_MAX_FONT_SCALE) * 0.6;
  const chipSlot = (usable: number, scale: number) => usable - leftAt(scale) - 12 - 8 - 28;

  it("caps the rating at the chip's 1.3x (owner decision), so the chip still gets about its full width", () => {
    expect(HEADER_ELO_MAX_FONT_SCALE).toBe(1.3);
    // 375pt: 343 usable. At 1x the chip keeps its 160 cap; at 1.3x (and any
    // larger setting) it gets about 155 and runs its own fit inside it.
    expect(chipSlot(343, 1)).toBeGreaterThanOrEqual(CHIP_MAX_WIDTH);
    expect(chipSlot(343, 1.3)).toBeGreaterThan(150);
    expect(chipSlot(343, 3)).toBe(chipSlot(343, 1.3));
    // 390pt: 358 usable, the full cap at every size.
    expect(chipSlot(358, 1.3)).toBeGreaterThanOrEqual(CHIP_MAX_WIDTH);
  });

  it("the delta fits only in the room the chip leaves (6pt gap plus the mono glyphs)", () => {
    // "▲ +14" is 5 glyphs of 6pt at 1x.
    expect(headerDeltaWidth(14, 1)).toBe(6 + 30);
    expect(headerDeltaWidth(-9, 1)).toBe(6 + 24);
    expect(headerDeltaWidth(14, 3)).toBe(headerDeltaWidth(14, 1.3));
    // GO LIVE (101pt) on a 375pt phone leaves about 54pt: it fits.
    expect(headerDeltaFits(14, 1, chipSlot(343, 1) - 101)).toBe(true);
    // LIVE · 4 ▪ CONFIRM at its 155pt on an SE: it does not.
    expect(headerDeltaFits(14, 1, Math.max(0, chipSlot(343, 1) - 160))).toBe(false);
    expect(headerDeltaFits(14, 1, null)).toBe(false);
  });
});

describe("copy", () => {
  it("labels the rating and announces a result once", () => {
    expect(headerEloLabel(1512)).toBe("Your rating 1512");
    expect(headerEloAnnouncement(1512, 14)).toBe("Your rating 1512, up 14 last match.");
    expect(headerEloAnnouncement(1489, -9)).toBe("Your rating 1489, down 9 last match.");
  });
});

describe("headerEloTransition", () => {
  it("is a change from a known rating only", () => {
    expect(headerEloTransition("a1", 1498, 1512)).toEqual({ from: 1498, to: 1512, delta: 14, key: "header-elo:a1:1498->1512" });
    expect(headerEloTransition("a1", 1512, 1512)).toBeNull();
    expect(headerEloTransition("a1", undefined, 1512)).toBeNull();
    expect(headerEloTransition("a1", 1498.5, 1512)).toBeNull();
  });
});

describe("HeaderElo post-match moment", () => {
  it("paints the rating at rest on the first frame, with no delta (never on mount)", () => {
    const { getByTestId, queryByTestId } = render(header());
    expect(getByTestId("header-elo-value")).toHaveTextContent("1498");
    expect(queryByTestId("header-elo-delta")).toBeNull();
  });

  it("rolls to the new rating, shows the delta beside it about 4s, then settles", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    const utils = render(header());
    setRating(1512);
    utils.rerender(header());
    // Mid-roll the delta holds its place but is not shown yet.
    expect(utils.getByTestId("header-elo-delta")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(LAND);
    });
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
    expect(utils.getByText("▲ +14")).toBeTruthy();
    expect(utils.getByTestId("header-elo")).toHaveProp("accessibilityLabel", "Your rating 1512");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Your rating 1512, up 14 last match.");
    act(() => {
      jest.advanceTimersByTime(HEADER_DELTA_HOLD_MS);
    });
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
    announce.mockRestore();
  });

  it("a loss shows the down delta with a real minus", () => {
    const utils = render(header());
    setRating(1489);
    utils.rerender(header());
    act(() => {
      jest.advanceTimersByTime(LAND);
    });
    expect(utils.getByText("▼ −9")).toBeTruthy();
  });

  it("skips the delta when it would not fit beside the chip; the roll still lands", () => {
    const utils = render(header(10));
    setRating(1512);
    utils.rerender(header(10));
    act(() => {
      jest.advanceTimersByTime(LAND);
    });
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
  });

  it("does not replay on a refetch with the same rating or on a remount", () => {
    const utils = render(header());
    setRating(1512);
    utils.rerender(header());
    act(() => {
      jest.advanceTimersByTime(LAND);
    });
    act(() => {
      jest.advanceTimersByTime(HEADER_DELTA_HOLD_MS);
    });
    // A refetch that returns the same rating.
    mockAuth.athlete = { ...mockAuth.athlete! };
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    utils.unmount();
    const again = render(header());
    expect(again.queryByTestId("header-elo-delta")).toBeNull();
    expect(again.getByTestId("header-elo-value")).toHaveTextContent("1512");
  });

  it("plays once per transition across headers: a second header seeing the same change stays still", () => {
    const first = render(header());
    const second = render(header());
    setRating(1512);
    first.rerender(header());
    second.rerender(header());
    expect(first.queryByTestId("header-elo-delta")).toBeTruthy();
    expect(second.queryByTestId("header-elo-delta")).toBeNull();
  });

  it("an unfocused tab root updates silently (no roll on a later tab switch)", () => {
    mockFocused = false;
    const utils = render(header());
    setRating(1512);
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
    mockFocused = true;
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
  });

  it("does not roll a rating the athlete already watched land on the verdict", () => {
    const utils = render(header());
    noteRatingWatched("a1", 1512);
    setRating(1512);
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
  });

  it("Reduce Motion: the landed value at once, the delta shown, then removed in place", () => {
    __setReduceMotionForTests(true);
    const utils = render(header());
    setRating(1512);
    utils.rerender(header());
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1512");
    expect(utils.getByText("▲ +14")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(HEADER_DELTA_HOLD_MS);
    });
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
  });

  it("a new athlete (account switch) is not a rating change", () => {
    const utils = render(header());
    mockAuth.athlete = { id: "b2", current_elo: 1600, highest_elo: 1600, primary_gym_id: null };
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    expect(utils.getByTestId("header-elo-value")).toHaveTextContent("1600");
  });

  it("draws nothing without an athlete", () => {
    mockAuth.athlete = null;
    const { queryByTestId } = render(header());
    expect(queryByTestId("header-elo")).toBeNull();
    expect(queryByTestId("header-elo-rule")).toBeNull();
  });
});
