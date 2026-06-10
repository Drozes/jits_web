/**
 * Tests for the mobile video upload path (lib/video/upload-recording.ts).
 *
 * Covers the Phase 1 upload-path bug fixes:
 * - jits-81l: retries must overwrite the existing storage object
 *   (POST + `x-upsert: true`, the JS SDK's `{ upsert: true }` wire shape).
 * - jits-voh: a caller-provided `storagePath` is honored verbatim so a
 *   retry reuses the SAME object key instead of minting a fresh one.
 * - jits-1v6: when the match_videos upsert fails after the storage write
 *   succeeded, the object is removed (no orphan file in the bucket).
 * - jits-0lc: consumes the Result<T> shape from upsertMatchVideo.
 */

const mockUploadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
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

import { MatchVideoDbError, uploadRecording } from "@/lib/video/upload-recording";

const BASE_OPTS = {
  fileUri: "file://clip.mp4",
  matchId: "M",
  uploaderAthleteId: "A",
};

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  });
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1234 });
  mockUploadAsync.mockResolvedValue({ status: 200, body: "" });
  mockUpsertMatchVideo.mockResolvedValue({ ok: true, data: { id: "VID-1" } });
  // Successful-removal shape: storage-js resolves with the removed objects.
  mockRemove.mockResolvedValue({ data: [{ name: "M/A/42.mp4" }], error: null });
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("uploadRecording", () => {
  it("POSTs to the storage REST endpoint with x-upsert: true (jits-81l)", async () => {
    await uploadRecording(BASE_OPTS);
    expect(mockUploadAsync).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/match-videos/M/A/1700000000000.mp4",
      "file://clip.mp4",
      expect.objectContaining({
        httpMethod: "POST",
        headers: expect.objectContaining({
          "x-upsert": "true",
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("honors a caller-provided storagePath instead of minting a new key (jits-voh)", async () => {
    const result = await uploadRecording({ ...BASE_OPTS, storagePath: "M/A/42.mp4" });
    expect(result.path).toBe("M/A/42.mp4");
    expect(mockUploadAsync).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/match-videos/M/A/42.mp4",
      "file://clip.mp4",
      expect.anything(),
    );
    expect(mockUpsertMatchVideo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ storagePath: "M/A/42.mp4" }),
    );
  });

  it("returns the videoId from the upsert Result on success", async () => {
    const result = await uploadRecording(BASE_OPTS);
    expect(result.videoId).toBe("VID-1");
    expect(result.status).toBe(200);
  });

  it("removes the storage object and throws when the DB upsert fails (jits-1v6)", async () => {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    await expect(
      uploadRecording({ ...BASE_OPTS, storagePath: "M/A/42.mp4" }),
    ).rejects.toThrow(/saving the record failed: boom/);
    expect(mockStorageFrom).toHaveBeenCalledWith("match-videos");
    expect(mockRemove).toHaveBeenCalledWith(["M/A/42.mp4"]);
    // Clean compensation (exactly one object removed): nothing to report.
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("skips compensation when skipCompensation is set, flagging the persisted object", async () => {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    let thrown: unknown;
    try {
      await uploadRecording({ ...BASE_OPTS, storagePath: "M/A/42.mp4", skipCompensation: true });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MatchVideoDbError);
    expect((thrown as MatchVideoDbError).storageObjectPersisted).toBe(true);
    expect((thrown as MatchVideoDbError).path).toBe("M/A/42.mp4");
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("compensation resolving with an error is reported and does not mask the DB error", async () => {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "RLS_VIOLATION", message: "rls denied" },
    });
    // Realistic storage-js failure shape: remove() RESOLVES with an error.
    mockRemove.mockResolvedValue({ data: null, error: { message: "delete denied" } });
    await expect(uploadRecording(BASE_OPTS)).rejects.toThrow(
      /saving the record failed: rls denied/,
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/orphan cleanup failed.*delete denied/),
    );
  });

  it("compensation silently denied by RLS (data: []) is reported and does not mask the DB error", async () => {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "RLS_VIOLATION", message: "rls denied" },
    });
    // Storage RLS DELETE denial: 200 with an EMPTY data array and NO error.
    mockRemove.mockResolvedValue({ data: [], error: null });
    await expect(uploadRecording(BASE_OPTS)).rejects.toThrow(
      /saving the record failed: rls denied/,
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/orphan cleanup failed.*removed 0 objects/),
    );
  });

  it("a rejecting compensation call (network failure) does not mask the DB error", async () => {
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: { code: "RLS_VIOLATION", message: "rls denied" },
    });
    mockRemove.mockRejectedValue(new Error("network down"));
    await expect(uploadRecording(BASE_OPTS)).rejects.toThrow(
      /saving the record failed: rls denied/,
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-2xx storage status without touching the DB", async () => {
    mockUploadAsync.mockResolvedValue({ status: 400, body: "resource exists" });
    await expect(uploadRecording(BASE_OPTS)).rejects.toThrow(/Upload failed \(400\)/);
    expect(mockUpsertMatchVideo).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
