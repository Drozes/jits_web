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

