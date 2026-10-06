/**
 * The shorts-style swipe pager (jits-a4fw.5, spec 8.3 / 8.6 / 8.7): opens at
 * the tapped reel, exactly three pooled players, only the visible page plays,
 * swipes land through momentum end, prefetch, telemetry (`viewer_opened` once
 * per reel with `swiped` and `layout`, `viewer_swiped` with `first_frame_ms`
 * and `prefetched`), seen marking, the swipe hint, the end of the list, the
 * ownership rule on a non-own item, sheets suspending paging, and the route's
 * pager / single-reel choice.
 */
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("expo-video", () => require("../../support/fake-expo-video"));
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = require("react");
    R.useEffect(cb, [cb]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});
const mockImagePrefetch = jest.fn(() => Promise.resolve(true));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  const Image = (props: Record<string, unknown>) => R.createElement(RN.View, props);
  Image.prefetch = (...a: unknown[]) => mockImagePrefetch(...(a as []));
  return { Image };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textPrimary: "#E8EDF2", textTertiary: "#8D929D" }) }));
jest.mock("@/lib/theme/theme-provider", () => ({ darkVarsStyle: {} }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/video/use-playback-telemetry", () => ({
  usePlaybackTelemetry: () => ({ sourceAttached: jest.fn(), resigned: jest.fn(), playIntent: jest.fn(), firstFrame: jest.fn() }),
}));
jest.mock("@/lib/video/upload-strip-visibility", () => ({ useSuppressUploadStrip: () => undefined }));
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef((props: { children: React.ReactNode; onChange?: (i: number) => void }, ref: unknown) => {
    const [shown, setShown] = R.useState(false);
    R.useImperativeHandle(ref, () => ({ present: () => setShown(true), dismiss: () => { setShown(false); props.onChange?.(-1); } }));
    return shown ? R.createElement(RN.View, { testID: "sheet" }, props.children) : null;
  });
  return {
    BottomSheetModal,
    BottomSheetView: (p: { children: React.ReactNode }) => R.createElement(RN.View, {}, p.children),
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: (p: Record<string, unknown>) => R.createElement(RN.TextInput, p),
  };
});

const mockProgressCache = new Map<string, unknown>();
function mockProgressFor(mv: string) {
  if (!mockProgressCache.has(mv)) {
    const playback = { storagePath: `${mv}.mp4`, posterPath: `${mv}.jpg`, durationS: 28, version: 1, segments: [], readyAt: "2026-10-04T12:00:00Z" };
    mockProgressCache.set(mv, { matchVideoId: mv, phase: "ready", highlightId: `h${mv.slice(1)}`, renderTotal: 1, playback, canRegenerate: true });
  }
  return mockProgressCache.get(mv);
}
const mockRefresh = jest.fn();
jest.mock("@jits/shared/hooks/use-highlight-progress", () => ({
  useHighlightProgress: (_s: unknown, mv: string | null) => ({ data: mv ? mockProgressFor(mv) : null, loading: false, error: null, refresh: mockRefresh }),
}));
const mockSign = jest.fn((_s: unknown, p: { storagePath: string; version: number }) =>
  Promise.resolve({ ok: true, data: { url: `https://signed/${p.storagePath}`, posterUrl: null, version: p.version, durationS: 28 } }),
);
const mockGetProgress = jest.fn((_s: unknown, mv: string) => Promise.resolve({ ok: true, data: mockProgressFor(mv) }));
jest.mock("@jits/shared/api/highlights", () => ({
  signHighlightPlayback: (...a: unknown[]) => mockSign(...(a as [unknown, { storagePath: string; version: number }])),
  getHighlightProgress: (...a: unknown[]) => mockGetProgress(...(a as [unknown, string])),
  submitHighlightFeedback: jest.fn(),
  regenerateHighlight: jest.fn(),
  retryHighlightRender: jest.fn(),
}));
const mockMarkSeen = jest.fn(() => Promise.resolve({ ok: true, data: null }));
jest.mock("@jits/shared/api/highlight-share", () => ({
  getHighlightDetail: (_s: unknown, id: string) =>
    Promise.resolve({
      ok: true,
      data: {
        highlightId: id,
        matchVideoId: `v${id.slice(1)}`,
        matchId: `m${id.slice(1)}`,
        version: 1,
        clipsEnabled: true,
        shareEnabled: true,
        caption: { athleteName: "Me", opponentName: `Opp ${id.slice(1)}`, matchType: "ranked", outcome: "win", eloAfter: 1, eloDelta: 1, technique: null, playedAt: "2026-10-04T15:00:00Z" },
      },
    }),
  markHighlightSeen: (...a: unknown[]) => mockMarkSeen(...(a as [])),
  logHighlightShareEvent: jest.fn(() => Promise.resolve()),
  getMyHighlights: jest.fn(),
}));
const mockTrack = jest.fn();
const mockStart = jest.fn();
jest.mock("@/lib/highlight-share", () => ({
  ...jest.requireActual("@/lib/highlight-share"),
  useHighlightShare: () => ({
    activePath: "reels",
    capabilities: { reels: true, shareSheet: true, saveToPhotos: true, clipboard: false, facebookAppIdConfigured: true },
    primaryPath: "reels",
    stage: "idle",
    progress: null,
    error: null,
    caption: "c",
    collabTip: "t",
    start: mockStart,
    handoff: jest.fn(),
    saveToPhotos: jest.fn(),
    copyCaption: jest.fn(),
    reset: jest.fn(),
  }),
  sweepShareCache: () => Promise.resolve(),
  track: (...a: unknown[]) => mockTrack(...a),
}));

