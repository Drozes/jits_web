/**
 * The lane hosts (specs/matches-tab 6.1, 7, 13): MatchesReelCarousel builds
 * its tiles from a lane result (title C-M2, paging, hidden with clips off or a
 * failed read), both hosts open through the one `openReelFromLane` seam,
 * clear the ring at once, and log `home_card_tapped` / `matches_reel_tapped`.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react");
    R.useEffect(() => cb(), [cb]);
  },
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t, prop) => (prop === "__esModule" ? true : () => R.createElement(RN.View)) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/components/reels/reel-motion", () => ({ runRingPulse: jest.fn(), runReveal: jest.fn(), runShimmer: jest.fn() }));
jest.mock("@/lib/motion/haptics", () => ({ haptics: { reelRevealed: jest.fn(() => Promise.resolve()) } }));
const mockLog = jest.fn();
jest.mock("@/lib/highlight/highlight-event", () => ({ logHighlightEvent: (...a: unknown[]) => mockLog(...a) }));

import { HomeHighlightsCarousel, MatchesReelCarousel } from "@/components/reels/lane-carousels";
import { openReelFromLane } from "@/components/reels/open-reel";
import { buildLaneTiles } from "@/lib/highlight/reel-lane";
import type { UseReelLaneResult } from "@/lib/highlight/use-reel-lane";
import { reelItem } from "../../support/reel-tile-fixtures";

function lane(over: Partial<UseReelLaneResult> = {}): UseReelLaneResult {
  return {
    items: [],
    inFlight: [],
    clipsEnabled: true,
    loading: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    loadingMore: false,
    cursor: null,
    loadMore: jest.fn(),
    refetch: jest.fn(),
    markSeenLocally: jest.fn(),
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("openReelFromLane (the viewer seam)", () => {
  it("opens the reel at startIndex on the single-reel route with the lane as source", () => {
    const router = { push: jest.fn() };
    const items = [reelItem("a"), reelItem("b")];
    expect(openReelFromLane(router, { items, startIndex: 1, lane: "matches" })).toBe(true);
    expect(router.push).toHaveBeenCalledWith("/highlight/b?source=matches");
    expect(openReelFromLane(router, { items, startIndex: 5, lane: "home" })).toBe(false);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe("MatchesReelCarousel", () => {
  it("titles itself Your highlights and opens a reel with matches_reel_tapped", () => {
    const l = lane({ items: [reelItem("a", { unseen: true }), reelItem("b"), reelItem("c")] });
    const { getByText, getByTestId } = render(<MatchesReelCarousel lane={l} />);
    expect(getByText("Your highlights")).toBeTruthy();
    fireEvent.press(getByTestId("reel-tile-ready:a"));
    expect(mockPush).toHaveBeenCalledWith("/highlight/a?source=matches");
    expect(mockLog).toHaveBeenCalledWith("a", "matches_reel_tapped", { source: "matches", position: 0, unseen: true });
    expect(l.markSeenLocally).toHaveBeenCalledWith("a");
  });

  it("is hidden with clips off and after a failed read with nothing cached", () => {
    expect(render(<MatchesReelCarousel lane={lane({ clipsEnabled: false })} />).toJSON()).toBeNull();
    expect(
      render(<MatchesReelCarousel lane={lane({ error: { code: "UNKNOWN", message: "offline" } })} />).toJSON(),
    ).toBeNull();
  });

  it("zero matches picks the first-highlight ghosts", () => {
    const { getByLabelText } = render(<MatchesReelCarousel lane={lane()} matchCount={0} />);
    expect(getByLabelText("Your first highlight lands here")).toBeTruthy();
  });

  it("pages near the end only when more exist and no load is running or failed", () => {
    const items = [reelItem("a"), reelItem("b"), reelItem("c")];
    const more = lane({ items, hasMore: true });
    const list = render(<MatchesReelCarousel lane={more} />).getByLabelText("Your highlights");
    expect(list.props.onEndReached).toBeDefined();
    const busy = render(<MatchesReelCarousel lane={lane({ items, hasMore: true, loadingMore: true })} />).getAllByLabelText("Your highlights");
    expect(busy[0].props.onEndReached).toBeUndefined();
  });
});

describe("HomeHighlightsCarousel", () => {
  it("opens a reel with home_card_tapped (surface carousel, position, unseen, reel_source)", () => {
    const items = [reelItem("a"), reelItem("b", { unseen: true })];
    const tiles = buildLaneTiles({ laneKey: "home", items, building: [], clipsEnabled: true, loading: false, hasMore: false });
    const markSeen = jest.fn();
    const { getByText, getByTestId } = render(<HomeHighlightsCarousel tiles={tiles} markSeenLocally={markSeen} />);
    expect(getByText("Highlights")).toBeTruthy();
    fireEvent.press(getByTestId("reel-tile-ready:b"));
    expect(mockPush).toHaveBeenCalledWith("/highlight/b?source=home");
    expect(mockLog).toHaveBeenCalledWith("b", "home_card_tapped", {
      source: "home",
      surface: "carousel",
      position: 1,
      unseen: true,
      reel_source: "own",
    });
    expect(markSeen).toHaveBeenCalledWith("b");
  });

  it("renders nothing with no tiles", () => {
    expect(render(<HomeHighlightsCarousel tiles={[]} markSeenLocally={jest.fn()} />).toJSON()).toBeNull();
  });
});
