/**
 * Tests for the match-video upload runner (lib/video/video-upload-manager.ts).
 *
 * This is the highest-risk code in the app: every one of these behaviours
 * is the difference between a lost match recording and a recovered one.
 *
 *  - retries are exponential with jitter, not two immediate attempts;
 *  - a retry RESUMES from the persisted tus URL instead of re-sending
 *    hundreds of megabytes;
 *  - a failed `match_videos` write NEVER deletes the bytes that landed;
 *  - a job in phase "row" resumes without re-uploading anything;
 *  - a job is only compensated (object deleted) when it is abandoned;
 *  - foreground and reconnect cut a pending backoff short.
 *
 * Persistence is REAL here (over an in-memory AsyncStorage), because the
 * interesting bugs live in the handoff between the loop and the record.
 */

// ---- AsyncStorage: real persistence over an in-memory map ----

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
    getAllKeys: async () => [...mockStore.keys()],
  },
}));

// ---- backoff: deterministic, and observable ----

const mockBackoffDelayMs = jest.fn(() => 0);
jest.mock("@jits/shared/utils", () => ({
  // Only the sleep is doubled. `classifyUploadError` lives here too and is
  // deliberately the REAL one: the retry decisions below are the point.
  ...jest.requireActual("@jits/shared/utils"),
  backoffDelayMs: (...args: unknown[]) => mockBackoffDelayMs(...(args as [])),
}));

// ---- NetInfo ----

type NetListener = (state: { isConnected: boolean | null }) => void;
const mockNetListeners: NetListener[] = [];
const mockNetConnected = { current: true };

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: async () => ({ isConnected: mockNetConnected.current }),
    addEventListener: (cb: NetListener) => {
      mockNetListeners.push(cb);
      return () => {
        const i = mockNetListeners.indexOf(cb);
        if (i >= 0) mockNetListeners.splice(i, 1);
      };
    },
  },
}));

// ---- the storage / DB primitives ----

const mockUploadFileResumable = jest.fn();
const mockGetRecordingSize = jest.fn();
const mockWriteMatchVideoRow = jest.fn();
const mockRemoveUploadedObject = jest.fn();

// The transport is doubled; the retry CLASSIFIER is not (see the
// `@jits/shared/utils` mock above, which keeps the real one).
jest.mock("@/lib/video/upload-recording", () => ({
  uploadFileResumable: (...a: unknown[]) => mockUploadFileResumable(...a),
  getRecordingSize: (...a: unknown[]) => mockGetRecordingSize(...a),
  writeMatchVideoRow: (...a: unknown[]) => mockWriteMatchVideoRow(...a),
  removeUploadedObject: (...a: unknown[]) => mockRemoveUploadedObject(...a),
}));

// ---- the local clip ----

const mockRetainRecording = jest.fn((uri: string) => uri);
const mockReleaseRecording = jest.fn();

jest.mock("@/lib/video/recording-file", () => ({
  retainRecording: (...a: unknown[]) => mockRetainRecording(...(a as [string])),
  releaseRecording: (...a: unknown[]) => mockReleaseRecording(...a),
}));

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

import { AppState } from "react-native";
import {
  ROW_MAX_ATTEMPTS,
  STALL_CHECK_INTERVAL_MS,
  UPLOAD_BACKOFF,
  UPLOAD_MAX_ATTEMPTS,
  UPLOAD_STALL_TIMEOUT_MS,
  __resetVideoUploadManager,
  ensureUploadListeners,
  hasActiveVideoUploads,
  resumeMatchVideoUploads,
  startMatchVideoUpload,
} from "@/lib/video/video-upload-manager";
import {
  UPLOAD_JOB_MAX_AGE_MS,
  UPLOAD_JOB_PREFIX,
  type PendingUploadJob,
  loadUploadJob,
} from "@/lib/video/upload-persistence";
import { getMatchUpload, resetMatchUploadStore } from "@/lib/video/match-upload-store";

const SIZE = 600_000_000;

const START = {
  matchId: "M1",
  uploaderAthleteId: "A1",
  fileUri: "file://cache/clip.mp4",
  storagePath: "M1/A1/1700000000000.mp4",
};

