/**
 * useReelLane (specs/matches-tab 5): ordering, clips off, B1 paging with the
 * raw cursor, the older-backend fallback, B2 building tiles and the Matches
 * fallback, markSeenLocally, refresh triggers and the poster re-sign rule.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockFocus: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocus.push(cb);
      cb();
    }, [cb]);
  },
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
let mockExits = 0;
jest.mock("@/lib/arena/arena-store", () => ({ useMatchExitCount: () => mockExits }));

const mockSign = jest.fn();
jest.mock("@jits/shared/api/poster-signing", () => ({
  signPosterKeys: (...a: unknown[]) => mockSign(...a),
}));
const mockGetMy = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getMyHighlights: (...a: unknown[]) => mockGetMy(...a),
}));

import { resetReelLanes, useReelLane, LANE_POSTER_RESIGN_AFTER_MS } from "@/lib/highlight/use-reel-lane";
import {
  __setHighlightReadThrottleForTests,
  notifyHighlightsChanged,
  resetHighlightStore,
} from "@/lib/highlight/highlight-store";

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    highlightId: id,
    matchId: `m-${id}`,
    matchVideoId: `v-${id}`,
    version: 1,
    durationS: 28,
    posterPath: `${id}.jpg`,
    readyAt: "2026-10-06T10:00:00.123456+00:00",
    opponentName: "Ana",
    matchType: "ranked",
    outcome: "win",
    playedAt: "2026-10-06T09:00:00Z",
    notifiedAt: null,
    unseen: false,
    origin: null,
    ...over,
  };
}

function page(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      clipsEnabled: true,
      shareEnabled: true,
      items,
      nextBefore: null,
      nextBeforeId: null,
      inFlight: [],
      inFlightSupported: true,
      ...over,
    },
  };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  resetHighlightStore();
  resetReelLanes();
  __setHighlightReadThrottleForTests(0);
  jest.clearAllMocks();
  mockFocus.length = 0;
  mockExits = 0;
  mockSign.mockImplementation(async (_c: unknown, keys: string[]) => keys.map((k) => `https://signed/${k}`));
});

describe("useReelLane", () => {
  it("reads the first page (limit 10) and orders unseen first, newest first within each", async () => {
    mockGetMy.mockResolvedValue(page([item("1"), item("2", { unseen: true }), item("3"), item("4", { unseen: true })]));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    expect(result.current.loading).toBe(true);
    await settle();
    expect(mockGetMy).toHaveBeenCalledWith({}, { limit: 10 });
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["2", "4", "1", "3"]);
    expect(result.current.items[0]).toMatchObject({ source: "own", isOwn: true, posterUrl: "https://signed/2.jpg" });
    expect(result.current).toMatchObject({ loading: false, clipsEnabled: true, hasMore: false, error: null });
  });

  it("signs every poster of a read in one batch", async () => {
    mockGetMy.mockResolvedValue(
      page([item("1"), item("2")], { inFlight: [{ matchId: "m-x", reelState: "rendering", step: 2, posterPath: "x.jpg" }] }),
    );
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockSign.mock.calls[0][1]).toEqual(["1.jpg", "2.jpg", "x.jpg"]);
    expect(result.current.inFlight[0]).toMatchObject({ matchId: "m-x", posterUrl: "https://signed/x.jpg" });
  });

  it("returns nothing with clips off (fail closed)", async () => {
    mockGetMy.mockResolvedValue(page([item("1")], { clipsEnabled: false, inFlight: [{ matchId: "m" }] }));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(result.current).toMatchObject({ items: [], inFlight: [], clipsEnabled: false, loading: false });
  });

  it("does nothing without an athlete", async () => {
    const { result } = renderHook(() => useReelLane(undefined, "home"));
    await settle();
    expect(mockGetMy).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("keeps content and reports the error when a refetch fails; no skeleton after a cold failure", async () => {
    mockGetMy.mockResolvedValueOnce(page([item("1")]));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    mockGetMy.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    act(() => result.current.refetch(true));
    await settle();
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["1"]);
    expect(result.current.error).toMatchObject({ code: "UNKNOWN" });

    resetReelLanes();
    mockGetMy.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const cold = renderHook(() => useReelLane("ath-2", "matches"));
    await settle();
    expect(cold.result.current).toMatchObject({ loading: false, items: [], clipsEnabled: false });
  });

  it("pages with the B1 cursor passed back verbatim and appends without duplicates", async () => {
    mockGetMy.mockResolvedValueOnce(
      page([item("1"), item("2")], { nextBefore: "2026-10-05T08:00:00.654321+00:00", nextBeforeId: "2" }),
    );
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    expect(result.current.hasMore).toBe(true);
    expect(result.current.cursor).toEqual({ before: "2026-10-05T08:00:00.654321+00:00", beforeId: "2" });

    mockGetMy.mockResolvedValueOnce(page([item("2"), item("3", { unseen: true }), item("4")]));
    act(() => result.current.loadMore());
    await settle();
    expect(mockGetMy).toHaveBeenLastCalledWith({}, { limit: 10, before: "2026-10-05T08:00:00.654321+00:00", beforeId: "2" });
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["1", "2", "3", "4"]);
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.loadMore()); // last page: no read
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });

  it("falls back to a time-only cursor on a full page from an older backend", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => item(String(i), { readyAt: `2026-10-0${(i % 9) + 1}T00:00:00Z` }));
    mockGetMy.mockResolvedValueOnce(page(ten, { inFlightSupported: false }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    expect(result.current.cursor).toEqual({ before: ten[9].readyAt, beforeId: null });
  });

  it("reports a failed load-more without losing items", async () => {
    mockGetMy.mockResolvedValueOnce(page([item("1")], { nextBefore: "t", nextBeforeId: "1" }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    mockGetMy.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => result.current.loadMore());
    await settle();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.loadMoreError).not.toBeNull();
    expect(result.current.error).toBeNull(); // the first read is fine
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it("a good first read clears a failed load-more, so paging can resume", async () => {
    mockGetMy.mockResolvedValueOnce(page([item("1")], { nextBefore: "t", nextBeforeId: "1" }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    mockGetMy.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => result.current.loadMore());
    await settle();
    expect(result.current.loadMoreError).not.toBeNull();

    mockGetMy.mockResolvedValueOnce(page([item("1")], { nextBefore: "t", nextBeforeId: "1" }));
    act(() => result.current.refetch(true));
    await settle();
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.hasMore).toBe(true);
  });

  it("stamps building reels with the device time their read landed (the countdown baseline)", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_234_000);
    const inFlight = [{ matchId: "m-w", matchVideoId: null, highlightId: null, reelState: "waiting", step: 1, waitDeadlineAt: "2026-10-06T10:08:12Z", serverNow: "2026-10-06T10:00:00Z", opponentName: null, playedAt: null, posterPath: null }];
    mockGetMy.mockResolvedValue(page([], { inFlight }));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(result.current.inFlight).toEqual([expect.objectContaining({ matchId: "m-w", receivedAt: 1_234_000 })]);
    now.mockRestore();
  });

  it("a load-more that finds clips switched off is an empty last page, not an error", async () => {
    mockGetMy.mockResolvedValueOnce(page([item("1")], { nextBefore: "t", nextBeforeId: "1" }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    mockGetMy.mockResolvedValueOnce(page([], { clipsEnabled: false }));
    act(() => result.current.loadMore());
    await settle();
    expect(result.current).toMatchObject({ loadMoreError: null, error: null, hasMore: false });
    expect(result.current.items).toHaveLength(1);
  });

  it("ignores a second loadMore while one is in flight (same tick)", async () => {
    mockGetMy.mockResolvedValueOnce(page([item("1")], { nextBefore: "t", nextBeforeId: "1" }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    mockGetMy.mockResolvedValueOnce(page([item("2")]));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });

  it("reports an error when the read throws", async () => {
    mockGetMy.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(result.current.error).toMatchObject({ code: "UNKNOWN" });
    expect(result.current.loading).toBe(false);
  });

  it("does not cache a failed poster sign: a forced refetch signs it again", async () => {
    mockGetMy.mockResolvedValue(page([item("1")]));
    mockSign.mockImplementationOnce(async (_c: unknown, keys: string[]) => keys.map(() => null));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(result.current.items[0].posterUrl).toBeNull();
    act(() => result.current.refetch(true));
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(result.current.items[0].posterUrl).toBe("https://signed/1.jpg");
  });

  it("drops a read still in flight for the previous athlete", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mockGetMy.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    mockGetMy.mockResolvedValue(page([item("b1")]));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useReelLane(id, "home"), { initialProps: { id: "ath-a" } });
    rerender({ id: "ath-b" });
    await settle();
    await act(async () => resolveOld(page([item("a1")])));
    await settle();
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["b1"]);
  });

  it("dedupes reads per owner, and resetHighlightStore forgets every lane", async () => {
    mockGetMy.mockResolvedValue(page([item("1")]));
    __setHighlightReadThrottleForTests(60_000);
    const a = renderHook(() => useReelLane("ath-a", "home"));
    const b = renderHook(() => useReelLane("ath-b", "home"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2); // not shared across accounts
    act(() => resetHighlightStore());
    expect(a.result.current.items).toEqual([]);
    expect(b.result.current.items).toEqual([]);
  });

  it("a focus refetch after watching a tile does not move it", async () => {
    mockGetMy.mockResolvedValue(page([item("1"), item("2", { unseen: true }), item("3", { unseen: true })]));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["2", "3", "1"]);
    act(() => result.current.markSeenLocally("2"));
    mockGetMy.mockResolvedValue(page([item("1"), item("2"), item("3", { unseen: true })]));
    act(() => mockFocus[mockFocus.length - 1]());
    await settle();
    expect(result.current.items.map((i) => [i.highlightId, i.unseen])).toEqual([
      ["2", false],
      ["3", true],
      ["1", false],
    ]);
  });

  it("keeps the same ReelItem objects across a refetch that changed nothing", async () => {
    mockGetMy.mockResolvedValue(page([item("1"), item("2")]));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    const before = result.current.items;
    act(() => result.current.refetch(true));
    await settle();
    expect(result.current.items[0]).toBe(before[0]);
    expect(result.current.items[1]).toBe(before[1]);
  });

  it("uses the Matches fallback building tiles only when the backend has no in_flight", async () => {
    const fallback = [{ matchId: "m-f", matchVideoId: null, highlightId: null, reelState: "rendering" as const, step: 2 as const, waitDeadlineAt: null, serverNow: null, opponentName: null, playedAt: null, posterPath: "f.jpg" }];
    mockGetMy.mockResolvedValue(page([], { inFlightSupported: false }));
    const { result } = renderHook(() => useReelLane("ath-1", "matches", { fallbackInFlight: fallback }));
    await settle();
    expect(result.current.inFlight).toEqual([expect.objectContaining({ matchId: "m-f", posterUrl: "https://signed/f.jpg" })]);

    resetReelLanes();
    mockGetMy.mockResolvedValue(page([], { inFlightSupported: true, inFlight: [] }));
    const b2 = renderHook(() => useReelLane("ath-3", "matches", { fallbackInFlight: fallback }));
    await settle();
    expect(b2.result.current.inFlight).toEqual([]);
  });

  it("markSeenLocally clears the ring at once without reordering, across lanes and a racing read", async () => {
    mockGetMy.mockResolvedValue(page([item("1"), item("2", { unseen: true })]));
    const home = renderHook(() => useReelLane("ath-1", "home"));
    const matches = renderHook(() => useReelLane("ath-1", "matches"));
    await settle();
    expect(home.result.current.items.map((i) => i.highlightId)).toEqual(["2", "1"]);
    act(() => home.result.current.markSeenLocally("2"));
    expect(home.result.current.items.map((i) => [i.highlightId, i.unseen])).toEqual([
      ["2", false],
      ["1", false],
    ]);
    expect(matches.result.current.items.find((i) => i.highlightId === "2")?.unseen).toBe(false);
    // The server has not caught up yet: the read still says unseen.
    act(() => home.result.current.refetch(true));
    await settle();
    expect(home.result.current.items.find((i) => i.highlightId === "2")?.unseen).toBe(false);
  });

  it("re-reads on focus, on match exit and (forced) on notifyHighlightsChanged", async () => {
    mockGetMy.mockResolvedValue(page([item("1")]));
    const { rerender } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(1);
    act(() => mockFocus[0]());
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    mockExits = 1;
    rerender({});
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(3);
    act(() => notifyHighlightsChanged());
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(4);
  });

  it("paints warm from the lane cache on remount", async () => {
    mockGetMy.mockResolvedValue(page([item("1")]));
    const first = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    first.unmount();
    mockGetMy.mockReturnValue(new Promise(() => {}));
    const second = renderHook(() => useReelLane("ath-1", "home"));
    expect(second.result.current.items.map((i) => i.highlightId)).toEqual(["1"]);
    expect(second.result.current.loading).toBe(false);
  });

  it("keeps a signed poster for 50 minutes, then signs it again", async () => {
    const spy = jest.spyOn(Date, "now");
    let now = 1_000_000;
    spy.mockImplementation(() => now);
    mockGetMy.mockResolvedValue(page([item("1")]));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(1);
    now += LANE_POSTER_RESIGN_AFTER_MS - 1;
    act(() => result.current.refetch(true));
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(1);
    now += 1;
    act(() => result.current.refetch(true));
    await settle();
    expect(mockSign).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("only the newest read writes", async () => {
    let resolveSlow: (v: unknown) => void = () => {};
    mockGetMy
      .mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce(page([item("new")]));
    const { result } = renderHook(() => useReelLane("ath-1", "home"));
    act(() => result.current.refetch(true));
    await settle();
    await act(async () => resolveSlow(page([item("old")])));
    await settle();
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["new"]);
  });
});
