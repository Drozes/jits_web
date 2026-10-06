/**
 * The lane hosts (specs/matches-tab 6.1, 7, 13): MatchesReelCarousel builds
 * its tiles from a lane result (title C-M2, paging, hidden with clips off or a
 * failed read), both hosts open the swipe viewer through the one
 * `openReelFromLane` seam (ready items only, the right index, the lane's
 * `loadMore`), clear the ring at once, and log `home_card_tapped` /
 * `matches_reel_tapped`. `laneLoadMore` pages past the tiles.
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
const mockOpenViewer = jest.fn();
jest.mock("@/lib/highlight/reel-viewer-session", () => ({ openReelViewer: (...a: unknown[]) => mockOpenViewer(...a) }));
const mockFetchPage = jest.fn();
jest.mock("@/lib/highlight/use-reel-lane", () => ({ fetchReelPage: (...a: unknown[]) => mockFetchPage(...a) }));
const mockLog = jest.fn();
jest.mock("@/lib/highlight/highlight-event", () => ({ logHighlightEvent: (...a: unknown[]) => mockLog(...a) }));

import { HomeHighlightsCarousel, MatchesReelCarousel, matchesLaneTiles } from "@/components/reels/lane-carousels";
import { laneLoadMore, openReelFromLane } from "@/components/reels/open-reel";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenViewer.mockReturnValue("tok");
});

describe("openReelFromLane (the viewer seam)", () => {
  it("opens the swipe viewer at startIndex with the lane and its loadMore", () => {
    const router = { push: jest.fn() };
    const items = [reelItem("a"), reelItem("b")];
    const loadMore = jest.fn();
    expect(openReelFromLane(router, { items, startIndex: 1, lane: "matches", loadMore })).toBe(true);
    expect(mockOpenViewer).toHaveBeenCalledWith({ items, startIndex: 1, lane: "matches", loadMore });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("falls back to the single-reel route only when the viewer declines", () => {
    mockOpenViewer.mockReturnValue(null);
    const router = { push: jest.fn() };
    const items = [reelItem("a"), reelItem("b")];
    expect(openReelFromLane(router, { items, startIndex: 1, lane: "home" })).toBe(true);
    expect(router.push).toHaveBeenCalledWith("/highlight/b?source=home");
    expect(openReelFromLane(router, { items, startIndex: 5, lane: "home" })).toBe(false);
  });
});

describe("laneLoadMore", () => {
  const cursor = { before: "2026-10-06T10:00:00.123456+00:00", beforeId: "x" };

  it("is undefined when the lane holds nothing more", () => {
    expect(laneLoadMore([reelItem("a")], { loaded: [reelItem("a")], cursor: null, viewerId: "me" })).toBeUndefined();
  });

  it("first hands over loaded reels past the tiles, then pages from the cursor, then reports exhaustion", async () => {
    const shown = [reelItem("a"), reelItem("b")];
    const loaded = [...shown, reelItem("c")];
    mockFetchPage
      .mockResolvedValueOnce({ items: [reelItem("c")], cursor: { before: "t2", beforeId: "c" } }) // all known: skipped
      .mockResolvedValueOnce({ items: [reelItem("d"), reelItem("e")], cursor: null });
    const more = laneLoadMore(shown, { loaded, cursor, viewerId: "me" })!;
    expect((await more()).map((i) => i.highlightId)).toEqual(["c"]);
    expect(mockFetchPage).not.toHaveBeenCalled();
    expect((await more()).map((i) => i.highlightId)).toEqual(["d", "e"]);
    expect(mockFetchPage).toHaveBeenNthCalledWith(1, cursor, undefined, "me");
    expect(mockFetchPage).toHaveBeenNthCalledWith(2, { before: "t2", beforeId: "c" }, undefined, "me");
    expect(await more()).toEqual([]);
  });

  it("rejects on a failed read and retries from the same cursor", async () => {
    mockFetchPage.mockResolvedValueOnce(null).mockResolvedValueOnce({ items: [reelItem("z")], cursor: null });
    const more = laneLoadMore([reelItem("a")], { loaded: [reelItem("a")], cursor, viewerId: null })!;
    await expect(more()).rejects.toThrow();
    expect((await more()).map((i) => i.highlightId)).toEqual(["z"]);
    expect(mockFetchPage).toHaveBeenLastCalledWith(cursor, undefined, null);
  });
});

describe("MatchesReelCarousel", () => {
  it("titles itself Your highlights and opens a reel with matches_reel_tapped", () => {
    const l = lane({ items: [reelItem("a", { unseen: true }), reelItem("b"), reelItem("c")] });
    const { getByText, getByTestId } = render(<MatchesReelCarousel lane={l} viewerId="me" />);
    expect(getByText("Your highlights")).toBeTruthy();
    fireEvent.press(getByTestId("reel-tile-ready:a"));
    expect(mockOpenViewer).toHaveBeenCalledWith(expect.objectContaining({ items: l.items, startIndex: 0, lane: "matches" }));
    expect(mockPush).not.toHaveBeenCalled();
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

  it("keeps the skeletons while the match count is loading, instead of flashing the wrong ghosts", () => {
    expect(matchesLaneTiles(lane(), "loading").map((t) => t.kind)).toEqual(["skeleton", "skeleton", "skeleton", "skeleton"]);
    const { getByLabelText, queryByLabelText } = render(<MatchesReelCarousel lane={lane()} matchCount="loading" />);
    expect(getByLabelText("Loading")).toBeTruthy();
    expect(queryByLabelText("Record your next match to get a highlight")).toBeNull();
    // Reels already loaded draw at once.
    expect(matchesLaneTiles(lane({ items: [reelItem("a"), reelItem("b"), reelItem("c")] }), "loading").map((t) => t.kind)).toEqual(["ready", "ready", "ready"]);
    // A failed lane read still hides it (no skeleton forever).
    expect(render(<MatchesReelCarousel lane={lane({ error: { code: "UNKNOWN", message: "x" } })} matchCount="loading" />).toJSON()).toBeNull();
  });

  it("the Matches lane never draws a CTA tile (its CTAs live in the hero)", () => {
    expect(matchesLaneTiles(lane(), 0).some((t) => t.kind === "cta")).toBe(false);
    expect(matchesLaneTiles(lane(), 2).some((t) => t.kind === "cta")).toBe(false);
  });

  it("pages near the end only when more exist and no load is running or failed", () => {
    const items = [reelItem("a"), reelItem("b"), reelItem("c")];
    const more = lane({ items, hasMore: true });
    const list = render(<MatchesReelCarousel lane={more} />).getByLabelText("Your highlights");
    expect(list.props.onEndReached).toBeDefined();
    const busy = render(<MatchesReelCarousel lane={lane({ items, hasMore: true, loadingMore: true })} />).getAllByLabelText("Your highlights");
    expect(busy[busy.length - 1].props.onEndReached).toBeUndefined();
    // After a failed page, scrolling on retries (the hook guards a running load).
    const failed = render(
      <MatchesReelCarousel lane={lane({ items, hasMore: true, loadMoreError: { code: "UNKNOWN", message: "x" } })} />,
    ).getAllByLabelText("Your highlights");
    expect(failed[failed.length - 1].props.onEndReached).toBeDefined();
  });
});

describe("HomeHighlightsCarousel", () => {
  it("opens a reel with home_card_tapped (surface carousel, position, unseen, reel_source)", () => {
    const items = [reelItem("a"), reelItem("b", { unseen: true })];
    const tiles = buildLaneTiles({ laneKey: "home", items, building: [], clipsEnabled: true, loading: false, hasMore: false });
    const markSeen = jest.fn();
    const pageSource = { loaded: items, cursor: { before: "t", beforeId: "b" }, viewerId: "me" };
    const { getByText, getByTestId } = render(<HomeHighlightsCarousel tiles={tiles} pageSource={pageSource} markSeenLocally={markSeen} />);
    expect(getByText("Highlights")).toBeTruthy();
    fireEvent.press(getByTestId("reel-tile-ready:b"));
    expect(mockOpenViewer).toHaveBeenCalledWith({ items, startIndex: 1, lane: "home", loadMore: expect.any(Function) });
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
    const pageSource = { loaded: [], cursor: null, viewerId: null };
    expect(render(<HomeHighlightsCarousel tiles={[]} pageSource={pageSource} markSeenLocally={jest.fn()} />).toJSON()).toBeNull();
  });
});