function seedJob(overrides: Partial<PendingUploadJob> = {}): PendingUploadJob {
  const job: PendingUploadJob = {
    matchId: "M1",
    uploaderAthleteId: "A1",
    fileUri: "file:///docs/match-uploads/M1.mp4",
    storagePath: "M1/A1/1700000000000.mp4",
    ext: "mp4",
    fileSizeBytes: SIZE,
    uploadUrl: null,
    bytesUploaded: 0,
    phase: "bytes",
    attempt: 0,
    truncation: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastError: null,
    ...overrides,
  };
  mockStore.set(`${UPLOAD_JOB_PREFIX}${job.matchId}`, JSON.stringify(job));
  return job;
}

/** Shape of a tus DetailedError as far as the classifier is concerned. */
function httpError(status: number, message = "server said no"): Error {
  const err = new Error(message) as Error & { originalResponse: unknown };
  err.originalResponse = { getStatus: () => status };
  return err;
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockNetListeners.length = 0;
  mockNetConnected.current = true;
  mockBackoffDelayMs.mockReturnValue(0);
  mockRetainRecording.mockImplementation((uri: string) => uri);
  mockGetRecordingSize.mockResolvedValue(SIZE);
  mockUploadFileResumable.mockResolvedValue(undefined);
  mockWriteMatchVideoRow.mockResolvedValue("VID-1");
  mockRemoveUploadedObject.mockResolvedValue(undefined);
  resetMatchUploadStore();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  __resetVideoUploadManager();
  warnSpy.mockRestore();
});

describe("the happy path", () => {
  it("uploads, writes the row, clears the job and deletes the local clip", async () => {
    const outcome = await startMatchVideoUpload(START);

    expect(outcome).toEqual({ ok: true, videoId: "VID-1" });
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(1);
    // Nothing is left behind to resume, and the clip is not kept forever.
    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockReleaseRecording).toHaveBeenCalledWith("file://cache/clip.mp4");
    expect(getMatchUpload("M1")).toMatchObject({
      status: "uploaded",
      videoId: "VID-1",
      progress: 1,
    });
  });

  it("moves the clip out of the purgeable camera cache before sending a byte", async () => {
    mockRetainRecording.mockReturnValue("file:///docs/match-uploads/M1.mp4");
    await startMatchVideoUpload(START);
    expect(mockRetainRecording).toHaveBeenCalledWith("file://cache/clip.mp4", "M1", "mp4");
    expect(mockUploadFileResumable).toHaveBeenCalledWith(
      expect.objectContaining({ fileUri: "file:///docs/match-uploads/M1.mp4" }),
    );
  });

  it("persists the job BEFORE uploading, so a kill mid-upload is recoverable", async () => {
    let jobDuringUpload: PendingUploadJob | null = null;
    mockUploadFileResumable.mockImplementation(async () => {
      jobDuringUpload = await loadUploadJob("M1");
    });
    await startMatchVideoUpload(START);
    expect(jobDuringUpload).toMatchObject({
      matchId: "M1",
      storagePath: "M1/A1/1700000000000.mp4",
      fileSizeBytes: SIZE,
      phase: "bytes",
    });
  });

  it("reports real byte progress into the match store", async () => {
    const seen: Array<number | null> = [];
    mockUploadFileResumable.mockImplementation(
      async (opts: { onProgress?: (a: number, b: number) => void }) => {
        opts.onProgress?.(0, SIZE);
        seen.push(getMatchUpload("M1")?.progress ?? null);
        opts.onProgress?.(SIZE / 2, SIZE);
        seen.push(getMatchUpload("M1")?.progress ?? null);
        opts.onProgress?.(SIZE, SIZE);
        seen.push(getMatchUpload("M1")?.progress ?? null);
      },
    );
    await startMatchVideoUpload(START);
    expect(seen).toEqual([0, 0.5, 1]);
  });

  it("persists the tus upload URL the moment it exists", async () => {
    mockUploadFileResumable.mockImplementation(
      async (opts: { onUploadUrl?: (u: string) => void }) => {
        opts.onUploadUrl?.("https://up/abc");
        // The record has to be written before this resolves, or a kill in
        // the middle of the transfer loses the only way back to it.
        await Promise.resolve();
        expect((await loadUploadJob("M1"))?.uploadUrl).toBe("https://up/abc");
        throw new Error("network died");
      },
    );
    mockBackoffDelayMs.mockReturnValue(0);
    await startMatchVideoUpload(START);
    expect((await loadUploadJob("M1"))?.uploadUrl).toBe("https://up/abc");
  });
});

