/**
 * ReelTile (specs/matches-tab section 5, 10.5): every kind renders with its
 * label, the unseen ring only on unseen ready tiles (in the unseen-ring
 * token), the source chip only on non-own items, captions, the building
 * tile's steps and its server-clock countdown, the pulse and reveal motions,
 * and Reduce Motion.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t, prop) => (prop === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${String(prop)}` })) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, { ...props, testID: "poster-image" }) };
});
const mockRunPulse = jest.fn();
const mockRunReveal = jest.fn();
const mockRunShimmer = jest.fn();
jest.mock("@/components/reels/reel-motion", () => ({
  RING_PULSE_SCALE: 1.04,
  runRingPulse: (...a: unknown[]) => mockRunPulse(...a),
  runReveal: (...a: unknown[]) => mockRunReveal(...a),
  runShimmer: (...a: unknown[]) => mockRunShimmer(...a),
}));

import { ReelTile } from "@/components/reels/reel-tile";
import type { ReelTileModel } from "@/lib/highlight/reel-lane";
import { __setReduceMotionForTests } from "@/lib/motion";
import { reelItem, buildingReel } from "../../support/reel-tile-fixtures";

const hidden = { includeHiddenElements: true };

function renderTile(tile: ReelTileModel, extra: Partial<React.ComponentProps<typeof ReelTile>> = {}) {
  const onPress = jest.fn();
  const utils = render(<ReelTile tile={tile} size="home" onTilePress={onPress} testID="tile" {...extra} />);
  return { ...utils, onPress };
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => __setReduceMotionForTests(false));
});

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
});

describe("ready tile", () => {
  it("shows the poster, the duration chip, the vs caption and the C-M12 label; no chip for an own reel", () => {
    const tile: ReelTileModel = { kind: "ready", key: "ready:h1", item: reelItem("h1") };
    const { getByText, getByLabelText, queryByTestId, getByTestId, onPress } = renderTile(tile);
    expect(getByTestId("poster-image").props.contentFit).toBe("cover");
    expect(getByText("28s")).toBeTruthy();
    expect(getByText("vs D. Okafor")).toBeTruthy();
    expect(queryByTestId("reel-source-chip")).toBeNull();
    fireEvent.press(getByLabelText("Watch your highlight vs D. Okafor"));
    expect(onPress).toHaveBeenCalledWith(tile);
  });

  it("draws the unseen ring in the unseen-ring token only when unseen, and says unwatched", () => {
    const seen = renderTile({ kind: "ready", key: "a", item: reelItem("a") });
    expect(seen.queryByTestId("reel-tile-ring", hidden)).toBeNull();
    seen.unmount();

    const unseen = renderTile({ kind: "ready", key: "b", item: reelItem("b", { unseen: true }) });
    const ring = unseen.getByTestId("reel-tile-ring", hidden);
    expect(ring.props.className).toBe("border-unseen-ring");
    expect(ring.props.className).not.toMatch(/cta|negative|positive/);
    expect(unseen.getByLabelText("Watch your highlight vs D. Okafor, unwatched")).toBeTruthy();
  });

  it.each([
    ["friend", "FRIEND", ", from a friend"],
    ["local", "NEARBY", ", nearby"],
    ["elo", "ELO RATED", ", from ELO RATED"],
  ] as const)("a %s item shows the %s chip, the subject's name and the chip in its label", (source, chip, a11y) => {
    const item = reelItem("x", { source, isOwn: false, opponentName: "S. Whitfield", viewerIsParticipant: false });
    const { getByText, getByTestId, getByLabelText, queryByText } = renderTile({ kind: "ready", key: "x", item });
    expect(getByTestId("reel-source-chip", hidden)).toBeTruthy();
    expect(getByText(chip)).toBeTruthy();
    expect(getByText("S. Whitfield")).toBeTruthy();
    expect(queryByText("vs S. Whitfield")).toBeNull();
    expect(getByLabelText(`Watch S. Whitfield's highlight${a11y}`)).toBeTruthy();
  });

  it("falls back to an icon without a signed poster", () => {
    const { queryByTestId, getByTestId } = renderTile({ kind: "ready", key: "a", item: reelItem("a", { posterUrl: null }) });
    expect(queryByTestId("poster-image")).toBeNull();
    expect(getByTestId("icon-Clapperboard", hidden)).toBeTruthy();
  });

  it("runs one ring pulse and the reveal when asked, and neither under Reduce Motion", () => {
    const tile: ReelTileModel = { kind: "ready", key: "a", item: reelItem("a", { unseen: true }) };
    const first = renderTile(tile, { pulse: true, reveal: true });
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    expect(mockRunReveal).toHaveBeenCalledTimes(1);
    first.rerender(<ReelTile tile={tile} size="home" onTilePress={first.onPress} pulse reveal />);
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    first.unmount();

    jest.clearAllMocks();
    act(() => __setReduceMotionForTests(true));
    renderTile(tile, { pulse: true, reveal: true });
    expect(mockRunPulse).not.toHaveBeenCalled();
    expect(mockRunReveal).not.toHaveBeenCalled();
  });
});

describe("building tile", () => {
  it("step 1 while planning: C-B1, Step 1 of 2, C-B4, and the C-B6 label; tap calls onPress", () => {
    const tile: ReelTileModel = { kind: "building", key: "b", reel: buildingReel("m1", { reelState: "planning", step: 1 }) };
    const { getByText, getByLabelText, onPress } = renderTile(tile);
    expect(getByText("Finding your best moments")).toBeTruthy();
    expect(getByText("Step 1 of 2")).toBeTruthy();
    expect(getByText("Usually 1 to 3 minutes")).toBeTruthy();
    expect(getByText("vs L. Tanaka")).toBeTruthy();
    fireEvent.press(getByLabelText("Your highlight vs L. Tanaka is being made. Finding your best moments. Opens the match."));
    expect(onPress).toHaveBeenCalledWith(tile);
  });

  it("step 2 while rendering: C-B2 and Step 2 of 2, with the shimmer", () => {
    const { getByText, getByTestId } = renderTile({ kind: "building", key: "b", reel: buildingReel("m1") });
    expect(getByText("Cutting your highlight")).toBeTruthy();
    expect(getByText("Step 2 of 2")).toBeTruthy();
    expect(getByTestId("reel-building-shimmer", hidden)).toBeTruthy();
    expect(mockRunShimmer).toHaveBeenCalledTimes(1);
  });

  it("no shimmer under Reduce Motion", () => {
    act(() => __setReduceMotionForTests(true));
    const { queryByTestId } = renderTile({ kind: "building", key: "b", reel: buildingReel("m1") });
    expect(queryByTestId("reel-building-shimmer", hidden)).toBeNull();
    expect(mockRunShimmer).not.toHaveBeenCalled();
  });

  describe("C-B3 countdown on the server clock", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("counts down from the server's clock even when the device clock is off, then reads Any second now", () => {
      // Device clock is 10 minutes AHEAD of the server; the deadline is 8:12 after server now.
      const device = Date.parse("2026-10-06T10:10:00Z");
      jest.setSystemTime(device);
      const reel = buildingReel("m1", {
        reelState: "waiting",
        step: 1,
        serverNow: "2026-10-06T10:00:00Z",
        waitDeadlineAt: "2026-10-06T10:08:12Z",
      });
      const { getByTestId, getByLabelText, queryByText } = renderTile({ kind: "building", key: "b", reel });
      expect(getByTestId("reel-building-countdown").props.children).toBe("Waiting 8:12");
      expect(getByLabelText("Your highlight vs L. Tanaka is being made. Waiting 8:12. Opens the match.")).toBeTruthy();
      expect(queryByText("Step 1 of 2")).toBeNull();

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(getByTestId("reel-building-countdown").props.children).toBe("Waiting 8:10");

      act(() => {
        jest.advanceTimersByTime(8 * 60_000 + 10_000);
      });
      expect(getByTestId("reel-building-countdown").props.children).toBe("Any second now");
    });

    it("a waiting reel without a deadline shows step 1", () => {
      const reel = buildingReel("m1", { reelState: "waiting", step: 1, waitDeadlineAt: null });
      const { getByText, queryByTestId } = renderTile({ kind: "building", key: "b", reel });
      expect(getByText("Finding your best moments")).toBeTruthy();
      expect(queryByTestId("reel-building-countdown")).toBeNull();
    });
  });
});

describe("ghost, CTA, See all and skeleton tiles", () => {
  it("a ghost has its copy, is not pressable, and the C-L5 ghost carries the C-L6 helper", () => {
    const first = renderTile({ kind: "ghost", key: "g", variant: "first_highlight", faint: false });
    const ghost = first.getByLabelText("Your first highlight lands here");
    expect(ghost.props.accessibilityRole).toBeUndefined();
    expect(ghost.props.onPress).toBeUndefined();
    expect(first.queryByText("Turn on Record from my phone at face-off.")).toBeNull();
    first.unmount();

    const next = renderTile({ kind: "ghost", key: "g", variant: "next_highlight", faint: false });
    expect(next.getByLabelText("Record your next match to get a highlight")).toBeTruthy();
    expect(next.getByText("Turn on Record from my phone at face-off.")).toBeTruthy();
  });

  it("a faint ghost is outline only and hidden from VoiceOver", () => {
    const { queryByText, getByTestId } = renderTile({ kind: "ghost", key: "g", variant: "next_highlight", faint: true });
    expect(queryByText("Record your next match to get a highlight", hidden)).toBeNull();
    expect(getByTestId("tile", hidden).props.accessibilityElementsHidden).toBe(true);
  });

  it.each([
    ["first_highlight", "Get your first highlight"],
    ["find_match", "Find a match"],
  ] as const)("the %s CTA is a secondary (never red) button", (variant, label) => {
    const tile: ReelTileModel = { kind: "cta", key: "c", variant, action: "arena" };
    const { getByText, getByLabelText, onPress, toJSON } = renderTile(tile);
    expect(getByText(label)).toBeTruthy();
    fireEvent.press(getByLabelText(`${label}. Opens the Arena tab`));
    expect(onPress).toHaveBeenCalledWith(tile);
    expect(JSON.stringify(toJSON())).not.toMatch(/bg-cta|text-cta|border-cta|negative/);
  });

  it("See all is a button labelled for the Matches tab", () => {
    const tile: ReelTileModel = { kind: "see_all", key: "see_all" };
    const { getByText, getByLabelText, onPress } = renderTile(tile);
    expect(getByText("See all")).toBeTruthy();
    fireEvent.press(getByLabelText("See all, open Matches"));
    expect(onPress).toHaveBeenCalledWith(tile);
  });

  it("a skeleton tile is hidden from VoiceOver and not pressable", () => {
    const { getByTestId } = renderTile({ kind: "skeleton", key: "s" });
    const tile = getByTestId("tile", hidden);
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(tile.props.onPress).toBeUndefined();
  });
});

describe("tile sizes", () => {
  it("Home tiles are 104 x 185 and Matches tiles 96 x 171, framed by a 2 px ring and a 2 px gap", () => {
    const { REEL_TILE_SIZE, tileColumnWidth } = require("@/components/reels/reel-tile-frame") as typeof import("@/components/reels/reel-tile-frame");
    expect(REEL_TILE_SIZE.home).toEqual({ width: 104, height: 185 });
    expect(REEL_TILE_SIZE.matches).toEqual({ width: 96, height: 171 });
    expect(tileColumnWidth("home")).toBe(112);
    expect(tileColumnWidth("matches")).toBe(104);
    // Every tile clears the 44 pt target in both dimensions.
    for (const s of Object.values(REEL_TILE_SIZE)) {
      expect(s.width).toBeGreaterThanOrEqual(44);
      expect(s.height).toBeGreaterThanOrEqual(44);
    }
  });
});
