/**
 * Tests for the web video recorder hook (hooks/use-video-recorder.ts).
 *
 * Covers the Phase 1 upload-path fixes:
 * - jits-0lc: consumes the Result<T> shape from upsertMatchVideo (no
 *   try/catch around the data layer).
 * - jits-1v6: when the match_videos upsert fails after the storage write
 *   succeeded, the object is removed (no orphan file in the bucket).
 * - jits-hu0: unmounting mid-upload does not cancel the storage + DB
 *   write; only React state updates are skipped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockUpload = vi.fn();
const mockRemove = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        remove: (...args: unknown[]) => mockRemove(...args),
      }),
    },
  }),
}));

const mockUpsert = vi.fn();

vi.mock("@jits/shared/api/mutations", () => ({
  buildMatchVideoStoragePath: () => "M/A/123.webm",
  upsertMatchVideo: (...args: unknown[]) => mockUpsert(...args),
}));

import { useVideoRecorder } from "./use-video-recorder";

// jsdom has no MediaRecorder / getUserMedia; install minimal fakes.
let lastRecorder: FakeMediaRecorder | null = null;

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    lastRecorder = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
Object.defineProperty(globalThis.navigator, "mediaDevices", {
  configurable: true,
  value: {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [] })),
  },
});

async function recordAndStop(
  result: { current: ReturnType<typeof useVideoRecorder> },
) {
  await act(async () => {
    await result.current.startRecording();
  });
  act(() => {
    lastRecorder!.ondataavailable!({ data: new Blob(["0123456789"]) });
  });
  await act(async () => {
    result.current.stopRecording();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lastRecorder = null;
  mockUpload.mockResolvedValue({ error: null });
  // Successful-removal shape: storage-js resolves with the removed objects.
  mockRemove.mockResolvedValue({ data: [{ name: "M/A/123.webm" }], error: null });
  mockUpsert.mockResolvedValue({ ok: true, data: { id: "VID" } });
});

describe("useVideoRecorder (web)", () => {
  it("uploads then upserts the match_videos row, exposing the videoId", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(result.current.videoId).toBe("VID");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/123.webm",
      }),
    );
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("removes the stored object when the DB upsert fails (jits-1v6)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockUpsert.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(mockRemove).toHaveBeenCalledWith(["M/A/123.webm"]);
    expect(result.current.error).toMatch(/saving the video record failed: boom/);
    expect(result.current.videoId).toBeNull();
    // Clean compensation (exactly one object removed): nothing to report.
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("orphan cleanup failed"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("reports a compensation remove() that resolves with an error, keeping the DB error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockUpsert.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    // Realistic storage-js failure shape: remove() RESOLVES with an error.
    mockRemove.mockResolvedValue({ data: null, error: { message: "delete denied" } });
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(result.current.error).toMatch(/saving the video record failed: boom/);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("orphan cleanup failed"),
      expect.stringContaining("delete denied"),
    );
    warnSpy.mockRestore();
  });

  it("reports a compensation silently denied by RLS (data: []), keeping the DB error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockUpsert.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    // Storage RLS DELETE denial: 200 with an EMPTY data array and NO error.
    mockRemove.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(result.current.error).toMatch(/saving the video record failed: boom/);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("orphan cleanup failed"),
      expect.stringContaining("removed 0 objects"),
    );
    warnSpy.mockRestore();
  });

  it("finishes the storage + DB write even after unmounting mid-upload (jits-hu0)", async () => {
    let resolveStorage!: (v: { error: null }) => void;
    mockUpload.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((res) => {
          resolveStorage = res;
        }),
    );

    const { result, unmount } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    expect(result.current.uploadStatus).toBe("uploading");

    // The step navigates away while the storage upload is in flight.
    unmount();
    resolveStorage({ error: null });

    // The DB write still happens; the recording is not stranded as an
    // orphan storage object without a match_videos row.
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