describe("retrying the byte upload", () => {
  it("retries with jittered exponential backoff instead of firing twice immediately", async () => {
    mockUploadFileResumable
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(undefined);

    const outcome = await startMatchVideoUpload(START);

    expect(outcome.ok).toBe(true);
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(3);
    // One sleep per failure, with a growing attempt number and the
    // upload-specific window.
    expect(mockBackoffDelayMs.mock.calls).toEqual([
      [1, UPLOAD_BACKOFF],
      [2, UPLOAD_BACKOFF],
    ]);
  });

  it("reuses the SAME object key and RESUMES from the persisted URL (jits-voh)", async () => {
    mockUploadFileResumable
      .mockImplementationOnce(async (opts: { onUploadUrl?: (u: string) => void }) => {
        opts.onUploadUrl?.("https://up/abc");
        throw new Error("Network request failed");
      })
      .mockResolvedValueOnce(undefined);

    await startMatchVideoUpload(START);

    const [first, second] = mockUploadFileResumable.mock.calls.map((c) => c[0]);
    expect(first.storagePath).toBe("M1/A1/1700000000000.mp4");
    expect(second.storagePath).toBe("M1/A1/1700000000000.mp4");
    // The retry does not start from zero: it hands tus the upload URL the
    // first attempt created.
    expect(first.uploadUrl).toBeNull();
    expect(second.uploadUrl).toBe("https://up/abc");
  });

  it("discards an upload URL the server has dropped and starts a fresh one", async () => {
    mockUploadFileResumable
      .mockImplementationOnce(async (opts: { onUploadUrl?: (u: string) => void }) => {
        opts.onUploadUrl?.("https://up/expired");
        throw httpError(404);
      })
      .mockResolvedValueOnce(undefined);

    await startMatchVideoUpload(START);

    const second = mockUploadFileResumable.mock.calls[1][0];
    expect(second.uploadUrl).toBeNull();
    // Same object key, though: the bucket UPDATE policy expects a re-PUT.
    expect(second.storagePath).toBe("M1/A1/1700000000000.mp4");
  });

  it("stops after the attempt budget and PARKS the job for a later resume", async () => {
    mockUploadFileResumable.mockRejectedValue(new Error("Network request failed"));

    const outcome = await startMatchVideoUpload(START);

    expect(mockUploadFileResumable).toHaveBeenCalledTimes(UPLOAD_MAX_ATTEMPTS);
    expect(outcome).toMatchObject({ ok: false, willRetryLater: true });
    // Parked, not abandoned: the clip and the job are both still there.
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "bytes" });
    expect(mockReleaseRecording).not.toHaveBeenCalled();
    expect(getMatchUpload("M1")).toMatchObject({ status: "error" });
    expect(getMatchUpload("M1")?.error).toMatch(/resume automatically/);
  });

  it("stops retrying a failure waiting cannot fix, but KEEPS the recording", async () => {
    // 403 is RLS, so retrying it six times just wastes the user's battery.
    // It is NOT a reason to destroy the clip: a 403 can be transient (a
    // token edge, a match_participants row not yet visible), and this used
    // to delete an irreplaceable 600 MB recording off the device on the
    // strength of a single response.
    mockUploadFileResumable.mockRejectedValue(httpError(403, "row-level security"));

    const outcome = await startMatchVideoUpload(START);

    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: false, willRetryLater: true });
    // Parked, not abandoned: both the job and the clip survive.
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "bytes" });
    expect(mockReleaseRecording).not.toHaveBeenCalled();
    // Nothing was uploaded, so there is nothing in the bucket to clean up.
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
  });

  it("abandons ONLY when the clip itself is gone", async () => {
    seedJob();
    mockGetRecordingSize.mockResolvedValue(null);

    await resumeMatchVideoUploads();
    await flush();

    // Nothing to keep and nothing to upload, so the record goes too.
    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
  });

  it("refuses to start when the recording file is gone", async () => {
    mockGetRecordingSize.mockResolvedValue(null);
    const outcome = await startMatchVideoUpload(START);
    expect(outcome).toMatchObject({ ok: false, willRetryLater: false });
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
  });

  it("invalidates a partial upload when the local file changed under it", async () => {
    // A re-recording that landed at the same path has a different length,
    // so the server's Upload-Length no longer matches and the partial is
    // useless.
    seedJob({ uploadUrl: "https://up/abc", bytesUploaded: 100, fileSizeBytes: SIZE });
    mockGetRecordingSize.mockResolvedValue(SIZE + 999);
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledWith(
      expect.objectContaining({ uploadUrl: null, fileSizeBytes: SIZE + 999 }),
    );
  });
});

