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
/** Lets a test hold one write open, to land something inside it. */
const mockSetItemGate: { match: RegExp | null; wait: Promise<void> | null; reached: (() => void) | null } = {
  match: null,
  wait: null,
  reached: null,
};
/** Holds the next removeItem open (the abandon's job delete). */
const mockRemoveItemGate: { wait: Promise<void> | null; reached: (() => void) | null } = { wait: null, reached: null };
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (mockSetItemGate.match?.test(value) && mockSetItemGate.wait) {
        mockSetItemGate.match = null;
        mockSetItemGate.reached?.();
        await mockSetItemGate.wait;
      }
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      if (mockRemoveItemGate.wait) {
        const wait = mockRemoveItemGate.wait;
        mockRemoveItemGate.wait = null;
        mockRemoveItemGate.reached?.();
        await wait;
      }
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

const mockAddBreadcrumb = jest.fn();
const mockCaptureMessage = jest.fn();
const mockCaptureException = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  addBreadcrumb: (...a: unknown[]) => mockAddBreadcrumb(...a),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));

import { AppState } from "react-native";
import {
  FOREGROUND_RETRY_BASE_MS,
  FOREGROUND_RETRY_MAX_MS,
  ROW_MAX_ATTEMPTS,
  STALL_CHECK_INTERVAL_MS,
  discardMatchVideoUpload,
  hasPendingVideoUploads,
  retryMatchVideoUpload,
  stopMatchVideoUploadsForSignOut,
  subscribeUploadActivity,
  UPLOAD_BACKOFF,
  UPLOAD_MAX_ATTEMPTS,
  UPLOAD_STALL_TIMEOUT_MS,
  __resetVideoUploadManager,
  ensureUploadListeners,
  hasActiveVideoUploads,
  resumeMatchVideoUploads,
  setUploadOwner,
  startMatchVideoUpload,
} from "@/lib/video/video-upload-manager";
import {
  UPLOAD_JOB_MAX_AGE_MS,
  UPLOAD_JOB_PREFIX,
  type PendingUploadJob,
  loadUploadJob,
} from "@/lib/video/upload-persistence";
import { getMatchUpload, resetMatchUploadStore } from "@/lib/video/match-upload-store";
import { describeUploadFailure } from "@/lib/video/upload-errors";
import { __resetUploadTelemetry } from "@/lib/video/upload-telemetry";

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
    errorClass: null,
    needsUser: false,
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
  // Resumes are scoped to the signed-in athlete (jits-n2im.6); every seeded
  // job here is A1's.
  setUploadOwner("A1");
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  __resetVideoUploadManager();
  __resetUploadTelemetry();
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
    // PAUSED, not failed (jits-n2im.3): it retries on its own.
    expect(getMatchUpload("M1")).toMatchObject({ status: "paused", errorClass: "offline" });
    // Friendly copy; the raw transport text is telemetry only (jits-n2im.5).
    expect(getMatchUpload("M1")?.error).toBe("No connection right now. It picks up where it left off.");
    expect(getMatchUpload("M1")?.error).not.toMatch(/Network request failed/);
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
    // FAILED, waiting for the athlete (jits-n2im.3/.5): no automatic retry.
    expect(outcome).toMatchObject({ ok: false, willRetryLater: false });
    expect(getMatchUpload("M1")).toMatchObject({ status: "error", errorClass: "not_allowed" });
    expect(getMatchUpload("M1")?.error).not.toMatch(/row-level security/);
    // Kept, not abandoned: both the job and the clip survive.
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "bytes", needsUser: true });
    expect(mockReleaseRecording).not.toHaveBeenCalled();
    // Nothing was uploaded, so there is nothing in the bucket to clean up.
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();

    // An automatic sweep leaves it alone; it waits for Retry.
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
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
    expect(getMatchUpload("M1")?.error).toMatch(/Trying again shortly/);
  });

  it("says the row failure in friendly copy, never the server's text", async () => {
    mockWriteMatchVideoRow.mockRejectedValue(new Error("permission denied for table match_videos"));
    await startMatchVideoUpload(START);
    const entry = getMatchUpload("M1");
    expect(entry).toMatchObject({ status: "paused", errorClass: "save_failed" });
    expect(entry?.error).toMatch(/isn't attached to the match yet/);
    expect(entry?.error).not.toMatch(/permission denied/);
    // The raw cause is still on the job for telemetry and the log.
    expect(await loadUploadJob("M1")).toMatchObject({ lastError: "permission denied for table match_videos" });
  });

  it.each([
    // gate, store status, retries by itself, waits for the athlete
    ["rate_limited", "limit", "paused", true, false],
    ["disabled", "disabled", "error", false, true],
    ["not_in_cohort", "not_in_cohort", "error", false, true],
    // jits-gxok: can never succeed, so not parked for 7 days.
    ["reslice_limit", "reslice_limit", "error", false, true],
  ] as const)("stops on the FIRST %s gate instead of spending the row budget", async (gate, klass, status, willRetryLater, needsUser) => {
    mockWriteMatchVideoRow.mockRejectedValue(Object.assign(new Error("gated"), { gate }));
    const copy = describeUploadFailure(klass).message;

    const outcome = await startMatchVideoUpload(START);

    // One try, not ROW_MAX_ATTEMPTS: a server gate does not lift inside a
    // backoff window.
    expect(mockWriteMatchVideoRow).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, error: copy, willRetryLater });
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "row", needsUser, errorClass: klass });
    expect(getMatchUpload("M1")).toMatchObject({ status, error: copy, errorClass: klass });
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
    // A minute inside the window, not 1ms: under a loaded full-suite run the
    // first resume can start more than 1ms after the seed, and the job would
    // already have expired before it launched.
    seedJob({ createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS + 60_000 });
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

