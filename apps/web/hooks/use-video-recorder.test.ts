/**
 * Tests for the web video recorder hook (hooks/use-video-recorder.ts).
 *
 * The upload used to be a single non-resumable `storage.upload()` with no
 * retry at all: one dropped connection at 80% of a 600 MB clip lost the
 * recording, and the wizard advanced past the failure anyway. What is
 * pinned here is what replaced that:
 *
 * - the byte upload retries with backoff and RESUMES from its tus URL;
 * - every attempt re-PUTs the SAME object key;
 * - a failed `match_videos` write never deletes the bytes that landed, and
 *   a retry of it does not re-upload them;
 * - a failed upload leaves a retryable state rather than a dead end;
 * - the only path that deletes an uploaded object is a deliberate discard.
 *
 * It also keeps the older guarantees: jits-0lc (Result<T> from
 * upsertMatchVideo) and jits-hu0 (unmounting mid-upload does not cancel
 * the write).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockRemove = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    storage: {
      from: () => ({
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

// Only the sleep is doubled. `classifyUploadError` lives in the same module
// and is deliberately the REAL one: which statuses are retried is the point.
vi.mock("@jits/shared/utils", async (importActual) => ({
  ...(await importActual<typeof import("@jits/shared/utils")>()),
  backoffDelayMs: () => 0,
}));

const mockResumableUpload = vi.fn();

vi.mock("@/lib/video/resumable-upload", () => ({
  SUPABASE_TUS_CHUNK_SIZE: 6 * 1024 * 1024,
  uploadBlobResumable: (...args: unknown[]) => mockResumableUpload(...args),
}));

import {
  useVideoRecorder,
  WEB_ROW_MAX_ATTEMPTS,
  WEB_UPLOAD_MAX_ATTEMPTS,
} from "./use-video-recorder";

// jsdom has no MediaRecorder / getUserMedia; install minimal fakes.
let lastRecorder: FakeMediaRecorder | null = null;

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    // The test needs a handle on the instance the HOOK constructed, and
    // MediaRecorder exposes no other way to reach it.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

/** Shape of a tus DetailedError as far as the classifier is concerned. */
function httpError(status: number, message = "server said no"): Error {
  const err = new Error(message) as Error & { originalResponse: unknown };
  err.originalResponse = { getStatus: () => status };
  return err;
}

const RLS_FAILURE = { ok: false, error: { code: "UNKNOWN", message: "boom" } };

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  lastRecorder = null;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  mockResumableUpload.mockResolvedValue(undefined);
  // Successful-removal shape: storage-js resolves with the removed objects.
  mockRemove.mockResolvedValue({ data: [{ name: "M/A/123.webm" }], error: null });
  mockUpsert.mockResolvedValue({ ok: true, data: { id: "VID" } });
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
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

  it("reports real byte progress", async () => {
    mockResumableUpload.mockImplementation(
      async (opts: { onProgress?: (a: number, b: number) => void }) => {
        opts.onProgress?.(5, 10);
      },
    );
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    // Ends at 1 once the bytes are confirmed.
    expect(result.current.uploadProgress).toBe(1);
  });
});