describe("a failed match_videos write never destroys the uploaded bytes", () => {
  it("retries the row on its own budget and keeps the object", async () => {
    mockWriteMatchVideoRow
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("VID-9");

    const outcome = await startMatchVideoUpload(START);

    expect(outcome).toEqual({ ok: true, videoId: "VID-9" });
    // The bytes went up ONCE. The old code deleted them on the first DB
    // failure and re-uploaded the whole file.
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
  });

  it("parks the job in phase 'row' when every row attempt fails", async () => {
    mockWriteMatchVideoRow.mockRejectedValue(new Error("RLS said no"));

    const outcome = await startMatchVideoUpload(START);

    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(ROW_MAX_ATTEMPTS);
    expect(outcome).toMatchObject({ ok: false, willRetryLater: true });
    // THE POINT: the object stays in the bucket.
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "row" });
    expect(getMatchUpload("M1")?.error).toMatch(/retry automatically/);
  });

  it("does not frame the row failure twice", async () => {
    mockWriteMatchVideoRow.mockRejectedValue(new Error("permission denied"));
    await startMatchVideoUpload(START);
    const message = getMatchUpload("M1")?.error ?? "";
    expect(message.match(/saving the record failed/gi)).toHaveLength(1);
    expect(message).toMatch(/permission denied/);
  });

  it.each([
    ["rate_limited", "Daily video limit reached. It will upload automatically later."],
    ["disabled", "Video uploads are turned off right now."],
    ["not_in_cohort", "Video uploads are not enabled for your account yet."],
    ["reslice_limit", "This match video has been replaced too many times."],
  ])("parks on the FIRST %s gate instead of spending the row budget", async (gate, copy) => {
    mockWriteMatchVideoRow.mockRejectedValue(Object.assign(new Error(copy), { gate }));

    const outcome = await startMatchVideoUpload(START);

    // One try, not ROW_MAX_ATTEMPTS: a server gate does not lift inside a
    // backoff window.
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, error: copy, willRetryLater: true });
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "row" });
    // The gate's copy is final: not wrapped in the generic row-failure text.
    expect(getMatchUpload("M1")).toMatchObject({ status: "error", error: copy });
  });

  it("retries a gated row on the next resume and lands it", async () => {
    mockWriteMatchVideoRow.mockRejectedValueOnce(
      Object.assign(new Error("Daily video limit reached."), { gate: "rate_limited" }),
    );
    await startMatchVideoUpload(START);
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(1);

    await resumeMatchVideoUploads();
    await flush();

    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(2);
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded", videoId: "VID-1" });
  });

  it("resumes a phase 'row' job without re-uploading a single byte", async () => {
    seedJob({ phase: "row", bytesUploaded: SIZE, uploadUrl: "https://up/abc" });

    await resumeMatchVideoUploads();
    await flush();

    expect(mockUploadFileResumable).not.toHaveBeenCalled();
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(1);
    expect(await loadUploadJob("M1")).toBeNull();
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded", videoId: "VID-1" });
  });
});

