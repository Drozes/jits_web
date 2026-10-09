/**
 * The header rating (jits-1ez5.1, .4).
 *
 * - The width budget: the left side never yields; the chip takes the rest,
 *   and the post-match delta shows only when it fits beside the chip.
 * - The post-match moment ("Header ELO roll"): plays once per rating change,
 *   on the focused tab root only, never on mount, a same-value refetch or a
 *   rating already watched on the verdict; the delta holds about 4s, then
 *   goes. Reduce Motion: landed value at once, the delta shown then removed.
 * - Review fixes: the same from -> to later rolls again (in-memory epochs),
 *   the verdict's watched slot is consumed once, a draw's delta is amber,
 *   the rating sizes itself for Dynamic Type up to 1.3x, and the sheet closes
 *   when the tab loses focus or the athlete signs out.
 */
import * as React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

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
  YourNumbersSheet: ({ open }: { open: boolean }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: open ? "sheet-open" : "sheet-closing" });
  },
}));
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 3, fontScale: mockFontScale }),
}));

import { HeaderElo } from "@/components/layout/header-elo";
import { ROLL_MS, __resetPlayedMomentsForTests } from "@/components/ui/elo-system/rolling-number";
import { CHIP_MAX_WIDTH } from "@/lib/arena/header-chip-model";
import { __setReduceMotionForTests } from "@/lib/motion";
import {
  HEADER_DELTA_HOLD_MS,
  HEADER_ELO_MAX_FONT_SCALE,
  __resetHeaderEloForTests,
  headerDeltaFits,
  headerDeltaTone,
  headerEloScale,
  lastVerdictOutcome,
  noteVerdictOutcome,
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
  __resetHeaderEloForTests();
  mockFocused = true;
  mockFontScale = 1;
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
    // Not "last match": the bar cannot tell a match from another change (review C7).
    expect(headerEloAnnouncement(1512, 14)).toBe("Your rating 1512, up 14.");
    expect(headerEloAnnouncement(1489, -9)).toBe("Your rating 1489, down 9.");
  });
});

describe("headerEloTransition", () => {
  it("is a change from a known rating only", () => {
    expect(headerEloTransition("a1", 1498, 1512, 3)).toEqual({ from: 1498, to: 1512, delta: 14, key: "header-elo:a1:3" });
    expect(headerEloTransition("a1", 1512, 1512, 3)).toBeNull();
    expect(headerEloTransition("a1", undefined, 1512, 3)).toBeNull();
    expect(headerEloTransition("a1", 1498.5, 1512, 3)).toBeNull();
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
    expect(announce).toHaveBeenCalledWith("Your rating 1512, up 14.");
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

  it("rolls the same from -> to again later (no persisted key suppresses it, review C3)", () => {
    const utils = render(header());
    for (const [rating, expectRoll] of [[1512, true], [1498, true], [1512, true]] as const) {
      setRating(rating);
      utils.rerender(header());
      expect(!!utils.queryByTestId("header-elo-delta")).toBe(expectRoll);
      act(() => {
        jest.advanceTimersByTime(LAND);
      });
      act(() => {
        jest.advanceTimersByTime(HEADER_DELTA_HOLD_MS);
      });
    }
  });

  it("consumes the verdict's watched slot once: a later return to that rating rolls", () => {
    const utils = render(header());
    noteRatingWatched("a1", 1512);
    setRating(1512);
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeNull();
    setRating(1498);
    utils.rerender(header());
    act(() => {
      jest.advanceTimersByTime(LAND + 1);
    });
    act(() => {
      jest.advanceTimersByTime(HEADER_DELTA_HOLD_MS);
    });
    setRating(1512);
    utils.rerender(header());
    expect(utils.queryByTestId("header-elo-delta")).toBeTruthy();
  });

  it("a negative delta is amber after a draw verdict, red when the outcome is unknown (review C2)", () => {
    const color = (utils: ReturnType<typeof render>) =>
      (StyleSheet.flatten(utils.getByTestId("header-elo-delta-text", { includeHiddenElements: true }).props.style) as { color?: string }).color;
    const loss = render(header());
    setRating(1489);
    loss.rerender(header());
    const red = color(loss);
    loss.unmount();

    noteVerdictOutcome("a1", "m1", "draw");
    const draw = render(header());
    setRating(1480);
    draw.rerender(header());
    const amber = color(draw);
    expect(amber).not.toBe(red);
    expect(lastVerdictOutcome("a1")).toBe("draw");
    expect(headerDeltaTone(-2, "draw")).toBe("draw");
    expect(headerDeltaTone(-2, null)).toBe("loss");
    expect(headerDeltaTone(-2, "loss")).toBe("loss");
    expect(headerDeltaTone(14, "draw")).toBe("win");
  });

  it("sizes the rating for Dynamic Type itself, up to 1.3x, with OS scaling off (review D2)", () => {
    expect(headerEloScale(0.8)).toBe(1);
    expect(headerEloScale(1.15)).toBe(1.15);
    expect(headerEloScale(3.1)).toBe(1.3);
    for (const [fs, size] of [[1, 16], [1.2, 19.2], [3.1, 20.8]] as const) {
      mockFontScale = fs;
      const utils = render(header());
      const value = utils.getByTestId("header-elo-value");
      expect(value.props.allowFontScaling).toBe(false);
      expect((StyleSheet.flatten(value.props.style) as { fontSize: number }).fontSize).toBeCloseTo(size);
      utils.unmount();
    }
  });

  it("closes the sheet when its tab loses focus (e.g. a challenge pushes the match, review C4)", () => {
    const utils = render(header());
    fireEvent.press(utils.getByTestId("header-elo"));
    expect(utils.getByTestId("sheet-open")).toBeTruthy();
    mockFocused = false;
    utils.rerender(header());
    // Still mounted so it can dismiss itself; no longer open.
    expect(utils.queryByTestId("sheet-open")).toBeNull();
    expect(utils.getByTestId("sheet-closing")).toBeTruthy();
  });

  it("drops the sheet when the athlete signs out (review C8)", () => {
    const utils = render(header());
    fireEvent.press(utils.getByTestId("header-elo"));
    mockAuth.athlete = null;
    utils.rerender(header());
    mockAuth.athlete = { id: "a1", current_elo: 1498, highest_elo: 1540, primary_gym_id: null };
    utils.rerender(header());
    expect(utils.queryByTestId("sheet-open")).toBeNull();
    expect(utils.queryByTestId("sheet-closing")).toBeNull();
  });
});
