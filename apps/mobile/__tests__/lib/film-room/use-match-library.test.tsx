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

function page(ids: string[], next: string | null) {
  return { ok: true, data: { items: ids.map((match_id) => libItem({ match_id })), next_before: next, source: "rpc" } };
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
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({ tag: "client" }, id, { limit: 20, before: "cursor-1" });
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
