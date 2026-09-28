/**
 * useRefetchOnUploadSettled refetches a list once when a watched match's
 * upload lands (Profile's Film Room preview and the Film Room use it).
 *
 * Source: apps/mobile/lib/profile/use-my-match-videos.ts
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

import { useRefetchOnUploadSettled } from "@/lib/profile/use-my-match-videos";
import {
  beginMatchUploadAttempt,
  resetMatchUploadStore,
  setMatchUpload,
} from "@/lib/video/match-upload-store";

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