describe("retrying the byte upload", () => {
  it("retries a dropped connection and resumes from the tus URL", async () => {
    mockResumableUpload
      .mockImplementationOnce(async (opts: { onUploadUrl?: (u: string) => void }) => {
        opts.onUploadUrl?.("https://up/abc");
        throw new Error("Network request failed");
      })
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(mockResumableUpload).toHaveBeenCalledTimes(2);
    const [first, second] = mockResumableUpload.mock.calls.map((c) => c[0]);
    // Same object key on every attempt: the storage UPDATE policy exists
    // for exactly this re-PUT, and a fresh key would strand the bytes the
    // server already holds.
    expect(first.path).toBe("M/A/123.webm");
    expect(second.path).toBe("M/A/123.webm");
    // And the retry resumes rather than restarting.
    expect(first.uploadUrl).toBeNull();
    expect(second.uploadUrl).toBe("https://up/abc");
  });

  it("discards an upload URL the server has dropped", async () => {
    mockResumableUpload
      .mockImplementationOnce(async (opts: { onUploadUrl?: (u: string) => void }) => {
        opts.onUploadUrl?.("https://up/expired");
        throw httpError(404);
      })
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(mockResumableUpload.mock.calls[1][0].uploadUrl).toBeNull();
  });

  it("gives up immediately on a failure waiting cannot fix", async () => {
    mockResumableUpload.mockRejectedValue(httpError(403, "row-level security"));
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(mockResumableUpload).toHaveBeenCalledTimes(1);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("leaves a RETRYABLE state after exhausting its automatic attempts", async () => {
    mockResumableUpload.mockRejectedValue(new Error("Network request failed"));
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(mockResumableUpload).toHaveBeenCalledTimes(WEB_UPLOAD_MAX_ATTEMPTS);
    // The recording is still in this page's memory, so the failure is a
    // decision for the user, not a dead end.
    expect(result.current.canRetryUpload).toBe(true);

    mockResumableUpload.mockResolvedValue(undefined);
    await act(async () => {
      result.current.retryUpload();
    });
    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(result.current.videoId).toBe("VID");
  });
});

describe("a failed match_videos write never destroys the uploaded bytes", () => {
  it("retries the row on its own budget and keeps the object", async () => {
    mockUpsert
      .mockResolvedValueOnce(RLS_FAILURE)
      .mockResolvedValueOnce({ ok: true, data: { id: "VID-2" } });

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(result.current.videoId).toBe("VID-2");
    // The bytes went up ONCE.
    expect(mockResumableUpload).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("keeps the object when every row attempt fails", async () => {
    mockUpsert.mockResolvedValue(RLS_FAILURE);
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);

    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));
    expect(mockUpsert).toHaveBeenCalledTimes(WEB_ROW_MAX_ATTEMPTS);
    // THE POINT: the bytes are the expensive, irreplaceable half. The old
    // hook deleted them on the first DB failure.
    expect(mockRemove).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/saving the video record failed: boom/);
    expect(result.current.canRetryUpload).toBe(true);
  });

  it("retries ONLY the row, never the bytes, once they have landed", async () => {
    mockUpsert.mockResolvedValue(RLS_FAILURE);
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));

    mockUpsert.mockResolvedValue({ ok: true, data: { id: "VID-3" } });
    await act(async () => {
      result.current.retryUpload();
    });

    await waitFor(() => expect(result.current.uploadStatus).toBe("done"));
    expect(result.current.videoId).toBe("VID-3");
    // One transfer for the whole story, however many row attempts it took.
    expect(mockResumableUpload).toHaveBeenCalledTimes(1);
  });
});

describe("discardUpload", () => {
  it("removes an orphaned object when the user abandons the recording", async () => {
    mockUpsert.mockResolvedValue(RLS_FAILURE);
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));

    await act(async () => {
      await result.current.discardUpload();
    });

    // The ONLY path that deletes uploaded bytes: a deliberate abandonment,
    // where the object would otherwise sit in the bucket unreachable.
    expect(mockRemove).toHaveBeenCalledWith(["M/A/123.webm"]);
    expect(result.current.uploadStatus).toBe("idle");
    expect(result.current.canRetryUpload).toBe(false);
  });

  it("does not attempt a pointless delete when no bytes ever landed", async () => {
    mockResumableUpload.mockRejectedValue(new Error("Network request failed"));
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));

    await act(async () => {
      await result.current.discardUpload();
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("reports a removal silently denied by RLS (data: []) without throwing", async () => {
    mockUpsert.mockResolvedValue(RLS_FAILURE);
    mockRemove.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    await waitFor(() => expect(result.current.uploadStatus).toBe("error"));

    await act(async () => {
      await result.current.discardUpload();
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("orphan cleanup failed"),
      expect.stringContaining("removed 0 objects"),
    );
  });
});

describe("unmounting mid-upload", () => {
  it("finishes the storage + DB write anyway (jits-hu0)", async () => {
    let resolveStorage!: () => void;
    mockResumableUpload.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          resolveStorage = res;
        }),
    );

    const { result, unmount } = renderHook(() => useVideoRecorder("M", "A"));
    await recordAndStop(result);
    expect(result.current.uploadStatus).toBe("uploading");

    // The step navigates away while the storage upload is in flight.
    unmount();
    resolveStorage();

    // The DB write still happens; the recording is not stranded as an
    // orphan storage object without a match_videos row.
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