import { bufferEnd, fakePlayers, resetFakeVideo } from "../../support/fake-expo-video";
import { Platform } from "react-native";
import { ReelPager } from "@/components/highlight-viewer/reel-pager";
import HighlightViewerRoute from "@/app/(app)/highlight/[id]";
import { __resetReelSessionsForTests, createReelSession, type ReelViewerSession } from "@/lib/highlight/reel-viewer-session";
import { __resetReelPrefsForTests, REEL_MUTED_KEY, REEL_SWIPE_HINT_KEY } from "@/lib/highlight/reel-prefs";
import { resetReelPrefetch } from "@/lib/highlight/reel-prefetch";
import type { ReelItem } from "@/lib/highlight/reel-types";
import { reel } from "../../support/reel-fixtures";

const H = 800;

async function flush(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

function session(items: ReelItem[], startIndex = 0, loadMore?: () => Promise<ReelItem[]>): ReelViewerSession {
  return createReelSession({ items, startIndex, lane: "home", loadMore })!;
}

async function open(s: ReelViewerSession) {
  const utils = render(<ReelPager session={s} />);
  fireEvent(utils.getByTestId("reel-pager"), "layout", { nativeEvent: { layout: { width: 390, height: H } } });
  await flush();
  return utils;
}

function list(utils: ReturnType<typeof render>) {
  return utils.getByTestId("reel-pager-list");
}

async function swipeTo(utils: ReturnType<typeof render>, index: number) {
  const count = list(utils).props.data.length;
  // Let the list render the window around the new offset, as a real scroll would.
  fireEvent(list(utils), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: H } } });
  fireEvent(list(utils), "contentSizeChange", 390, count * H);
  fireEvent.scroll(list(utils), {
    nativeEvent: { contentOffset: { x: 0, y: index * H }, contentSize: { width: 390, height: count * H }, layoutMeasurement: { width: 390, height: H } },
  });
  // VirtualizedList batches window updates (updateCellsBatchingPeriod).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  await flush();
  await act(async () => {
    list(utils).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: index * H } } });
  });
  await flush();
}

function steps(step: string) {
  return mockTrack.mock.calls.filter((c) => c[1] === step);
}

/** Pool players: the pager's three useVideoPlayer calls. */
function pool() {
  return fakePlayers.slice(0, 3);
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetFakeVideo();
  resetReelPrefetch();
  __resetReelSessionsForTests();
  __resetReelPrefsForTests();
  await AsyncStorage.clear();
});