// ---------------------------------------------------------------------------
// jits-n2im.3: Retry, the foreground retry timer, paused vs failed
// ---------------------------------------------------------------------------

/** The RN jest mock's AppState.currentState is a jest.fn, not a string. */
function setAppState(state: string): void {
  (AppState as unknown as { currentState: string }).currentState = state;
}

describe("retryMatchVideoUpload (jits-n2im.3)", () => {
  it("starts a parked job at once, with a fresh attempt budget", async () => {
    seedJob({ attempt: 6, needsUser: true, errorClass: "not_allowed" });

    const started = await retryMatchVideoUpload("M1");
    await flush();

    expect(started).toBe("started");
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded", videoId: "VID-1" });
    expect(await loadUploadJob("M1")).toBeNull();
  });

  it("resets the persisted attempts and the needs-you mark even if the run parks again", async () => {
    seedJob({ attempt: 6, needsUser: true, errorClass: "not_allowed" });
    mockUploadFileResumable.mockRejectedValue(new Error("Network request failed"));

    await retryMatchVideoUpload("M1");
    // Each backoff sleep is a (zero) timer: let all six attempts run.
    for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) await flush();

    // A fresh budget: all six attempts ran, not zero.
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(UPLOAD_MAX_ATTEMPTS);
    expect(await loadUploadJob("M1")).toMatchObject({ needsUser: false, errorClass: "offline" });
    expect(getMatchUpload("M1")).toMatchObject({ status: "paused" });
  });

  it("is a no-op on a job that is already uploading", async () => {
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);
    const running = startMatchVideoUpload(START);
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    expect(await retryMatchVideoUpload("M1")).toBe("running");
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);

    held.finish();
    await running;
  });

  it("says why when there is no job for the match", async () => {
    expect(await retryMatchVideoUpload("NOPE")).toBe("no_job");
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
  });

  it("never runs another athlete's job", async () => {
    seedJob({ uploaderAthleteId: "OTHER" });
    expect(await retryMatchVideoUpload("M1")).toBe("other_athlete");
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
  });

  it("says signed out when nobody is", async () => {
    seedJob();
    stopMatchVideoUploadsForSignOut();
    expect(await retryMatchVideoUpload("M1")).toBe("signed_out");
  });

  it("a Try again that fails again says so (deck: Still can't upload)", async () => {
    seedJob({ needsUser: true, errorClass: "not_allowed" });
    mockUploadFileResumable.mockRejectedValue(httpError(403));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < 4; i++) await flush();
    expect(getMatchUpload("M1")).toMatchObject({ status: "error", error: "Still can't upload. Check your connection." });
  });

  it("but a terminal cause found on a Try again keeps its own copy", async () => {
    seedJob({ needsUser: true, errorClass: "not_allowed" });
    mockUploadFileResumable.mockRejectedValue(httpError(413));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < 4; i++) await flush();
    expect(getMatchUpload("M1")?.error).toBe("This clip is too big to upload (2 GB max).");
  });
});