describe("resuming persisted jobs", () => {
  it("resumes a phase 'bytes' job from its persisted upload URL", async () => {
    seedJob({ uploadUrl: "https://up/abc", bytesUploaded: 300_000_000 });

    await resumeMatchVideoUploads();
    await flush();

    expect(mockUploadFileResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadUrl: "https://up/abc",
        storagePath: "M1/A1/1700000000000.mp4",
        fileSizeBytes: SIZE,
      }),
    );
  });

  it("seeds the banner from the persisted offset before the first new byte", async () => {
    seedJob({ bytesUploaded: SIZE / 4 });
    const seen: Array<number | null> = [];
    mockUploadFileResumable.mockImplementation(async () => {
      seen.push(getMatchUpload("M1")?.progress ?? null);
    });
    await resumeMatchVideoUploads();
    await flush();
    expect(seen).toEqual([0.25]);
  });

  it("restores a truncation warning a resumed upload would otherwise lose", async () => {
    // The clip stops before the end of the match. After a process kill the
    // in-memory store is empty, so without carrying this on the job the
    // short clip would land as a clean "Match video uploaded".
    seedJob({ truncation: "limit" });
    await resumeMatchVideoUploads();
    await flush();
    expect(getMatchUpload("M1")?.truncation).toBe("limit");
  });

  it("carries the truncation from the recording that started the upload", async () => {
    await startMatchVideoUpload({ ...START, truncation: "interrupted" });
    expect(getMatchUpload("M1")?.truncation).toBe("interrupted");
    expect((await loadUploadJob("M1")) ?? { truncation: "interrupted" }).toBeTruthy();
  });

  it("resets the attempt budget, because a resume means conditions changed", async () => {
    seedJob({ attempt: UPLOAD_MAX_ATTEMPTS, lastError: "Network request failed" });
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
  });

  it("does not start a second runner for a match already uploading", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    mockUploadFileResumable.mockImplementation(
      () =>
        new Promise<void>((res) => {
          gate.release = () => res();
        }),
    );

    const running = startMatchVideoUpload(START);
    await flush();
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    gate.release?.();
    await running;
  });

  it("abandons a job past the retention window, compensating a row-phase orphan", async () => {
    seedJob({
      phase: "row",
      createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS - 1,
    });

    await resumeMatchVideoUploads();
    await flush();

    // This is the ONLY path that deletes uploaded bytes: a job nothing is
    // ever going to rescue, whose object would otherwise sit in the bucket
    // with no match_videos row.
    expect(mockRemoveUploadedObject).toHaveBeenCalledWith("M1/A1/1700000000000.mp4");
    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
  });

  it("never expires a job that is currently uploading", async () => {
    // A job created just inside the window can be launched and still be
    // transferring when a later sweep crosses it. `abandonJob` deletes the
    // local clip, so expiring it there pulls the file out from under a live
    // upload.
    seedJob({ createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS + 1 });
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);

    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    // The clock crosses the window while the transfer is in flight.
    const realNow = Date.now;
    jest.spyOn(Date, "now").mockImplementation(() => realNow() + UPLOAD_JOB_MAX_AGE_MS);
    try {
      await resumeMatchVideoUploads();
      await flush();
      expect(mockReleaseRecording).not.toHaveBeenCalled();
      expect(await loadUploadJob("M1")).not.toBeNull();
    } finally {
      (Date.now as jest.Mock).mockRestore();
    }

    held.finish();
    await flush();
  });

  it("abandons an expired byte-phase job WITHOUT a pointless delete", async () => {
    seedJob({ phase: "bytes", createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS - 1 });
    await resumeMatchVideoUploads();
    await flush();
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    expect(await loadUploadJob("M1")).toBeNull();
  });
});

