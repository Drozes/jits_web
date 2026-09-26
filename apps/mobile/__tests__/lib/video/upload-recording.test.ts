/**
 * Tests for the mobile video upload primitives (lib/video/upload-recording.ts).
 *
 * The single-shot `FileSystem.uploadAsync(BINARY_CONTENT)` POST is gone;
 * this now covers the resumable (tus) transfer that replaced it, plus the
 * two pieces of policy that surround it:
 *
 * - jits-81l / jits-voh: the object key is caller-supplied and stable, and
 *   `x-upsert: true` is preserved so a retry re-PUTs the same key against
 *   the storage UPDATE policy the backend keeps for exactly that.
 * - Supabase's resumable endpoint mandates a 6 MiB chunk size.
 * - `classifyUploadError` decides retry vs give up vs start a new upload,
 *   which is what stops a dead upload URL from burning every attempt.
 * - `removeUploadedObject` still detects a silently RLS-denied DELETE.
 */

const mockGetInfoAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock("expo-file-system", () => ({ File: class {} }));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
  },
}));

// ---- tus-js-client double ----
//
// Captures the options the real `Upload` would receive and lets each test
// drive the callbacks. The wire protocol itself is tus-js-client's problem;
// what matters here is that we hand it the right endpoint, chunk size,
// metadata, headers and resume URL.

interface CapturedUpload {
  file: { uri: string; size: number };
  options: Record<string, unknown>;
  start: jest.Mock;
  abort: jest.Mock;
  url: string | null;
}

const mockUploads: CapturedUpload[] = [];
const mockOnStart = { current: null as ((upload: CapturedUpload) => void) | null };

jest.mock("tus-js-client/lib.es5/browser/index.js", () => ({
  Upload: class {
    url: string | null = null;
    constructor(file: unknown, options: Record<string, unknown>) {
      const captured = {
        file: file as { uri: string; size: number },
        options,
        start: jest.fn(),
        abort: jest.fn(async () => undefined),
        url: null as string | null,
      };
      captured.start.mockImplementation(() => mockOnStart.current?.(captured));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).options = options;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).start = captured.start;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).abort = captured.abort;
      Object.defineProperty(this, "url", {
        get: () => captured.url,
        set: (v: string | null) => {
          captured.url = v;
        },
      });
      mockUploads.push(captured);
    }
  },
}));

const mockGetSession = jest.fn();
const mockRemove = jest.fn();
const mockStorageFrom = jest.fn((..._args: unknown[]) => ({ remove: mockRemove }));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

jest.mock("@/lib/env", () => ({
  env: {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
  },
}));

const mockCaptureException = jest.fn();

