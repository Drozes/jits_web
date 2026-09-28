/**
 * Profile "Highlights" row (jits-s6mi.14, spec 015 section 16.6.5): hidden
 * when empty or clips are off, 9:16 tiles with a NEW tag while unseen and a
 * mono duration badge, tap -> viewer with source=profile + profile_row_tapped,
 * a horizontal scroll that bleeds to the edge with a 16 pt gutter.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockLog = jest.fn(() => Promise.resolve());
jest.mock("@jits/shared/api/highlight-share", () => ({
  logHighlightShareEvent: (...a: unknown[]) => mockLog(...(a as [])),
}));

import { HighlightsRow, HIGHLIGHTS_ROW_GUTTER } from "@/components/profile/highlights-row";
import { HIGHLIGHT_TILE_WIDTH } from "@/components/profile/highlight-tile";
import type { ProfileHighlight } from "@/lib/highlight/use-my-highlights";

function item(id: string, over: Partial<ProfileHighlight> = {}): ProfileHighlight {
  return {
    highlightId: id,
    matchId: `m-${id}`,
    matchVideoId: `v-${id}`,
    version: 1,
    durationS: 31.4,
    posterPath: `p/${id}.jpg`,
    posterUrl: `https://signed/${id}.jpg`,
    readyAt: "2026-09-27T10:00:00Z",
    opponentName: "Bea",
    matchType: "ranked",
    outcome: "win",
    playedAt: "2026-09-27T09:00:00Z",
    notifiedAt: null,
    unseen: false,
    origin: null,
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("HighlightsRow", () => {
  it("renders nothing with no items", () => {
    const utils = render(<HighlightsRow items={[]} clipsEnabled />);
    expect(utils.toJSON()).toBeNull();
  });

  it("renders nothing with clips disabled, even with items", () => {
    const utils = render(<HighlightsRow items={[item("a")]} clipsEnabled={false} />);
    expect(utils.toJSON()).toBeNull();
  });

  it("section title, tiles in order, NEW only while unseen, mono duration, a11y label", () => {
    const utils = render(
      <HighlightsRow items={[item("a", { unseen: true }), item("b", { opponentName: null, durationS: 8.6 })]} clipsEnabled />,
    );
    expect(utils.getByText("Highlights")).toBeTruthy();
    expect(utils.getByTestId("highlight-tile-new-a")).toHaveTextContent("NEW");
    expect(utils.queryByTestId("highlight-tile-new-b")).toBeNull();
    expect(utils.getByLabelText("Highlight vs Bea, 31 seconds")).toBeTruthy();
    expect(utils.getByLabelText("Highlight, 9 seconds")).toBeTruthy();
    const badge = utils.getByText("31s");
    expect(badge.props.className).toContain("font-mono");
    expect(badge.props.style).toEqual({ fontVariant: ["tabular-nums"] });
    expect(utils.getByTestId("highlight-tile-poster-a").props.source.uri).toBe("https://signed/a.jpg");
    const tile = utils.getByTestId("highlight-tile-a");
    expect(tile.props.style).toEqual({ width: HIGHLIGHT_TILE_WIDTH, height: Math.round((96 * 16) / 9) });
    expect(HIGHLIGHT_TILE_WIDTH).toBe(96);
  });

  it("a tile without a poster still renders (no image)", () => {
    const utils = render(<HighlightsRow items={[item("a", { posterUrl: null })]} clipsEnabled />);
    expect(utils.queryByTestId("highlight-tile-poster-a")).toBeNull();
    expect(utils.getByTestId("highlight-tile-a")).toBeTruthy();
  });

  it("tap -> viewer with source=profile, profile_row_tapped logged, NEW cleared via onOpen", () => {
    const onOpen = jest.fn();
    const utils = render(<HighlightsRow items={[item("a", { unseen: true })]} clipsEnabled onOpen={onOpen} />);
    fireEvent.press(utils.getByTestId("highlight-tile-a"));
    expect(mockPush).toHaveBeenCalledWith("/highlight/a?source=profile");
    expect(mockLog).toHaveBeenCalledWith({}, "a", "profile_row_tapped", expect.objectContaining({ source: "profile", platform: expect.any(String), os_version: expect.any(String) }));
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("horizontal scroll: no indicator, bleeds to the edge with a 16 pt gutter (no page overflow)", () => {
    const utils = render(<HighlightsRow items={[item("a"), item("b")]} clipsEnabled />);
    const scroll = utils.getByTestId("profile-highlights-scroll");
    expect(scroll.props.horizontal).toBe(true);
    expect(scroll.props.showsHorizontalScrollIndicator).toBe(false);
    expect(HIGHLIGHTS_ROW_GUTTER).toBe(16);
    expect(scroll.props.style).toEqual({ marginHorizontal: -16 });
    expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: 16, gap: 8 });
  });
});