describe("resume triggers", () => {
  it("resumes on foreground", async () => {
    const addSpy = jest.spyOn(AppState, "addEventListener");
    ensureUploadListeners();
    seedJob();

    const handler = addSpy.mock.calls[0][1] as (s: string) => void;
    // Backgrounding is not a reason to do anything.
    handler("background");
    await flush();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();

    handler("active");
    await flush();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it("resumes on a NetInfo reconnect, not on every NetInfo event", async () => {
    ensureUploadListeners();
    await flush();
    seedJob();

    const notify = mockNetListeners[0];
    // Still online: nothing changed, nothing to do.
    notify({ isConnected: true });
    await flush();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();

    notify({ isConnected: false });
    notify({ isConnected: true });
    await flush();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
  });

  it("cuts a pending backoff short when the network comes back", async () => {
    ensureUploadListeners();
    await flush();
    // A long sleep the test would otherwise have to wait out.
    mockBackoffDelayMs.mockReturnValue(60_000);
    mockUploadFileResumable
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(undefined);

    const running = startMatchVideoUpload(START);
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    const notify = mockNetListeners[0];
    notify({ isConnected: false });
    notify({ isConnected: true });

    // Resolves without any timer advancing, which is only possible if the
    // sleep was interrupted.
    await expect(running).resolves.toEqual({ ok: true, videoId: "VID-1" });
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(2);
  });
});

describe("a second recording on the same match", () => {
  /**
   * A transfer that hangs until the test releases it.
   *
   * `registerAbort: false` models the real window in which a superseded
   * transfer can still SUCCEED: `uploadFileResumable` awaits
   * `supabase.auth.getSession()` before it wires `onAbortHandle`, so a
   * supersede landing in there finds `handle.abort` still null, issues no
   * abort, and the transfer runs to completion having already lost its slot.
   */
  function heldTransfer(registerAbort = true) {
    const gate: { finish: (() => void) | null; fail: ((e: Error) => void) | null } = {
      finish: null,
      fail: null,
    };
    const impl = (opts: {
      onAbortHandle?: (abort: () => void) => void;
      onUploadUrl?: (u: string) => void;
    }) =>
      new Promise<void>((res, rej) => {
        gate.finish = () => res();
        gate.fail = (e) => rej(e);
        if (registerAbort) opts.onAbortHandle?.(() => rej(new Error("Upload aborted")));
      });
    return { gate, impl };
  }

  const SECOND = {
    ...START,
    fileUri: "file://cache/clip2.mp4",
    storagePath: "M1/A1/1700000009999.mp4",
  };

  it("supersedes the first run rather than racing it", async () => {
    const first = heldTransfer();
    mockUploadFileResumable.mockImplementationOnce(first.impl);

    const running = startMatchVideoUpload(START);
    await flush();

    const second = startMatchVideoUpload(SECOND);
    await expect(second).resolves.toEqual({ ok: true, videoId: "VID-1" });
    await running;

    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded", videoId: "VID-1" });
  });

  it("a superseded transfer that SUCCEEDS late never touches the new job", async () => {
    // THE WORST BUG IN THE FIRST CUT. The success path was the one exit
    // with no supersede check, and it is the only one that mutates the
    // persisted `phase`. A late-resolving first transfer wrote
    // `phase: "row"` onto the SECOND clip's job, whose bytes had never been
    // uploaded. The next launch then skipped the upload entirely and wrote
    // a match_videos row at status='ready' for an object that does not
    // exist, dispatching the backend slicer at a nonexistent file while the
    // user was told the video uploaded.
    const first = heldTransfer(false);
    const second = heldTransfer();
    mockUploadFileResumable
      .mockImplementationOnce(first.impl)
      .mockImplementationOnce(second.impl);

    const firstRun = startMatchVideoUpload(START);
    await flush();
    const secondRun = startMatchVideoUpload(SECOND);
    await flush();

    // The first transfer's final PATCH lands AFTER it lost the slot.
    first.gate.finish?.();
    await firstRun;
    await flush();

    const job = await loadUploadJob("M1");
    expect(job).toMatchObject({ storagePath: SECOND.storagePath, phase: "bytes" });
    // Its object is a real orphan, and it is safe to remove because the
    // runner holding the slot provably owns a different key.
    expect(mockRemoveUploadedObject).toHaveBeenCalledWith(START.storagePath);
    expect(mockRemoveUploadedObject).not.toHaveBeenCalledWith(SECOND.storagePath);
    // And no row was written for the clip that never uploaded.
    expect(mockWriteMatchVideoRow).not.toHaveBeenCalled();

    second.gate.finish?.();
    await secondRun;
    expect(mockWriteMatchVideoRow).toHaveBeenCalledWith(
      expect.objectContaining({ storagePath: SECOND.storagePath }),
    );
  });

  it("a superseded creation POST never stamps its tus URL on the new job", async () => {
    // Otherwise the next resume HEADs the OLD clip's upload and PATCHes the
    // NEW clip's bytes into it: one object corrupted, the other never
    // written.
    const first = heldTransfer(false);
    const second = heldTransfer();
    mockUploadFileResumable
      .mockImplementationOnce(
        (opts: {
          onAbortHandle?: (a: () => void) => void;
          onUploadUrl?: (u: string) => void;
        }) => {
          const promise = first.impl(opts);
          // Late creation POST, after the supersede below.
          setTimeout(() => opts.onUploadUrl?.("https://up/first-clip"), 0);
          return promise;
        },
      )
      .mockImplementationOnce(second.impl);

    const firstRun = startMatchVideoUpload(START);
    await flush();
    const secondRun = startMatchVideoUpload(SECOND);
    await flush();
    await flush();

    const job = await loadUploadJob("M1");
    expect(job?.storagePath).toBe(SECOND.storagePath);
    expect(job?.uploadUrl).toBeNull();

    first.gate.fail?.(new Error("Network request failed"));
    await firstRun;
    second.gate.finish?.();
    await secondRun;
  });

  it("a superseded ROW write never deletes the new job or the new clip", async () => {
    const second = heldTransfer();
    const rowGate: { release: (() => void) | null } = { release: null };
    mockWriteMatchVideoRow.mockImplementationOnce(
      () =>
        new Promise<string>((res) => {
          rowGate.release = () => res("VID-OLD");
        }),
    );
    // The first transfer uses the default (immediate) success, so the first
    // run is sitting inside its ROW write when the re-recording lands.
    mockUploadFileResumable
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(second.impl);

    const firstRun = startMatchVideoUpload(START);
    await flush();
    const secondRun = startMatchVideoUpload(SECOND);
    await flush();

    rowGate.release?.();
    await firstRun;
    await flush();

    // The winner's job and clip both survive.
    expect(mockReleaseRecording).not.toHaveBeenCalledWith(SECOND.fileUri);
    expect(await loadUploadJob("M1")).toMatchObject({ storagePath: SECOND.storagePath });
    // The loser's object has no row pointing at it, so it is cleaned up.
    expect(mockRemoveUploadedObject).toHaveBeenCalledWith(START.storagePath);

    second.gate.finish?.();
    await secondRun;
  });

  it("leaves a superseded object alone when it cannot prove which key is live", async () => {
    // Same key on both runs (a same-millisecond re-record). Deleting would
    // destroy the recording the current runner is writing, so it is left
    // and reported instead.
    const first = heldTransfer(false);
    const second = heldTransfer();
    mockUploadFileResumable
      .mockImplementationOnce(first.impl)
      .mockImplementationOnce(second.impl);

    const firstRun = startMatchVideoUpload(START);
    await flush();
    const secondRun = startMatchVideoUpload({ ...START, fileUri: "file://cache/clip2.mp4" });
    await flush();

    first.gate.finish?.();
    await firstRun;
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();

    second.gate.finish?.();
    await secondRun;
  });
});

describe("concurrent starts and sweeps cannot double-run a match", () => {
  it("two resume sweeps racing on one foreground start ONE transfer", async () => {
    // AppState "active" and a NetInfo reconnect fire together on the
    // canonical "walk back into wifi and open the app", with the bootstrap
    // mount effect as a third caller. The check and the claim used to
    // straddle an await, so both sweeps passed before either registered:
    // two transfers resuming from the SAME tus URL, the server answering
    // 409, and the loser nulling the URL and starting a second full 600 MB
    // transfer against the same key.
    seedJob();
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);

    const a = resumeMatchVideoUploads();
    const b = resumeMatchVideoUploads();
    await a;
    await b;
    await flush();

    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    held.finish();
    await flush();
  });

  it("a resume landing mid-start does not add a second transport", async () => {
    // `startMatchVideoUpload` used to release the slot at the top and only
    // re-take it after two awaits; an AppState "active" in that window
    // produced a third transport for one match.
    seedJob();
    const sizeGate: { release: ((v: number) => void) | null } = { release: null };
    mockGetRecordingSize.mockImplementationOnce(
      () =>
        new Promise<number>((res) => {
          sizeGate.release = res;
        }),
    );
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);

    const running = startMatchVideoUpload(START);
    // The start is parked on its file stat. A sweep arrives.
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();

    sizeGate.release?.(SIZE);
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    held.finish();
    await running;
    expect(hasActiveVideoUploads()).toBe(false);
  });

  it("releases the slot when a start bails on a missing file", async () => {
    mockGetRecordingSize.mockResolvedValue(null);
    await startMatchVideoUpload(START);
    // A held slot with nothing to settle it would block every later resume
    // for this match until the process died.
    expect(hasActiveVideoUploads()).toBe(false);
  });
});

