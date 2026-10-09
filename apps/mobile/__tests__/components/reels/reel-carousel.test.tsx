/**
 * ReelCarousel (specs/matches-tab 5, 7.2, 10.5): renders nothing with no
 * tiles, list semantics and the title, tap routing per tile kind, the pager
 * items and start index handed to onOpenReel (building, ghost, CTA and See
 * all excluded), the building-to-ready reveal (one pulse, one success
 * haptic, focused only), the once-per-session first-unseen pulse on Home, and
 * Reduce Motion. Tiles come from the real `buildLaneTiles`, so the ghost / CTA
 * rules are exercised end to end.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockBlur: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react");
    R.useEffect(() => {
      const cleanup = cb();
      mockBlur = typeof cleanup === "function" ? cleanup : undefined;
      return cleanup;
    }, [cb]);
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
const mockRunPulse = jest.fn();
const mockRunReveal = jest.fn();
jest.mock("@/components/reels/reel-motion", () => ({
  RING_PULSE_SCALE: 1.04,
  runRingPulse: (...a: unknown[]) => mockRunPulse(...a),
  runReveal: (...a: unknown[]) => mockRunReveal(...a),
  runShimmer: jest.fn(),
}));
const mockRevealHaptic = jest.fn(() => Promise.resolve());
jest.mock("@/lib/motion/haptics", () => ({ haptics: { reelRevealed: () => mockRevealHaptic() } }));

import { ReelCarousel } from "@/components/reels/reel-carousel";
import { buildLaneTiles, __resetSessionPulses, type ReelTileModel } from "@/lib/highlight/reel-lane";
import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import { __setReduceMotionForTests } from "@/lib/motion";
import { reelItem, buildingReel } from "../../support/reel-tile-fixtures";

const hidden = { includeHiddenElements: true };

function tilesFor(laneKey: ReelLaneKey, over: Partial<Parameters<typeof buildLaneTiles>[0]> = {}): ReelTileModel[] {
  return buildLaneTiles({ laneKey, items: [], building: [], clipsEnabled: true, loading: false, hasMore: false, matchCount: 5, ...over });
}

function renderCarousel(tiles: ReelTileModel[], laneKey: ReelLaneKey = "home") {
  const onOpenReel = jest.fn();
  const onCtaPress = jest.fn();
  const utils = render(<ReelCarousel title="Highlights" laneKey={laneKey} tiles={tiles} onOpenReel={onOpenReel} onCtaPress={onCtaPress} />);
  const rerenderTiles = (next: ReelTileModel[]) =>
    utils.rerender(<ReelCarousel title="Highlights" laneKey={laneKey} tiles={next} onOpenReel={onOpenReel} onCtaPress={onCtaPress} />);
  return { ...utils, onOpenReel, onCtaPress, rerenderTiles };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetSessionPulses();
  act(() => __setReduceMotionForTests(false));
});

describe("ReelCarousel", () => {
  it("renders nothing with no tiles (clips off or a failed read)", () => {
    expect(buildLaneTiles({ laneKey: "home", items: [], building: [], clipsEnabled: false, loading: false, hasMore: false })).toEqual([]);
    const { toJSON } = renderCarousel([]);
    expect(toJSON()).toBeNull();
  });

  it("is a list titled by its lane, testID per lane key", () => {
    const { getByTestId, getByText, getByLabelText } = renderCarousel(tilesFor("home", { items: [reelItem("a")] }));
    expect(getByTestId("reel-carousel-home")).toBeTruthy();
    expect(getByText("Highlights")).toBeTruthy();
    expect(getByLabelText("Highlights").props.accessibilityRole).toBe("list");
  });

  it("opens a ready tile with the ready items only and its index among them", () => {
    const items: ReelItem[] = [reelItem("a", { unseen: true }), reelItem("b"), reelItem("c")];
    const tiles = tilesFor("home", { items, building: [buildingReel("m-z")] });
    expect(tiles.map((t) => t.kind)).toEqual(["building", "ready", "ready", "ready"]);
    const { getByTestId, onOpenReel } = renderCarousel(tiles);
    fireEvent.press(getByTestId("reel-tile-ready:c"));
    expect(onOpenReel).toHaveBeenCalledWith(items, 2, "home");
  });

  it("a short shelf (Q7) appends one C-L5 ghost, which is not a page and not pressable", () => {
    const items = [reelItem("a"), reelItem("b")];
    const tiles = tilesFor("matches", { items });
    expect(tiles.map((t) => t.kind)).toEqual(["ready", "ready", "ghost"]);
    const { getByLabelText, getByTestId, onOpenReel } = renderCarousel(tiles, "matches");
    fireEvent.press(getByLabelText("Record your next match to get a highlight"));
    expect(onOpenReel).not.toHaveBeenCalled();
    fireEvent.press(getByTestId("reel-tile-ready:b"));
    expect(onOpenReel).toHaveBeenCalledWith(items, 1, "matches");
    // Three or more reels: no ghost.
    expect(tilesFor("matches", { items: [...items, reelItem("c")] }).some((t) => t.kind === "ghost")).toBe(false);
  });

  it("a mixed own and friend list (with building and ghost tiles) keeps onOpenReel indexes among ready tiles", () => {
    const items: ReelItem[] = [
      reelItem("own1", { unseen: true }),
      reelItem("fr1", { source: "friend", isOwn: false, opponentName: "S. Whitfield" }),
    ];
    const tiles = tilesFor("home", { items, building: [buildingReel("m-z")] });
    expect(tiles.map((t) => t.kind)).toEqual(["building", "ready", "ready", "ghost"]);
    const { getByTestId, getByText, onOpenReel } = renderCarousel(tiles);
    expect(getByText("FRIEND")).toBeTruthy();
    fireEvent.press(getByTestId("reel-tile-ready:fr1"));
    expect(onOpenReel).toHaveBeenCalledWith(items, 1, "home");
  });

  it("a building tile opens match detail (Film status), never the viewer", () => {
    const { getByTestId, onOpenReel } = renderCarousel(tilesFor("home", { items: [reelItem("a")], building: [buildingReel("m-9")] }));
    fireEvent.press(getByTestId("reel-tile-building:m-9"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-9");
    expect(onOpenReel).not.toHaveBeenCalled();
  });

  it("zero matches on Home: the C-HZ1 CTA switches to the Arena tab (host notified), then the C-Z2 ghost", () => {
    const tiles = tilesFor("home", { matchCount: 0 });
    expect(tiles.map((t) => t.kind)).toEqual(["cta", "ghost"]);
    const { getByLabelText, onCtaPress } = renderCarousel(tiles);
    expect(getByLabelText("Your first highlight lands here")).toBeTruthy();
    fireEvent.press(getByLabelText("Get your first highlight. Opens the Arena tab"));
    expect(mockNavigate).toHaveBeenCalledWith("/arena");
    expect(onCtaPress).toHaveBeenCalledWith(tiles[0]);
  });

  it("no reels on Matches: one C-L5 ghost and two faint ghosts", () => {
    const tiles = tilesFor("matches");
    expect(tiles.map((t) => (t.kind === "ghost" ? `ghost${t.faint ? "-faint" : ""}` : t.kind))).toEqual(["ghost", "ghost-faint", "ghost-faint"]);
    const { getAllByLabelText } = renderCarousel(tiles, "matches");
    expect(getAllByLabelText("Record your next match to get a highlight")).toHaveLength(1);
  });

  it("Home with more than 10 reels ends in See all, which switches to the Matches tab", () => {
    const items = Array.from({ length: 11 }, (_, i) => reelItem(`r${i}`));
    const tiles = tilesFor("home", { items });
    expect(tiles.filter((t) => t.kind === "ready")).toHaveLength(10);
    expect(tiles[tiles.length - 1].kind).toBe("see_all");
    const { getByLabelText } = renderCarousel(tiles);
    fireEvent.press(getByLabelText("See all, open Film"));
    expect(mockNavigate).toHaveBeenCalledWith("/(app)/(tabs)/matches?entry=see_all");
  });

  it("loading shows the lane's skeleton count (3 on Home)", () => {
    const tiles = tilesFor("home", { loading: true });
    const { getAllByTestId } = renderCarousel(tiles);
    expect(getAllByTestId(/^reel-tile-skeleton:/, hidden)).toHaveLength(3);
  });
});

describe("moments", () => {
  it("Home: the first unseen tile pulses once per session, not on a re-render or a remount", () => {
    const tiles = tilesFor("home", { items: [reelItem("a"), reelItem("b", { unseen: true }), reelItem("c", { unseen: true })] });
    const first = renderCarousel(tiles);
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    first.rerenderTiles([...tiles]);
    first.unmount();
    renderCarousel(tiles);
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    expect(mockRevealHaptic).not.toHaveBeenCalled();
  });

  it("Home: the first-unseen pulse fires once per session in total, not once per reel", () => {
    const first = renderCarousel(tilesFor("home", { items: [reelItem("a", { unseen: true })] }));
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    first.unmount();
    // A different unseen reel later in the session does not pulse.
    renderCarousel(tilesFor("home", { items: [reelItem("b", { unseen: true }), reelItem("a")] }));
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
  });

  it("Matches: no first-unseen pulse", () => {
    renderCarousel(tilesFor("matches", { items: [reelItem("a", { unseen: true })] }), "matches");
    expect(mockRunPulse).not.toHaveBeenCalled();
  });

  it("a building tile that lands as ready cross-fades in with one pulse and one success haptic", () => {
    const before = tilesFor("matches", { items: [reelItem("a")], building: [buildingReel("m-new")] });
    const utils = renderCarousel(before, "matches");
    expect(mockRevealHaptic).not.toHaveBeenCalled();

    const landed = reelItem("n", { matchId: "m-new", unseen: true });
    utils.rerenderTiles(tilesFor("matches", { items: [landed, reelItem("a")] }));
    expect(mockRevealHaptic).toHaveBeenCalledTimes(1);
    expect(mockRunReveal).toHaveBeenCalledTimes(1);
    expect(mockRunPulse).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("reel-tile-ring", hidden)).toBeTruthy();

    // The same list again is not a second landing.
    utils.rerenderTiles(tilesFor("matches", { items: [landed, reelItem("a")] }));
    expect(mockRevealHaptic).toHaveBeenCalledTimes(1);
  });

  it("under Reduce Motion: no pulse and no fade, but the reveal haptic still fires", () => {
    act(() => __setReduceMotionForTests(true));
    const utils = renderCarousel(tilesFor("home", { items: [reelItem("a", { unseen: true })], building: [buildingReel("m-new")] }));
    utils.rerenderTiles(tilesFor("home", { items: [reelItem("n", { matchId: "m-new", unseen: true }), reelItem("a", { unseen: true })] }));
    expect(mockRevealHaptic).toHaveBeenCalledTimes(1);
    expect(mockRunPulse).not.toHaveBeenCalled();
    expect(mockRunReveal).not.toHaveBeenCalled();
    act(() => __setReduceMotionForTests(false));
  });

  it("no reveal while the screen is not focused", () => {
    const utils = renderCarousel(tilesFor("matches", { items: [reelItem("a")], building: [buildingReel("m-new")] }), "matches");
    act(() => mockBlur?.());
    utils.rerenderTiles(tilesFor("matches", { items: [reelItem("n", { matchId: "m-new" }), reelItem("a")] }));
    expect(mockRevealHaptic).not.toHaveBeenCalled();
    expect(mockRunReveal).not.toHaveBeenCalled();
  });
});