jest.mock("@/lib/error-tracking/sentry", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const mockUpsertMatchVideo = jest.fn();

jest.mock("@jits/shared/api/mutations", () => ({
  buildMatchVideoStoragePath: (matchId: string, uploader: string, ext = "mp4") =>
    `${matchId}/${uploader}/1700000000000.${ext.replace(/^\./, "").toLowerCase() || "mp4"}`,
  upsertMatchVideo: (...args: unknown[]) => mockUpsertMatchVideo(...args),
}));

import {
  MAX_UPLOAD_BYTES,
  MatchVideoDbError,
  SUPABASE_TUS_CHUNK_SIZE,
  buildVideoPath,
  classifyUploadError,
  getRecordingSize,
  matchVideoGateFor,
  removeUploadedObject,
  statusOfUploadError,
  uploadFileResumable,
  writeMatchVideoRow,
} from "@/lib/video/upload-recording";

const BASE = {
  fileUri: "file://clip.mp4",
  fileSizeBytes: 12_345,
  storagePath: "M/A/42.mp4",
  ext: "mp4",
};

/** Shape of a tus DetailedError as far as our classifier is concerned. */
function httpError(status: number, message = "boom"): Error {
  const err = new Error(message) as Error & { originalResponse: unknown };
  err.originalResponse = { getStatus: () => status };
  return err;
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUploads.length = 0;
  mockOnStart.current = null;
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 12_345 });
  mockUpsertMatchVideo.mockResolvedValue({ ok: true, data: { id: "VID-1" } });
  mockRemove.mockResolvedValue({ data: [{ name: "M/A/42.mp4" }], error: null });
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("uploadFileResumable", () => {
  it("targets Supabase's resumable endpoint with a 6 MiB chunk size", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable(BASE);

    const { options, file } = mockUploads[0];
    expect(options.endpoint).toBe("https://example.supabase.co/storage/v1/upload/resumable");
    // Not a tuning knob: Supabase rejects any other chunk size.
    expect(options.chunkSize).toBe(SUPABASE_TUS_CHUNK_SIZE);
    expect(SUPABASE_TUS_CHUNK_SIZE).toBe(6 * 1024 * 1024);
    expect(options.uploadSize).toBe(12_345);
    expect(file).toEqual({ uri: "file://clip.mp4", size: 12_345 });
  });

  it("keeps the x-upsert retry semantics the backend expects (jits-81l)", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable(BASE);
    expect(mockUploads[0].options.headers).toMatchObject({
      authorization: "Bearer tok",
      apikey: "anon-key",
      "x-upsert": "true",
    });
  });

  it("sends the caller's object key verbatim as tus metadata (jits-voh)", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable({ ...BASE, storagePath: "M/A/99.webm", ext: "webm" });
    expect(mockUploads[0].options.metadata).toMatchObject({
      bucketName: "match-videos",
      objectName: "M/A/99.webm",
      contentType: "application/octet-stream",
    });
  });

  it("resumes from a previously persisted upload URL instead of starting over", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable({ ...BASE, uploadUrl: "https://up/abc" });
    expect(mockUploads[0].options.uploadUrl).toBe("https://up/abc");
  });

  it("leaves tus's own retry loop disabled so there is one retry authority", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable(BASE);
    expect(mockUploads[0].options.retryDelays).toBeNull();
    expect((mockUploads[0].options.onShouldRetry as () => boolean)()).toBe(false);
  });

  it("fingerprints deterministically from the object key, so a restart matches", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable(BASE);
    const fingerprint = mockUploads[0].options.fingerprint as () => Promise<string>;
    await expect(fingerprint()).resolves.toBe("elo-match-video::M/A/42.mp4");
  });

  it("reports the upload URL as soon as the creation POST returns one", async () => {
    const seen: string[] = [];
    mockOnStart.current = (u) => {
      u.url = "https://up/created";
      (u.options.onUploadUrlAvailable as () => void)();
      (u.options.onSuccess as () => void)();
    };
    await uploadFileResumable({ ...BASE, onUploadUrl: (url) => seen.push(url) });
    expect(seen).toEqual(["https://up/created"]);
    // The URL must be knowable BEFORE any bytes go out, or a kill during
    // the first chunk leaves nothing to resume.
    expect(mockUploads[0].options.uploadDataDuringCreation).toBe(false);
  });

  it("forwards byte-level progress", async () => {
    const seen: Array<[number, number]> = [];
    mockOnStart.current = (u) => {
      const onProgress = u.options.onProgress as (a: number, b: number) => void;
      onProgress(6 * 1024 * 1024, 12_345);
      (u.options.onSuccess as () => void)();
    };
    await uploadFileResumable({ ...BASE, onProgress: (a, b) => seen.push([a, b]) });
    expect(seen).toEqual([[6 * 1024 * 1024, 12_345]]);
  });

  it("rejects with the tus error so the caller can classify it", async () => {
    mockOnStart.current = (u) => (u.options.onError as (e: Error) => void)(httpError(503));
    await expect(uploadFileResumable(BASE)).rejects.toThrow("boom");
  });

  it("hands back an abort that KEEPS the server-side partial and SETTLES", async () => {
    const handle: { abort: (() => void) | null } = { abort: null };
    mockOnStart.current = () => {
      // A transfer that never resolves on its own, which is what an aborted
      // one does: tus leaves the promise pending forever.
      handle.abort?.();
    };
    await expect(
      uploadFileResumable({
        ...BASE,
        onAbortHandle: (a) => {
          handle.abort = a;
        },
      }),
    ).rejects.toThrow(/aborted/i);
    // `abort(false)` rather than `abort(true)`: terminating would delete
    // real bytes the next attempt could have resumed from.
    expect(mockUploads[0].abort).toHaveBeenCalledWith(false);
  });

  it("closes the file source even when the upload fails", async () => {
    // tus closes the source only on its SUCCESS paths and `abort()` never
    // does, so without this a failed attempt leaks a native file handle for
    // the life of the process.
    const closes = jest.fn();
    mockOnStart.current = (u) => {
      const reader = u.options.fileReader as {
        openFile: (input: unknown, chunk: number) => Promise<{ close: () => void }>;
      };
      // Opening is what registers the source with `uploadFileResumable`,
      // exactly as tus does during `start()`.
      void reader.openFile({ uri: "file://clip.mp4", size: 10 }, 1).then((source) => {
        jest.spyOn(source, "close").mockImplementation(closes);
        (u.options.onError as (e: Error) => void)(new Error("Network request failed"));
      });
    };
    await expect(uploadFileResumable(BASE)).rejects.toThrow("Network request failed");
    expect(closes).toHaveBeenCalledTimes(1);
  });

  it("refuses a file over the 2 GiB contract cap without touching the network", async () => {
    await expect(
      uploadFileResumable({ ...BASE, fileSizeBytes: MAX_UPLOAD_BYTES + 1 }),
    ).rejects.toThrow(/under 2 GB/);
    expect(mockUploads).toHaveLength(0);
  });

  it("refuses to upload without a session rather than sending an anonymous PUT", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadFileResumable(BASE)).rejects.toThrow(/Not signed in/);
    expect(mockUploads).toHaveLength(0);
  });

  it("resolves the access token per call, so a clip resumed hours later is authorised", async () => {
    mockOnStart.current = (u) => (u.options.onSuccess as () => void)();
    await uploadFileResumable(BASE);
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "fresher" } } });
    await uploadFileResumable(BASE);
    expect((mockUploads[1].options.headers as Record<string, string>).authorization).toBe(
      "Bearer fresher",
    );
  });
});