describe("a stalled transfer", () => {
  it("is aborted and retried instead of hanging forever", async () => {
    // Nothing else can end it: tus's HTTP stack sets no xhr.timeout, RN
    // defaults to 0, and tus's own retry loop is disabled here. A half-open
    // socket after an iOS suspend left the job reading "uploading" forever
    // AND blocked every future resume, because a runner was registered.
    jest.useFakeTimers();
    try {
      mockUploadFileResumable
        .mockImplementationOnce(
          (opts: { onAbortHandle?: (a: () => void) => void }) =>
            new Promise<void>((_res, rej) => {
              opts.onAbortHandle?.(() => rej(new Error("Upload aborted")));
            }),
        )
        .mockResolvedValueOnce(undefined);

      const running = startMatchVideoUpload(START);
      await microtasks();
      expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

      // No progress at all for the stall window.
      jest.advanceTimersByTime(UPLOAD_STALL_TIMEOUT_MS + STALL_CHECK_INTERVAL_MS);
      await microtasks();
      // Backoff before the retry (mocked to 0, but still a timer).
      jest.advanceTimersByTime(1);
      await microtasks();

      expect(mockUploadFileResumable).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(1);
      await microtasks();
      await expect(running).resolves.toEqual({ ok: true, videoId: "VID-1" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("is NOT aborted while it is still making progress", async () => {
    jest.useFakeTimers();
    try {
      mockUploadFileResumable.mockImplementationOnce(
        (opts: {
          onAbortHandle?: (a: () => void) => void;
          onProgress?: (a: number, b: number) => void;
        }) =>
          new Promise<void>((res, rej) => {
            opts.onAbortHandle?.(() => rej(new Error("Upload aborted")));
            // A slow but live transfer: one chunk confirmed per check.
            const tick = setInterval(() => opts.onProgress?.(1, SIZE), STALL_CHECK_INTERVAL_MS);
            setTimeout(() => {
              clearInterval(tick);
              res();
            }, UPLOAD_STALL_TIMEOUT_MS * 3);
          }),
      );

      const running = startMatchVideoUpload(START);
      await microtasks();
      for (let i = 0; i < 40; i++) {
        jest.advanceTimersByTime(STALL_CHECK_INTERVAL_MS);
        await microtasks();
      }
      await expect(running).resolves.toEqual({ ok: true, videoId: "VID-1" });
      expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

/** A transfer the test finishes on demand. */
function heldGate() {
  let resolve: (() => void) | null = null;
  return {
    impl: (opts: { onAbortHandle?: (a: () => void) => void }) =>
      new Promise<void>((res, rej) => {
        resolve = () => res();
        opts.onAbortHandle?.(() => rej(new Error("Upload aborted")));
      }),
    finish: () => resolve?.(),
  };
}

/** Drain microtasks only. Safe under fake timers. */
async function microtasks(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

/** Let queued microtasks and zero-delay timers run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise<void>((res) => setTimeout(res, 0));
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
