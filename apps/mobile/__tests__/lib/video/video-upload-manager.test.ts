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
  UPLOAD_BACKOFF,
  UPLOAD_MAX_ATTEMPTS,
  __resetVideoUploadManager,
  ensureUploadListeners,
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

  it("gives up immediately on a failure waiting cannot fix", async () => {
    // 403 is RLS. Retrying it six times just wastes the user's battery.
    mockUploadFileResumable.mockRejectedValue(httpError(403, "row-level security"));

    const outcome = await startMatchVideoUpload(START);

    expect(mockUploadFileResumable).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: false, willRetryLater: false });
    expect(await loadUploadJob("M1")).toBeNull();
    // Nothing was uploaded, so there is nothing in the bucket to clean up.
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
  it("supersedes the first run rather than racing it", async () => {
    let abortFirst: (() => void) | null = null;
    let failFirst: ((e: Error) => void) | null = null;
    mockUploadFileResumable.mockImplementationOnce(
      (opts: { onAbortHandle?: (a: () => void) => void }) =>
        new Promise<void>((_res, rej) => {
          opts.onAbortHandle?.(() => {
            abortFirst = () => undefined;
            rej(new Error("aborted"));
          });
          failFirst = rej;
        }),
    );

    const first = startMatchVideoUpload(START);
    await flush();

    const second = startMatchVideoUpload({
      ...START,
      fileUri: "file://cache/clip2.mp4",
      storagePath: "M1/A1/1700000009999.mp4",
    });

    await expect(second).resolves.toEqual({ ok: true, videoId: "VID-1" });
    // The superseded run must not write its own failure over the winner's
    // result.
    await first;
    expect(getMatchUpload("M1")).toMatchObject({ status: "uploaded", videoId: "VID-1" });
    expect(abortFirst ?? failFirst).toBeTruthy();
  });
});

/** Let queued microtasks and zero-delay timers run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise<void>((res) => setTimeout(res, 0));
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