describe("classifyUploadError", () => {
  it("treats a transport failure with no status as retryable", () => {
    expect(classifyUploadError(new Error("Network request failed"))).toEqual({
      retryable: true,
      resetUploadUrl: false,
      status: null,
    });
  });

  it("starts a NEW upload when the server has dropped the old one", () => {
    // Supabase expires an unfinished resumable upload; PATCH/HEAD then
    // answer 404. Retrying that URL would burn every remaining attempt.
    for (const status of [404, 410]) {
      expect(classifyUploadError(httpError(status))).toMatchObject({
        retryable: true,
        resetUploadUrl: true,
      });
    }
  });

  it("retries a 401, because the next attempt fetches a fresh token", () => {
    expect(classifyUploadError(httpError(401))).toMatchObject({ retryable: true });
  });

  it("gives up on RLS and oversize, which no amount of waiting fixes", () => {
    expect(classifyUploadError(httpError(403))).toMatchObject({ retryable: false });
    expect(classifyUploadError(httpError(413))).toMatchObject({ retryable: false });
    expect(classifyUploadError(httpError(400))).toMatchObject({ retryable: false });
  });

  it("retries 5xx and rate limiting", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(classifyUploadError(httpError(status))).toMatchObject({ retryable: true });
    }
  });

  it("rebuilds the upload on an offset conflict", () => {
    expect(classifyUploadError(httpError(409))).toMatchObject({
      retryable: true,
      resetUploadUrl: true,
    });
  });

  it("reads a status only from a real tus response object", () => {
    expect(statusOfUploadError(new Error("plain"))).toBeNull();
    expect(statusOfUploadError(null)).toBeNull();
    expect(statusOfUploadError({ originalResponse: {} })).toBeNull();
    expect(statusOfUploadError(httpError(418))).toBe(418);
  });
});

