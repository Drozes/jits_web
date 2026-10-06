import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockGetMyMatchLibrary = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getMyMatchLibrary: (...a: unknown[]) => mockGetMyMatchLibrary(...a),
}));

import { useMatchLibrary } from "@/lib/film-room/use-match-library";
import { useMatchUploads } from "@/lib/film-room/use-match-uploads";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { libItem } from "../../support/film-fixtures";

// The first page goes through a module-level cache: a fresh athlete per test.
let seq = 0;
const nextId = () => `lib-ath-${++seq}`;

function page(ids: string[], next: string | null, nextId: string | null = next ? `${next}-id` : null) {
  return {
    ok: true,
    data: { items: ids.map((match_id) => libItem({ match_id })), next_before: next, next_before_id: nextId, source: "rpc" },
  };
}

beforeEach(() => mockGetMyMatchLibrary.mockReset());

describe("useMatchLibrary", () => {
  it("loads the first page, then pages through next_before, deduping", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a", "b"], "cursor-1"))
      .mockResolvedValueOnce(page(["b", "c"], null));
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(mockGetMyMatchLibrary).toHaveBeenCalledWith({ tag: "client" }, id, { limit: 20 });
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    // Both cursor halves, verbatim.
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({ tag: "client" }, id, {
      limit: 20,
      before: "cursor-1",
      beforeId: "cursor-1-id",
    });
    expect(result.current.items.map((i) => i.match_id)).toEqual(["a", "b", "c"]);
    expect(result.current.hasMore).toBe(false);

    // Nothing more to load: no call.
    act(() => result.current.loadMore());
    expect(mockGetMyMatchLibrary).toHaveBeenCalledTimes(2);
  });

  it("flags a failed page for retry without losing the list", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a"], "c1"))
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } })
      .mockResolvedValueOnce(page(["b"], null));
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreError).toBe(true));
    expect(result.current.items).toHaveLength(1);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.moreError).toBe(false);
  });

  it("surfaces a first-page error with nothing to show", async () => {
    const id = nextId();
    mockGetMyMatchLibrary.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.error?.message).toBe("offline"));
    expect(result.current.items).toEqual([]);
  });

  it("reports a failed refresh as refreshError while the cached page stays", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a"], null))
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.refreshError).toBeNull();
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshError?.message).toBe("offline"));
    expect(result.current.error).toBeNull();
    expect(result.current.items.map((i) => i.match_id)).toEqual(["a"]);
  });

  it("refresh drops later pages and re-reads the first", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a"], "c1"))
      .mockResolvedValueOnce(page(["b"], null))
      .mockResolvedValueOnce(page(["new", "a"], "c2"));
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.items.map((i) => i.match_id)).toEqual(["new", "a"]));
    expect(result.current.hasMore).toBe(true);
  });
});

describe("useMatchLibrary revalidate", () => {
  it("keeps later pages when the first page's boundary is unchanged", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a", "b"], "c1"))
      .mockResolvedValueOnce(page(["c"], null))
      .mockResolvedValueOnce(page(["a", "b"], "c1"));
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    act(() => result.current.revalidate());
    await waitFor(() => expect(mockGetMyMatchLibrary).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.isValidating).toBe(false));
    expect(result.current.items.map((i) => i.match_id)).toEqual(["a", "b", "c"]);
  });

  it("drops later pages when a revalidate moves the boundary, so nothing is skipped", async () => {
    const id = nextId();
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page(["a", "b"], "c1", "b"))
      .mockResolvedValueOnce(page(["c", "d"], "c2", "d"))
      // A new match arrived: page 1 now ends at "a", so "b" moved onto page 2.
      .mockResolvedValueOnce(page(["new", "a"], "c0", "a"))
      .mockResolvedValueOnce(page(["b", "c"], "c1b", "c"));
    const { result } = renderHook(() => useMatchLibrary(id));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(4));

    act(() => result.current.revalidate());
    await waitFor(() => expect(result.current.items.map((i) => i.match_id)).toEqual(["new", "a"]));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((i) => i.match_id)).toEqual(["new", "a", "b", "c"]));
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({ tag: "client" }, id, { limit: 20, before: "c0", beforeId: "a" });
  });
});

describe("useMatchUploads", () => {
  it("tracks the upload store for the given matches", () => {
    resetMatchUploadStore();
    const { result } = renderHook(() => useMatchUploads(["m-1", "m-2"]));
    expect(result.current.size).toBe(0);
    act(() => {
      setMatchUpload("m-1", { status: "uploading", progress: 0.3 });
      setMatchUpload("other", { status: "uploading", progress: 0.9 });
    });
    expect(result.current.get("m-1")?.progress).toBe(0.3);
    expect(result.current.has("other")).toBe(false);
  });
});
