/**
 * The viewer's detail hook and the Profile row's list hook (jits-s6mi.4,
 * jits-s6mi.14): exact wrapper calls, fail-closed flags, stale reads dropped,
 * poster signing, local NEW-tag clearing.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "sb" } }));
const mockGetDetail = jest.fn();
const mockGetMine = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getHighlightDetail: (...a: unknown[]) => mockGetDetail(...a),
  getMyHighlights: (...a: unknown[]) => mockGetMine(...a),
}));
const mockSignPoster = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  signPosterKey: (...a: unknown[]) => mockSignPoster(...a),
}));

import { useHighlightDetail } from "@/lib/highlight/use-highlight-detail";
import { PROFILE_HIGHLIGHTS_LIMIT, useMyHighlights } from "@/lib/highlight/use-my-highlights";

const SB = { tag: "sb" };

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    highlightId: id,
    matchId: `m-${id}`,
    matchVideoId: `v-${id}`,
    version: 1,
    durationS: 30,
    posterPath: `p/${id}.jpg`,
    readyAt: "2026-09-27T10:00:00Z",
    opponentName: "Bea",
    matchType: "ranked",
    outcome: "win",
    playedAt: "2026-09-27T09:00:00Z",
    notifiedAt: null,
    unseen: false,
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("useHighlightDetail", () => {
  it("reads get_highlight_detail through the wrapper and exposes the detail", async () => {
    mockGetDetail.mockResolvedValue({ ok: true, data: { highlightId: "h1", version: 2 } });
    const { result } = renderHook(() => useHighlightDetail("h1"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetDetail).toHaveBeenCalledWith(SB, "h1");
    expect(result.current.detail).toEqual({ highlightId: "h1", version: 2 });
    expect(result.current.error).toBeNull();
  });

  it("surfaces the domain error and re-reads on reload", async () => {
    mockGetDetail.mockResolvedValueOnce({ ok: false, error: { code: "HIGHLIGHT_NOT_FOUND", message: "x" } });
    const { result } = renderHook(() => useHighlightDetail("h1"));
    await waitFor(() => expect(result.current.error?.code).toBe("HIGHLIGHT_NOT_FOUND"));
    mockGetDetail.mockResolvedValueOnce({ ok: true, data: { highlightId: "h1", version: 1 } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(mockGetDetail).toHaveBeenCalledTimes(2);
  });

  it("no id: not found without a network call", async () => {
    const { result } = renderHook(() => useHighlightDetail(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.code).toBe("HIGHLIGHT_NOT_FOUND");
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  it("drops a read that lands after unmount", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockGetDetail.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useHighlightDetail("h1"));
    unmount();
    await act(async () => resolve({ ok: true, data: { highlightId: "h1" } }));
    expect(result.current.detail).toBeNull();
  });
});

describe("useMyHighlights", () => {
  it("reads 10 own reels, signs posters, keeps the clips flag", async () => {
    mockGetMine.mockResolvedValue({
      ok: true,
      data: { clipsEnabled: true, shareEnabled: true, items: [item("a", { unseen: true }), item("b", { posterPath: null })] },
    });
    mockSignPoster.mockImplementation((_s: unknown, key: string | null) => Promise.resolve(key ? `https://signed/${key}` : null));
    const { result } = renderHook(() => useMyHighlights("me"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(PROFILE_HIGHLIGHTS_LIMIT).toBe(10);
    expect(mockGetMine).toHaveBeenCalledWith(SB, { limit: 10 });
    expect(result.current.clipsEnabled).toBe(true);
    expect(result.current.items[0].posterUrl).toBe("https://signed/p/a.jpg");
    expect(result.current.items[1].posterUrl).toBeNull();
  });

  it("fail-closed: clips off until a read succeeds; a failed read keeps what is shown", async () => {
    mockGetMine.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { result } = renderHook(() => useMyHighlights("me"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.clipsEnabled).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it("no athlete: no read", () => {
    renderHook(() => useMyHighlights(undefined));
    expect(mockGetMine).not.toHaveBeenCalled();
  });

  it("only the newest refetch writes", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    mockGetMine.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    mockSignPoster.mockResolvedValue(null);
    const { result } = renderHook(() => useMyHighlights("me"));
    act(() => result.current.refetch());
    await act(async () => resolvers[1]({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [item("new")] } }));
    await act(async () => resolvers[0]({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [item("old")] } }));
    expect(result.current.items.map((i) => i.highlightId)).toEqual(["new"]);
  });

  it("markSeenLocally clears one tile's unseen flag", async () => {
    mockGetMine.mockResolvedValue({
      ok: true,
      data: { clipsEnabled: true, shareEnabled: true, items: [item("a", { unseen: true }), item("b", { unseen: true })] },
    });
    mockSignPoster.mockResolvedValue(null);
    const { result } = renderHook(() => useMyHighlights("me"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.markSeenLocally("a"));
    expect(result.current.items.map((i) => i.unseen)).toEqual([false, true]);
  });
});
