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

import { useMyMatchVideos, useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import {
  beginMatchUploadAttempt,
  resetMatchUploadStore,
  setMatchUpload,
} from "@/lib/video/match-upload-store";

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

  it("keeps the error through a retry until a load succeeds", async () => {
    let resolveRetry: (v: unknown) => void = () => {};
    mockGetMyMatchVideos
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } })
      .mockImplementationOnce(() => new Promise((r) => (resolveRetry = r)));
    const id = nextId();
    const { result } = renderHook(() => useMyMatchVideos(id));
    await waitFor(() => expect(result.current.error?.message).toBe("offline"));

    act(() => result.current.refetch());
    await waitFor(() => expect(mockGetMyMatchVideos).toHaveBeenCalledTimes(2));
    expect(result.current.isValidating).toBe(true);
    expect(result.current.error?.message).toBe("offline");

    await act(async () => resolveRetry({ ok: true, data: [] }));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.items).toEqual([]);
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

describe("useRefetchOnUploadSettled", () => {
  beforeEach(() => resetMatchUploadStore());

  function mount(ids: string[]) {
    const refetch = jest.fn();
    const utils = renderHook(
      ({ matchIds }: { matchIds: string[] }) => useRefetchOnUploadSettled(matchIds, refetch),
      { initialProps: { matchIds: ids } },
    );
    return { ...utils, refetch };
  }

  it("refetches exactly once when a watched match's upload transitions to uploaded", () => {
    act(() => {
      setMatchUpload("m-1", { status: "uploading" });
    });
    const { refetch } = mount(["m-1"]);
    expect(refetch).not.toHaveBeenCalled();

    act(() => {
      setMatchUpload("m-1", { progress: 0.5 });
    });
    expect(refetch).not.toHaveBeenCalled();

    act(() => {
      setMatchUpload("m-1", { status: "uploaded", videoId: "v-1" });
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    // Later writes to the same settled entry never refetch again.
    act(() => {
      setMatchUpload("m-1", { progress: 1 });
      setMatchUpload("m-1", { status: "uploaded", videoId: "v-1" });
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("ignores uploads for matches it is not watching, and errors", () => {
    const { refetch } = mount(["m-1"]);
    act(() => {
      setMatchUpload("other", { status: "uploaded", videoId: "v-9" });
      setMatchUpload("m-1", { status: "error", error: "failed" });
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("picks up an upload that settled before its match reached the history", () => {
    act(() => {
      setMatchUpload("m-new", { status: "uploaded", videoId: "v-2" });
    });
    const { refetch, rerender } = mount(["m-old"]);
    expect(refetch).not.toHaveBeenCalled();

    rerender({ matchIds: ["m-new", "m-old"] });
    expect(refetch).toHaveBeenCalledTimes(1);
    rerender({ matchIds: ["m-new", "m-old"] });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("refetches once per check even when several uploads are new", () => {
    act(() => {
      setMatchUpload("a", { status: "uploaded", videoId: "va" });
      setMatchUpload("b", { status: "uploaded", videoId: "vb" });
    });
    const { refetch } = mount(["a", "b"]);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a new recording attempt on the same match refetches again when it lands", () => {
    const { refetch } = mount(["m-1"]);
    act(() => {
      setMatchUpload("m-1", { status: "uploaded", videoId: "v-1" });
    });
    act(() => {
      beginMatchUploadAttempt("m-1");
    });
    act(() => {
      setMatchUpload("m-1", { status: "uploaded", videoId: "v-2" });
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("stops listening on unmount", () => {
    const { refetch, unmount } = mount(["m-1"]);
    unmount();
    act(() => {
      setMatchUpload("m-1", { status: "uploaded", videoId: "v-1" });
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
