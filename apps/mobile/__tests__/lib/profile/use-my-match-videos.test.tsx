/**
 * useMyMatchVideos reads the grouped, uncapped list and turns an `ok: false`
 * into a hook error so the section can offer a retry.
 *
 * Source: apps/mobile/lib/profile/use-my-match-videos.ts
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockGetMyMatchVideos = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMyMatchVideos: (...args: unknown[]) => mockGetMyMatchVideos(...args),
}));

import { useMyMatchVideos } from "@/lib/profile/use-my-match-videos";

// The cache is a module-level Map, so give every test its own key.
let seq = 0;
const nextId = () => `ath-${++seq}`;

beforeEach(() => mockGetMyMatchVideos.mockReset());

describe("useMyMatchVideos", () => {
  it("reads up to 100 video rows for the athlete", async () => {
    const id = nextId();
    mockGetMyMatchVideos.mockResolvedValue({ ok: true, data: [{ match_id: "m-1" }] });
    const { result } = renderHook(() => useMyMatchVideos(id));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockGetMyMatchVideos).toHaveBeenCalledWith({ tag: "client" }, id, { limit: 100 });
    expect(result.current.error).toBeNull();
  });

  it("surfaces ok:false as an error with no items", async () => {
    mockGetMyMatchVideos.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network down" },
    });
    const id = nextId();
    const { result } = renderHook(() => useMyMatchVideos(id));

    await waitFor(() => expect(result.current.error?.message).toBe("network down"));
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("refetch reads again", async () => {
    mockGetMyMatchVideos.mockResolvedValue({ ok: true, data: [] });
    const id = nextId();
    const { result } = renderHook(() => useMyMatchVideos(id));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.refetch());
    await waitFor(() => expect(mockGetMyMatchVideos).toHaveBeenCalledTimes(2));
  });

  it("makes no read without an athlete", async () => {
    const { result } = renderHook(() => useMyMatchVideos(undefined));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetMyMatchVideos).not.toHaveBeenCalled();
  });
});