describe("ReelPager", () => {
  it("opens at the tapped reel with exactly three players, only the visible page playing", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3), reel(4)], 1));
    expect(list(utils).props.initialScrollIndex).toBe(1);
    expect(list(utils).props.pagingEnabled).toBe(true);
    expect(list(utils).props.windowSize).toBe(3);
    expect(list(utils).props.getItemLayout(null, 2)).toEqual({ length: H, offset: 2 * H, index: 2 });
    expect(fakePlayers).toHaveLength(3);
    expect(utils.getByTestId("reel-page-1")).toBeTruthy();
    // index 1 is served by slot 1 (1 mod 3) and is the only one playing.
    expect(pool()[1].source?.uri ?? pool()[1].source).toBe("https://signed/v2.mp4");
    expect(pool()[1].playing).toBe(true);
    expect(pool()[0].playing).toBe(false);
    expect(pool()[2].playing).toBe(false);
  });

  it("prefetches i + 1 and i + 2 (signed, posters), nothing further, and preloads the next reel paused", async () => {
    await open(session([reel(1), reel(2), reel(3), reel(4), reel(5)], 1));
    const mvs = mockGetProgress.mock.calls.map((c) => c[1]).sort();
    expect(mvs).toEqual(["v3", "v4"]);
    expect(mockImagePrefetch.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(["https://signed/p3.jpg", "https://signed/p4.jpg"]);
    expect(pool()[2].replaceAsync).toHaveBeenCalledWith("https://signed/v3.mp4");
    expect(pool()[2].playing).toBe(false);
  });

  it("swiping back and forth costs no new progress read or sign (cached, already loaded)", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3), reel(4)], 0));
    await swipeTo(utils, 1);
    const reads = mockGetProgress.mock.calls.length;
    const signs = mockSign.mock.calls.length;
    await swipeTo(utils, 0);
    await swipeTo(utils, 1);
    expect(mockGetProgress.mock.calls.length).toBe(reads);
    expect(mockSign.mock.calls.length).toBe(signs);
  });

  it("a swipe lands on the next reel: it plays its preloaded item, the previous pauses at 0, one slot re-pointed", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3), reel(4)], 1));
    pool().forEach((p) => p.replaceAsync.mockClear());
    await swipeTo(utils, 2);
    expect(pool()[2].playing).toBe(true);
    expect(pool()[1].playing).toBe(false);
    expect(pool()[1].currentTime).toBe(0);
    expect(pool()[2].replaceAsync).not.toHaveBeenCalled();
    expect(pool()[1].replaceAsync).not.toHaveBeenCalled();
    expect(pool()[0].replaceAsync).toHaveBeenCalledWith("https://signed/v4.mp4");
    expect(fakePlayers).toHaveLength(3);
  });

  it("viewer_opened once per reel per session with layout and swiped; viewer_swiped per landing with first_frame_ms and prefetched", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3)], 0));
    expect(steps("viewer_opened")).toEqual([["h1", "viewer_opened", { source: "home", layout: "fullscreen" }]]);
    await swipeTo(utils, 1);
    expect(steps("viewer_opened")[1]).toEqual(["h2", "viewer_opened", { source: "home", layout: "fullscreen", swiped: true }]);
    // The landed reel's first frame: viewer_swiped carries the timing.
    await act(async () => {
      pool()[1].emit("playingChange", { isPlaying: true });
      pool()[1].emit("statusChange", { status: "readyToPlay" });
    });
    const swiped = steps("viewer_swiped");
    expect(swiped).toHaveLength(1);
    expect(swiped[0][2]).toMatchObject({ source: "home", direction: "next", index: 1, prefetched: true });
    expect(typeof swiped[0][2].first_frame_ms).toBe("number");
    // Back to the first reel: a landing, but not a second viewer_opened.
    await swipeTo(utils, 0);
    expect(steps("viewer_swiped")).toHaveLength(1); // pending until a frame or the next landing
    await swipeTo(utils, 1);
    expect(steps("viewer_swiped")[1][2]).toMatchObject({ direction: "previous", index: 0 });
    expect(steps("viewer_opened")).toHaveLength(2);
  });

  it("marks the visible own reel seen once; never a neighbour", async () => {
    const utils = await open(session([reel(1), reel(2)], 0));
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith({}, "h1", 1);
    await swipeTo(utils, 1);
    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen).toHaveBeenLastCalledWith({}, "h2", 1);
    await swipeTo(utils, 0);
    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
  });

  it("not yours: no Share, Save or Improve on that page, never marked seen; mute and close stay", async () => {
    const other = reel(1, { isOwn: false, source: "friend", viewerIsParticipant: false, subjectAthleteId: "ath-9", opponentName: "C. Ruiz" });
    const utils = await open(session([other], 0));
    const page = utils.getByTestId("reel-page-0");
    expect(page.findAll((n: { props: { testID?: string } }) => n.props.testID === "viewer-share")).toHaveLength(0);
    expect(utils.queryByLabelText("Share to Instagram")).toBeNull();
    expect(utils.queryByLabelText("Save to Photos")).toBeNull();
    expect(utils.queryByLabelText("Improve this reel")).toBeNull();
    expect(utils.getByText("View profile")).toBeTruthy();
    expect(utils.getByLabelText("Close")).toBeTruthy();
    expect(utils.getByTestId("viewer-mute")).toBeTruthy();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    // No rail, so no rail scrim; the bottom scrim stays under the meta.
    expect(utils.queryByTestId("viewer-rail")).toBeNull();
    expect(utils.queryByTestId("reel-scrim-rail")).toBeNull();
    expect(utils.getByTestId("reel-scrim-bottom")).toBeTruthy();
  });

  it("own reel: Share to Instagram is the page's one red CTA; opening it suspends paging and pauses", async () => {
    const utils = await open(session([reel(1), reel(2)], 0));
    expect(utils.getByLabelText("Share to Instagram")).toBeTruthy();
    expect(utils.getByText("Open match")).toBeTruthy();
    expect(utils.getByTestId("reel-scrim-rail")).toBeTruthy();
    expect(list(utils).props.scrollEnabled).toBe(true);
    await act(async () => fireEvent.press(utils.getByTestId("viewer-share")));
    await flush();
    expect(mockStart).toHaveBeenCalled();
    expect(list(utils).props.scrollEnabled).toBe(false);
    expect(pool()[0].playing).toBe(false);
  });

  it("tap toggles pause and play on the visible reel", async () => {
    const utils = await open(session([reel(1), reel(2)], 0));
    fireEvent.press(utils.getByTestId("highlight-player-toggle"));
    expect(pool()[0].playing).toBe(false);
    expect(utils.getByTestId("reel-paused")).toBeTruthy();
    fireEvent.press(utils.getByTestId("highlight-player-toggle"));
    expect(pool()[0].playing).toBe(true);
    expect(utils.queryByTestId("reel-paused")).toBeNull();
  });

  it("mute persists to reels:muted:v1 and applies to every pool player", async () => {
    const utils = await open(session([reel(1), reel(2)], 0));
    expect(pool().every((p) => p.muted === false)).toBe(true);
    await act(async () => fireEvent.press(utils.getByLabelText("Mute")));
    await flush();
    expect(pool().every((p) => p.muted === true)).toBe(true);
    expect(await AsyncStorage.getItem(REEL_MUTED_KEY)).toBe("1");
    expect(utils.getByLabelText("Unmute")).toBeTruthy();
  });

  it("swipe hint C-V1: once per install on 2+ reels, gone after the first swipe", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3)], 0));
    expect(utils.getByText("Swipe up for the next one")).toBeTruthy();
    expect(await AsyncStorage.getItem(REEL_SWIPE_HINT_KEY)).toBe("1");
    await swipeTo(utils, 1);
    expect(utils.queryByText("Swipe up for the next one")).toBeNull();
    utils.unmount();
    const again = await open(session([reel(1), reel(2)], 0));
    expect(again.queryByText("Swipe up for the next one")).toBeNull();
  });

  it("no swipe hint on a single reel", async () => {
    const utils = await open(session([reel(1)], 0));
    expect(utils.queryByText("Swipe up for the next one")).toBeNull();
    expect(await AsyncStorage.getItem(REEL_SWIPE_HINT_KEY)).toBeNull();
  });

  it("nearing the end loads the next page without duplicates; a spinner page shows while it loads", async () => {
    let resolve!: (v: ReelItem[]) => void;
    const loadMore = jest.fn(() => new Promise<ReelItem[]>((r) => (resolve = r)));
    const utils = await open(session([reel(1), reel(2), reel(3)], 0, loadMore));
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("reel-pager-loading")).toBeTruthy();
    await act(async () => resolve([reel(3), reel(4)]));
    await flush();
    expect(list(utils).props.data.map((r: ReelItem) => r.highlightId)).toEqual(["h1", "h2", "h3", "h4"]);
    expect(utils.queryByTestId("reel-pager-loading")).toBeNull();
  });

  it("end of a fully loaded list: a drag past the last reel shows C-V2, no extra page", async () => {
    await AsyncStorage.setItem(REEL_SWIPE_HINT_KEY, "1");
    const utils = await open(session([reel(1), reel(2)], 1));
    await act(async () => {
      list(utils).props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: H + 60 } } });
    });
    await flush();
    expect(utils.getByText("You're all caught up")).toBeTruthy();
    expect(list(utils).props.data).toHaveLength(2);
  });

  describe("buffering (review B1: intent, never player.playing)", () => {
    async function openBuffering(items = [reel(1), reel(2), reel(3), reel(4)], start = 0) {
      const utils = render(<ReelPager session={session(items, start)} />);
      fakePlayers.forEach((p) => (p.buffering = true));
      fireEvent(utils.getByTestId("reel-pager"), "layout", { nativeEvent: { layout: { width: 390, height: H } } });
      await flush();
      return utils;
    }

    it("tap to pause during the buffer: the reel never starts once buffered", async () => {
      const utils = await openBuffering();
      expect(pool()[0].wantsPlay).toBe(true);
      fireEvent.press(utils.getByTestId("highlight-player-toggle"));
      act(() => bufferEnd(0));
      expect(pool()[0].playing).toBe(false);
    });

    it("a sheet opened during the buffer: no sound behind it", async () => {
      const utils = await openBuffering();
      await act(async () => fireEvent.press(utils.getByTestId("viewer-share")));
      await flush();
      act(() => bufferEnd(0));
      expect(pool()[0].playing).toBe(false);
    });

    it("a blur during the buffer (match detail pushed): it stays paused", async () => {
      const utils = await openBuffering();
      await act(async () => fireEvent.press(utils.getByText("Open match")));
      // The focus effect's cleanup is the blur; unmounting runs it too.
      utils.unmount();
      act(() => bufferEnd(0));
      expect(pool()[0].playing).toBe(false);
    });

    it("a two-page jump during the buffer: the page left never starts, only the landed one plays", async () => {
      const utils = await openBuffering();
      await swipeTo(utils, 2);
      act(() => bufferEnd(0));
      act(() => bufferEnd(2));
      expect(pool()[0].playing).toBe(false);
      expect(pool()[2].playing).toBe(true);
    });
  });

  it("viewability during a gesture is ignored: one viewer_swiped per landing", async () => {
    const utils = await open(session([reel(1), reel(2), reel(3)], 0));
    await act(async () => list(utils).props.onScrollBeginDrag({ nativeEvent: { contentOffset: { y: 0 } } }));
    await act(async () => list(utils).props.onViewableItemsChanged({ viewableItems: [{ index: 1, isViewable: true }] }));
    await swipeTo(utils, 1);
    await act(async () => {
      pool()[1].emit("playingChange", { isPlaying: true });
      pool()[1].emit("statusChange", { status: "readyToPlay" });
    });
    expect(steps("viewer_swiped")).toHaveLength(1);
  });

  it("a rejecting loadMore is not retried in a loop; the next landing may retry", async () => {
    const loadMore = jest.fn(() => Promise.reject(new Error("offline")));
    const utils = await open(session([reel(1), reel(2), reel(3)], 1, loadMore));
    await flush(6);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(utils.queryByTestId("reel-pager-loading")).toBeNull();
    await swipeTo(utils, 2);
    await flush(4);
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it("landing on the loading page after the last reel pauses the last reel", async () => {
    const loadMore = jest.fn(() => new Promise<ReelItem[]>(() => undefined));
    const utils = await open(session([reel(1), reel(2)], 1, loadMore));
    expect(utils.getByTestId("reel-pager-loading")).toBeTruthy();
    expect(pool()[1].playing).toBe(true);
    await act(async () => list(utils).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 2 * H } } }));
    expect(pool()[1].playing).toBe(false);
    expect(steps("viewer_swiped")).toHaveLength(0);
  });

  it("Android: the offset clamps at the end, so a finger drag up on the last reel shows C-V2", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      await AsyncStorage.setItem(REEL_SWIPE_HINT_KEY, "1");
      const utils = await open(session([reel(1), reel(2)], 1));
      await act(async () => {
        list(utils).props.onTouchStart({ nativeEvent: { pageY: 600 } });
        list(utils).props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: H } } });
        list(utils).props.onTouchEnd({ nativeEvent: { pageY: 480 } });
      });
      await flush();
      expect(utils.getByText("You're all caught up")).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    }
  });

  it("Close goes back to the opening surface", async () => {
    const utils = await open(session([reel(1), reel(2)], 0));
    fireEvent.press(utils.getByLabelText("Close"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe("highlight route", () => {
  it("a live lane session opens the pager at the tapped reel", async () => {
    const s = session([reel(1), reel(2)], 1);
    mockParams = { id: "h2", source: "home", lane: "home", session: s.token };
    const utils = render(<HighlightViewerRoute />);
    expect(utils.getByTestId("reel-pager")).toBeTruthy();
  });

  it("a lane link whose session is gone (cold start) falls back to the single full-screen reel, no hint", async () => {
    mockParams = { id: "h2", source: "home", lane: "home", session: "gone" };
    const utils = render(<HighlightViewerRoute />);
    await flush();
    expect(utils.queryByTestId("reel-pager")).toBeNull();
    expect(utils.getByTestId("highlight-viewer")).toBeTruthy();
    expect(utils.queryByText("Swipe up for the next one")).toBeNull();
    expect(mockGetProgress).not.toHaveBeenCalled(); // no prefetch in single-reel mode
    // It still reports the lane it came from (not match_detail).
    expect(steps("viewer_opened")[0][2]).toMatchObject({ source: "home" });
  });
});