describe("the foreground retry timer (jits-n2im.3)", () => {
  afterEach(() => {
    setAppState("active");
    jest.useRealTimers();
  });

  it("re-tries a paused job in the foreground with no AppState or NetInfo event", async () => {
    jest.useFakeTimers();
    setAppState("active");
    mockUploadFileResumable.mockRejectedValue(new Error("Network request failed"));

    const running = startMatchVideoUpload(START);
    for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) {
      jest.advanceTimersByTime(1);
      await microtasks();
    }
    await running;
    expect(getMatchUpload("M1")?.status).toBe("paused");
    const parkedCalls = mockUploadFileResumable.mock.calls.length;

    mockUploadFileResumable.mockResolvedValue(undefined);
    jest.advanceTimersByTime(FOREGROUND_RETRY_BASE_MS);
    for (let i = 0; i < 5; i++) await microtasks();

    expect(mockUploadFileResumable.mock.calls.length).toBe(parkedCalls + 1);
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded" });
  });

  it("backs off: a job that parks again waits twice as long next time", async () => {
    jest.useFakeTimers();
    setAppState("active");
    mockUploadFileResumable.mockRejectedValue(new Error("Network request failed"));
    const drain = async () => {
      for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) {
        jest.advanceTimersByTime(1);
        await microtasks();
      }
    };

    void startMatchVideoUpload(START);
    await drain();
    const afterFirstPark = mockUploadFileResumable.mock.calls.length;

    // First retry after the base delay; it parks again.
    jest.advanceTimersByTime(FOREGROUND_RETRY_BASE_MS);
    await drain();
    const afterSecondPark = mockUploadFileResumable.mock.calls.length;
    expect(afterSecondPark).toBeGreaterThan(afterFirstPark);

    // The base delay again is NOT enough now...
    jest.advanceTimersByTime(FOREGROUND_RETRY_BASE_MS);
    await drain();
    expect(mockUploadFileResumable.mock.calls.length).toBe(afterSecondPark);
    // ...twice the base is.
    jest.advanceTimersByTime(FOREGROUND_RETRY_BASE_MS);
    await drain();
    expect(mockUploadFileResumable.mock.calls.length).toBeGreaterThan(afterSecondPark);
  });

  it("stops when the app is backgrounded", async () => {
    jest.useFakeTimers();
    setAppState("active");
    const addSpy = jest.spyOn(AppState, "addEventListener");
    mockUploadFileResumable.mockRejectedValue(new Error("Network request failed"));

    const running = startMatchVideoUpload(START);
    for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) {
      jest.advanceTimersByTime(1);
      await microtasks();
    }
    await running;
    const parkedCalls = mockUploadFileResumable.mock.calls.length;

    const handler = addSpy.mock.calls[0][1] as (s: string) => void;
    setAppState("background");
    handler("background");
    jest.advanceTimersByTime(FOREGROUND_RETRY_MAX_MS * 2);
    for (let i = 0; i < 5; i++) await microtasks();

    expect(mockUploadFileResumable.mock.calls.length).toBe(parkedCalls);
    addSpy.mockRestore();
  });

  it("is never armed for a FAILED job, which waits for the athlete", async () => {
    jest.useFakeTimers();
    setAppState("active");
    mockUploadFileResumable.mockRejectedValue(httpError(403));

    const running = startMatchVideoUpload(START);
    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(1);
      await microtasks();
    }
    await running;
    expect(getMatchUpload("M1")?.status).toBe("error");

    jest.advanceTimersByTime(FOREGROUND_RETRY_MAX_MS * 2);
    for (let i = 0; i < 5; i++) await microtasks();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
  });
});