describe("writeMatchVideoRow", () => {
  it("returns the row id on success", async () => {
    await expect(
      writeMatchVideoRow({ matchId: "M", uploaderAthleteId: "A", storagePath: "M/A/42.mp4" }),
    ).resolves.toBe("VID-1");
    expect(mockUpsertMatchVideo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ storagePath: "M/A/42.mp4", recordingType: "self" }),
    );
  });

  it("throws WITHOUT deleting the uploaded object", async () => {
    // The old path deleted a 600 MB object on the first transient DB
    // failure. Compensation is now the caller's decision, taken only when
    // the job is abandoned.
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    let thrown: unknown;
    try {
      await writeMatchVideoRow({
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/42.mp4",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MatchVideoDbError);
    expect((thrown as MatchVideoDbError).storageObjectPersisted).toBe(true);
    expect((thrown as MatchVideoDbError).path).toBe("M/A/42.mp4");
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe("writeMatchVideoRow upload-gate copy", () => {
  async function thrownFor(hint: string | undefined, message = "raw db message") {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message, raw: { code: "P0001", hint, message } },
    });
    try {
      await writeMatchVideoRow({ matchId: "M", uploaderAthleteId: "A", storagePath: "M/A/42.mp4" });
    } catch (err) {
      return err as MatchVideoDbError;
    }
    throw new Error("expected writeMatchVideoRow to throw");
  }

  it.each([
    ["upload_rate_limited", "rate_limited", /^Daily video limit reached\. It will upload automatically later\.$/],
    ["video_upload_disabled", "disabled", /^Video uploads are turned off right now\./],
    ["upload_not_in_cohort", "not_in_cohort", /^Video uploads are not enabled for your account yet\./],
    ["video_reslice_limit", "reslice_limit", /replaced too many times.*Contact support/],
  ])("maps HINT %s to clear copy and a gate", async (hint, gate, copy) => {
    const err = await thrownFor(hint);
    expect(err).toBeInstanceOf(MatchVideoDbError);
    expect(err.gate).toBe(gate);
    expect(err.message).toMatch(copy);
    expect(err.message).not.toMatch(/saving the record failed/i);
    expect(err.storageObjectPersisted).toBe(true);
  });

  it.each(["video_upload_disabled", "upload_not_in_cohort", "video_reslice_limit"])(
    "tells the user how long the clip is kept for %s, never that it is simply saved",
    async (hint) => {
      // These gates rarely lift inside the retention window, after which the
      // sweep deletes the local clip; the copy must not promise otherwise.
      const err = await thrownFor(hint);
      expect(err.message).toMatch(/kept on this device for up to 7 days after the match/);
      expect(err.message).not.toMatch(/saved on this device/);
    },
  );

  it("leaves any other failure ungated and unprefixed, so the caller frames it once", async () => {
    const err = await thrownFor(undefined, "permission denied");
    expect(err.gate).toBeNull();
    expect(err.message).toBe("permission denied");
  });

  it("exposes the hint lookup", () => {
    expect(matchVideoGateFor("upload_rate_limited")?.gate).toBe("rate_limited");
    expect(matchVideoGateFor("something_else")).toBeNull();
    expect(matchVideoGateFor(null)).toBeNull();
  });
});

describe("removeUploadedObject", () => {
  it("is quiet on a clean removal", async () => {
    await removeUploadedObject("M/A/42.mp4");
    expect(mockStorageFrom).toHaveBeenCalledWith("match-videos");
    expect(mockRemove).toHaveBeenCalledWith(["M/A/42.mp4"]);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reports a silent RLS denial (200 with an empty data array)", async () => {
    mockRemove.mockResolvedValue({ data: [], error: null });
    await removeUploadedObject("M/A/42.mp4");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/removed 0 objects/));
  });

  it("reports a resolved error and never throws", async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: "delete denied" } });
    await expect(removeUploadedObject("M/A/42.mp4")).resolves.toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected call and never throws", async () => {
    mockRemove.mockRejectedValue(new Error("network down"));
    await expect(removeUploadedObject("M/A/42.mp4")).resolves.toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe("buildVideoPath / getRecordingSize", () => {
  it("delegates the path convention to the shared helper", () => {
    expect(buildVideoPath("M", "A")).toBe("M/A/1700000000000.mp4");
  });

  it("returns null when the clip cannot be read, rather than guessing a size", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    expect(await getRecordingSize("file://gone.mp4")).toBeNull();
    mockGetInfoAsync.mockRejectedValue(new Error("nope"));
    expect(await getRecordingSize("file://gone.mp4")).toBeNull();
  });
});
