/**
 * The match-keyed upload store and the banner-state derivation it feeds
 * (jits-od3).
 *
 * The store exists because the upload outcome cannot live in a component:
 * the step unmounts, the wizard remounts on every match, and the upload
 * can finish after both. These tests pin the two properties that follow
 * from that, namely that a write always lands and that a reader mounted
 * later still sees it.
 */
import { renderHook, act } from "@testing-library/react-native";
import {
  MAX_TRACKED_MATCHES,
  clearMatchUpload,
  getMatchUpload,
  resetMatchUploadStore,
  setMatchUpload,
  subscribeMatchUpload,
  useMatchUpload,
} from "@/lib/video/match-upload-store";
import { deriveUploadBannerState } from "@/lib/video/upload-banner-state";

beforeEach(() => {
  resetMatchUploadStore();
});

describe("match upload store", () => {
  it("knows nothing about a match until something is written", () => {
    expect(getMatchUpload("M1")).toBeNull();
  });

  it("creates an entry on first write and merges on later ones", () => {
    setMatchUpload("M1", { status: "uploading", storagePath: "M1/A1/1.mp4" });
    setMatchUpload("M1", { status: "uploaded", videoId: "VID-1" });

    const entry = getMatchUpload("M1");
    expect(entry).toMatchObject({
      matchId: "M1",
      status: "uploaded",
      videoId: "VID-1",
      // Merged, not replaced: the retry in jits-341p needs the same key.
      storagePath: "M1/A1/1.mp4",
    });
  });

  it("keeps matches independent", () => {
    setMatchUpload("M1", { status: "uploaded", videoId: "VID-1" });
    setMatchUpload("M2", { status: "error", error: "boom" });

    expect(getMatchUpload("M1")?.videoId).toBe("VID-1");
    expect(getMatchUpload("M2")?.videoId).toBeNull();
    expect(getMatchUpload("M1")?.error).toBeNull();
  });

  it("replaces the entry object on every write, so snapshots compare unequal", () => {
    const first = setMatchUpload("M1", { status: "uploading" });
    const second = setMatchUpload("M1", { status: "uploaded" });
    expect(second).not.toBe(first);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMatchUpload(listener);

    setMatchUpload("M1", { status: "uploading" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setMatchUpload("M1", { status: "uploaded" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears a match, and says nothing happened when there was nothing to clear", () => {
    const listener = jest.fn();
    subscribeMatchUpload(listener);

    clearMatchUpload("nope");
    expect(listener).not.toHaveBeenCalled();

    setMatchUpload("M1", { status: "uploaded" });
    clearMatchUpload("M1");
    expect(getMatchUpload("M1")).toBeNull();
  });

  it("evicts the oldest entries past the cap, so a long session cannot grow forever", () => {
    for (let i = 0; i < MAX_TRACKED_MATCHES + 3; i++) {
      setMatchUpload(`M${i}`, { status: "uploaded", videoId: `VID-${i}` });
    }
    expect(getMatchUpload("M0")).toBeNull();
    expect(getMatchUpload("M1")).toBeNull();
    expect(getMatchUpload("M2")).toBeNull();
    // The newest survives, which is the one a surface is plausibly showing.
    expect(getMatchUpload(`M${MAX_TRACKED_MATCHES + 2}`)?.videoId).toBe(
      `VID-${MAX_TRACKED_MATCHES + 2}`,
    );
  });
});

describe("useMatchUpload", () => {
  it("reads an entry written BEFORE the component existed", () => {
    // The whole point: an upload started by a recorder that is already gone.
    setMatchUpload("M1", { status: "uploaded", videoId: "VID-1" });

    const { result } = renderHook(() => useMatchUpload("M1"));
    expect(result.current?.videoId).toBe("VID-1");
  });

  it("re-renders when the match it watches changes", () => {
    const { result } = renderHook(() => useMatchUpload("M1"));
    expect(result.current).toBeNull();

    act(() => {
      setMatchUpload("M1", { status: "uploading" });
    });
    expect(result.current?.status).toBe("uploading");

    act(() => {
      setMatchUpload("M1", { status: "error", error: "Upload failed: network died" });
    });
    expect(result.current?.error).toMatch(/network died/);
  });

  it("ignores writes for other matches", () => {
    const { result } = renderHook(() => useMatchUpload("M1"));
    act(() => {
      setMatchUpload("M2", { status: "uploaded", videoId: "OTHER" });
    });
    expect(result.current).toBeNull();
  });

  it("survives its reader unmounting and remounting", () => {
    const first = renderHook(() => useMatchUpload("M1"));
    act(() => {
      setMatchUpload("M1", { status: "uploaded", videoId: "VID-1" });
    });
    first.unmount();

    // A brand new subscriber, as the wizard builds after refresh() remounts it.
    const second = renderHook(() => useMatchUpload("M1"));
    expect(second.result.current?.videoId).toBe("VID-1");
  });
});

describe("deriveUploadBannerState", () => {
  const entry = (patch: Record<string, unknown>) => ({
    matchId: "M1",
    status: "pending" as const,
    videoId: null,
    error: null,
    truncation: null,
    storagePath: null,
    updatedAt: 0,
    ...patch,
  }) as never;

  it("shows nothing when there is nothing to say", () => {
    expect(deriveUploadBannerState("idle", null, null).kind).toBe("hidden");
    expect(deriveUploadBannerState("recording", null, null).kind).toBe("hidden");
  });

  it("shows the recorder's transient stopping state, which only it can know", () => {
    expect(deriveUploadBannerState("stopping", null, null).kind).toBe("stopping");
  });

  it("trusts the STORE over an idle recorder, which is the remount case", () => {
    // After a remount the recorder reads idle while the upload is really
    // still in flight. Trusting the recorder here is what went silent.
    expect(deriveUploadBannerState("idle", null, entry({ status: "uploading" })).kind).toBe(
      "uploading",
    );
    expect(
      deriveUploadBannerState("idle", null, entry({ status: "error", error: "boom" })),
    ).toMatchObject({ kind: "error", message: "boom" });
    expect(
      deriveUploadBannerState("idle", null, entry({ status: "uploaded", videoId: "V" })).kind,
    ).toBe("uploaded");
  });

  it("carries truncation through a success so it cannot render as a plain win", () => {
    expect(
      deriveUploadBannerState("idle", null, entry({ status: "uploaded", truncation: "limit" })),
    ).toMatchObject({ kind: "uploaded", truncation: "limit" });
  });

  it("falls back to recorder failures that never reached an upload", () => {
    // No camera, no permission, a stop the hardware never honoured.
    expect(deriveUploadBannerState("error", "Camera not ready", null)).toMatchObject({
      kind: "error",
      message: "Camera not ready",
    });
  });

  it("treats a pending entry as nothing to say yet", () => {
    expect(deriveUploadBannerState("idle", null, entry({ status: "pending" })).kind).toBe(
      "hidden",
    );
  });

  it("never renders an error with no message at all", () => {
    expect(deriveUploadBannerState("error", null, null).message).toBeTruthy();
    expect(
      deriveUploadBannerState("idle", null, entry({ status: "error", error: null })).message,
    ).toBeTruthy();
  });
});