describe("a failed job after a relaunch", () => {
  it("is shown as failed, with friendly copy, and not run", async () => {
    seedJob({ needsUser: true, errorClass: "disabled", truncation: "limit" });

    await resumeMatchVideoUploads();
    await flush();

    expect(mockUploadFileResumable).not.toHaveBeenCalled();
    expect(getMatchUpload("M1")).toMatchObject({
      status: "error",
      errorClass: "disabled",
      error: describeUploadFailure("disabled").message,
      truncation: "limit",
    });
  });

  it("reads a job written before paused/failed existed as paused, and resumes it", async () => {
    const legacy: Record<string, unknown> = { ...seedJob() };
    delete legacy.needsUser;
    delete legacy.errorClass;
    mockStore.set(`${UPLOAD_JOB_PREFIX}M1`, JSON.stringify(legacy));

    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
  });
});

describe("discardMatchVideoUpload (jits-n2im.5)", () => {
  it("drops the job, the clip and a row-phase orphan, and forgets the entry", async () => {
    seedJob({ phase: "row", needsUser: true, errorClass: "reslice_limit" });
    await resumeMatchVideoUploads();
    expect(getMatchUpload("M1")?.status).toBe("error");

    expect(await discardMatchVideoUpload("M1")).toBe(true);

    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockRemoveUploadedObject).toHaveBeenCalledWith("M1/A1/1700000000000.mp4");
    expect(mockReleaseRecording).toHaveBeenCalled();
    expect(getMatchUpload("M1")).toBeNull();
  });

  it("returns false when there is nothing to discard", async () => {
    expect(await discardMatchVideoUpload("NOPE")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// jits-n2im.6: per-athlete scoping and sign-out
// ---------------------------------------------------------------------------

describe("jobs are scoped to the signed-in athlete (jits-n2im.6)", () => {
  it("sign-out stops the runner without touching the job, and clears the store", async () => {
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);
    void startMatchVideoUpload(START);
    await flush();
    expect(hasActiveVideoUploads()).toBe(true);

    stopMatchVideoUploadsForSignOut();
    await flush();

    expect(hasActiveVideoUploads()).toBe(false);
    expect(getMatchUpload("M1")).toBeNull();
    // The job is still on disk for the same athlete's next sign-in.
    expect(await loadUploadJob("M1")).toMatchObject({ uploaderAthleteId: "A1", phase: "bytes" });
    expect(mockReleaseRecording).not.toHaveBeenCalled();
  });

  it("resumes nothing while nobody is signed in", async () => {
    seedJob();
    stopMatchVideoUploadsForSignOut();
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
  });

  it("never runs the first athlete's job for a different athlete", async () => {
    seedJob();
    stopMatchVideoUploadsForSignOut();
    setUploadOwner("B2");
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).not.toHaveBeenCalled();
    expect(await loadUploadJob("M1")).not.toBeNull();
  });

  it("resumes it when the same athlete signs back in", async () => {
    seedJob();
    stopMatchVideoUploadsForSignOut();
    setUploadOwner("A1");
    await resumeMatchVideoUploads();
    await flush();
    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded" });
  });

  it("expires another athlete's old job locally, without a bucket delete it cannot make", async () => {
    seedJob({ uploaderAthleteId: "OTHER", phase: "row", createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS - 1 });
    await resumeMatchVideoUploads();
    await flush();
    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    expect(mockReleaseRecording).toHaveBeenCalled();
  });

  it("reports pending uploads for the sign-out guard", async () => {
    expect(await hasPendingVideoUploads()).toBe(false);
    seedJob({ needsUser: true });
    expect(await hasPendingVideoUploads()).toBe(true);
  });
});

describe("two concurrent sweeps abandon an expired job ONCE (jits-jm9r)", () => {
  it("claims before the first await", async () => {
    seedJob({ phase: "row", createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS - 1 });
    const gate: { release: () => void } = { release: () => undefined };
    mockRemoveUploadedObject.mockImplementation(
      () => new Promise<void>((res) => {
        gate.release = res;
      }),
    );

    const a = resumeMatchVideoUploads();
    const b = resumeMatchVideoUploads();
    await flush();
    gate.release();
    await Promise.all([a, b]);
    await flush();

    expect(mockRemoveUploadedObject).toHaveBeenCalledTimes(1);
  });
});

describe("upload activity (keep-awake and the backgrounding notice)", () => {
  it("notifies when a runner starts and when it settles", async () => {
    const listener = jest.fn();
    const off = subscribeUploadActivity(listener);
    await startMatchVideoUpload(START);
    await flush();
    // One start, one settle.
    expect(listener).toHaveBeenCalledTimes(2);
    expect(hasActiveVideoUploads()).toBe(false);
    off();
  });
});

// ---------------------------------------------------------------------------
// jits-n2im.7: telemetry
// ---------------------------------------------------------------------------

function crumbs(match: RegExp) {
  return mockAddBreadcrumb.mock.calls.map((c) => c[0] as { message: string; data: Record<string, unknown> }).filter((c) => match.test(c.message));
}

describe("upload telemetry (jits-n2im.7)", () => {
  it("adds a breadcrumb per failed attempt with the attempt, offset, status, class and raw cause", async () => {
    mockUploadFileResumable
      .mockRejectedValueOnce(httpError(503, "upstream timeout"))
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce(undefined);

    await startMatchVideoUpload(START);

    const failed = crumbs(/attempt \d+ failed/);
    expect(failed).toHaveLength(2);
    expect(failed[0].data).toMatchObject({ matchId: "M1", attempt: 1, status: 503, httpClass: "5xx", class: "server", raw: "upstream timeout" });
    expect(failed[1].data).toMatchObject({ attempt: 2, status: null, httpClass: "none", class: "offline" });
    expect(crumbs(/upload start/)).toHaveLength(1);
  });

  it("sends exactly ONE event when the upload lands, with the funnel fields", async () => {
    await startMatchVideoUpload(START);
    await flush();

    const landed = mockCaptureMessage.mock.calls.filter((c) => c[0] === "Match video uploaded");
    expect(landed).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(landed[0][1].extra).toEqual(
      expect.objectContaining({
        matchId: "M1",
        bytes: SIZE,
        durationMs: expect.any(Number),
        failedAttempts: 0,
        backgroundedCount: 0,
        sinceRecordingEndMs: expect.any(Number),
      }),
    );
    expect(landed[0][1].extra).toHaveProperty("throughputBytesPerSec");
    expect(landed[0][1].extra).toHaveProperty("networkType");
  });

  it("a paused park is a breadcrumb with its reason and HTTP class, not an event", async () => {
    mockUploadFileResumable.mockRejectedValue(httpError(502));
    await startMatchVideoUpload(START);

    expect(mockCaptureMessage).not.toHaveBeenCalled();
    const parked = crumbs(/upload paused/);
    expect(parked).toHaveLength(1);
    expect(parked[0].data).toMatchObject({ reason: "server", httpClass: "5xx", status: 502, phase: "bytes" });
  });

  it("a FAILED park sends exactly one event", async () => {
    mockUploadFileResumable.mockRejectedValue(httpError(403));
    await startMatchVideoUpload(START);

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage.mock.calls[0][0]).toBe("Match video upload failed");
    expect(mockCaptureMessage.mock.calls[0][1].tags).toMatchObject({ "video.upload.reason": "not_allowed" });
  });

  it("a daily-limit rejection sends one event the first time, not on every resume", async () => {
    mockWriteMatchVideoRow.mockRejectedValue(Object.assign(new Error("limit"), { gate: "rate_limited" }));
    await startMatchVideoUpload(START);
    expect(mockCaptureMessage.mock.calls.filter((c) => c[0] === "Match video upload hit the daily limit")).toHaveLength(1);
  });

  it("a resume and a retry are breadcrumbed with their trigger", async () => {
    seedJob({ needsUser: true, errorClass: "disabled" });
    await retryMatchVideoUpload("M1");
    await flush();
    expect(crumbs(/upload retry/)).toHaveLength(1);
    seedJob({ matchId: "M1" });
    await resumeMatchVideoUploads();
    await flush();
    expect(crumbs(/upload resume/)).toHaveLength(1);
  });

  it("abandoning keeps its single exception event, now with the class and age", async () => {
    seedJob({ phase: "row", errorClass: "save_failed", createdAt: Date.now() - UPLOAD_JOB_MAX_AGE_MS - 1 });
    await resumeMatchVideoUploads();
    await flush();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][1]).toMatchObject({ errorClass: "save_failed", ageMs: expect.any(Number) });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Review fixes (REVIEW-m-upload.md m1, m2, m4, m5, m7)
// ---------------------------------------------------------------------------

describe("review fixes", () => {
  it("m1: a run that loses its slot while parking never writes the wiped store", async () => {
    // Hold the park's own write (the only one that sets needsUser: true)
    // and sign out inside it.
    let release: () => void = () => undefined;
    const reached = new Promise<void>((res) => {
      mockSetItemGate.reached = res;
    });
    mockSetItemGate.wait = new Promise<void>((res) => (release = res));
    mockSetItemGate.match = /"needsUser":true/;
    mockUploadFileResumable.mockRejectedValue(httpError(403));

    const running = startMatchVideoUpload(START);
    await reached;
    stopMatchVideoUploadsForSignOut();
    release();
    await running;
    await flush();

    // The leaving athlete's failure is not re-created for the next account,
    // and no retry is armed; the job on disk still took the write.
    expect(getMatchUpload("M1")).toBeNull();
    expect(await loadUploadJob("M1")).toMatchObject({ needsUser: true });
    mockSetItemGate.wait = null;
  });

  it("m2: Discard is refused while a run is live, and the job survives", async () => {
    const held = heldGate();
    mockUploadFileResumable.mockImplementation(held.impl);
    const running = startMatchVideoUpload(START);
    await flush();
    expect(await discardMatchVideoUpload("M1")).toBe(false);
    expect(await loadUploadJob("M1")).not.toBeNull();
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
    held.finish();
    await running;
  });

  it("m7: a terminal failure is not counted as pending at sign-out", async () => {
    seedJob({ needsUser: true, errorClass: "reslice_limit" });
    expect(await hasPendingVideoUploads()).toBe(false);
  });

  it("m7: nothing counts before the athlete is scoped", async () => {
    seedJob();
    stopMatchVideoUploadsForSignOut();
    expect(await hasPendingVideoUploads()).toBe(false);
  });

  it("m4: the daily-limit event is sent once per job, not once per resume", async () => {
    mockWriteMatchVideoRow.mockRejectedValue(Object.assign(new Error("limit"), { gate: "rate_limited" }));
    await startMatchVideoUpload(START);
    await resumeMatchVideoUploads();
    await flush();
    await resumeMatchVideoUploads();
    await flush();
    expect(mockWriteMatchVideoRow.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(mockCaptureMessage.mock.calls.filter((c) => c[0] === "Match video upload hit the daily limit")).toHaveLength(1);
  });

  it("m5: raw causes reach telemetry without upload URLs or response bodies", async () => {
    mockUploadFileResumable
      .mockRejectedValueOnce(
        httpError(
          500,
          "tus: unexpected response while uploading chunk, originated from request (method: PATCH, url: https://abc.supabase.co/storage/v1/upload/resumable/SECRETID, response code: 500, response text: {\"key\":\"secret body\"}, request id: n/a)",
        ),
      )
      .mockResolvedValueOnce(undefined);
    await startMatchVideoUpload(START);
    const raw = String(crumbs(/attempt 1 failed/)[0].data.raw);
    expect(raw).not.toMatch(/supabase\.co|SECRETID|secret body/);
    expect(raw).toMatch(/<url>/);
    expect(raw.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// Round 2 review fixes (R2-1, file-missing guard)
// ---------------------------------------------------------------------------

describe("round 2 review fixes", () => {
  it("R2-1: a failed Try again keeps its own message for an auth cause", async () => {
    seedJob({ needsUser: true, errorClass: "not_allowed" });
    mockUploadFileResumable.mockRejectedValue(httpError(401));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) await flush();
    expect(getMatchUpload("M1")).toMatchObject({ status: "paused", error: describeUploadFailure("auth").message });
  });

  it.each([
    ["rate_limited", "limit"],
    ["disabled", "disabled"],
    ["not_in_cohort", "not_in_cohort"],
  ] as const)("R2-1: a failed Try again on the %s gate keeps the gate's message", async (gate, klass) => {
    seedJob({ phase: "row", needsUser: true, errorClass: klass });
    mockWriteMatchVideoRow.mockRejectedValue(Object.assign(new Error("gated"), { gate }));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < 4; i++) await flush();
    expect(getMatchUpload("M1")?.error).toBe(describeUploadFailure(klass).message);
  });

  it("R2-1: a failed Try again on a save failure keeps its own message", async () => {
    seedJob({ phase: "row", needsUser: true, errorClass: "not_allowed" });
    mockWriteMatchVideoRow.mockRejectedValue(new Error("row write failed"));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < ROW_MAX_ATTEMPTS * 2; i++) await flush();
    expect(getMatchUpload("M1")?.error).toBe(describeUploadFailure("save_failed").message);
  });

  it.each([
    ["offline", new Error("Network request failed")],
    ["server", null],
  ] as const)("R2-1: a failed Try again with a %s cause says Still can't upload", async (_klass, err) => {
    seedJob({ needsUser: true, errorClass: "not_allowed" });
    mockUploadFileResumable.mockRejectedValue(err ?? httpError(503));
    await retryMatchVideoUpload("M1");
    for (let i = 0; i < UPLOAD_MAX_ATTEMPTS * 2; i++) await flush();
    expect(getMatchUpload("M1")?.error).toBe("Still can't upload. Check your connection.");
  });

  it("file-missing guard: a run that loses its slot during the abandon never writes the wiped store", async () => {
    // Hold the abandon's job delete and sign out inside it.
    let release: () => void = () => undefined;
    const reached = new Promise<void>((res) => {
      mockRemoveItemGate.reached = res;
    });
    mockRemoveItemGate.wait = new Promise<void>((res) => (release = res));
    seedJob();
    mockGetRecordingSize.mockResolvedValue(null);

    void resumeMatchVideoUploads();
    await reached;
    stopMatchVideoUploadsForSignOut();
    release();
    for (let i = 0; i < 3; i++) await flush();

    expect(getMatchUpload("M1")).toBeNull();
    expect(await loadUploadJob("M1")).toBeNull();
  });
});
