/**
 * Tests for the on-disk record of an unfinished match-video upload
 * (lib/video/upload-persistence.ts).
 *
 * This is the file that turns "the upload died with the process" into "the
 * upload resumes on the next launch", so its failure modes are the ones
 * that quietly lose a match recording: a record written by an older build,
 * a half-written record, or a patch that resurrects a stale upload URL.
 */

const mockStore = new Map<string, string>();
const mockThrowOn = { setItem: false, getAllKeys: false };

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (mockThrowOn.setItem) throw new Error("disk full");
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
    getAllKeys: async () => {
      if (mockThrowOn.getAllKeys) throw new Error("storage unavailable");
      return [...mockStore.keys()];
    },
  },
}));

import {
  UPLOAD_JOB_MAX_AGE_MS,
  UPLOAD_JOB_PREFIX,
  type PendingUploadJob,
  isJobExpired,
  loadUploadJob,
  loadUploadJobs,
  patchUploadJob,
  removeUploadJob,
  saveUploadJob,
} from "@/lib/video/upload-persistence";

function job(overrides: Partial<PendingUploadJob> = {}): PendingUploadJob {
  return {
    matchId: "M1",
    uploaderAthleteId: "A1",
    fileUri: "file:///docs/match-uploads/M1.mp4",
    storagePath: "M1/A1/1700000000000.mp4",
    ext: "mp4",
    fileSizeBytes: 500_000_000,
    uploadUrl: null,
    bytesUploaded: 0,
    phase: "bytes",
    attempt: 0,
    truncation: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastError: null,
    ...overrides,
  };
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockStore.clear();
  mockThrowOn.setItem = false;
  mockThrowOn.getAllKeys = false;
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("saveUploadJob / loadUploadJob", () => {
  it("round-trips a job under a per-match key", async () => {
    await saveUploadJob(job());
    expect([...mockStore.keys()]).toEqual([`${UPLOAD_JOB_PREFIX}M1`]);
    const loaded = await loadUploadJob("M1");
    expect(loaded).toMatchObject({
      matchId: "M1",
      storagePath: "M1/A1/1700000000000.mp4",
      phase: "bytes",
      fileSizeBytes: 500_000_000,
    });
  });

  it("uses one key per job so concurrent writes cannot clobber each other", async () => {
    await saveUploadJob(job({ matchId: "M1" }));
    await saveUploadJob(job({ matchId: "M2", storagePath: "M2/A1/1.mp4" }));
    expect((await loadUploadJob("M1"))?.storagePath).toBe("M1/A1/1700000000000.mp4");
    expect((await loadUploadJob("M2"))?.storagePath).toBe("M2/A1/1.mp4");
  });

  it("returns null for a match with no job", async () => {
    expect(await loadUploadJob("nope")).toBeNull();
  });

  it("never throws when the write fails, because persistence is not a precondition", async () => {
    mockThrowOn.setItem = true;
    await expect(saveUploadJob(job())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/could not persist upload job/),
      expect.anything(),
    );
  });
});

describe("validation on read", () => {
  it("discards a record missing the storage path rather than minting a new key", async () => {
    // A job without `storagePath` would make the upload loop build a fresh
    // key and strand whatever bytes are already in the bucket.
    mockStore.set(`${UPLOAD_JOB_PREFIX}M1`, JSON.stringify({ matchId: "M1", fileUri: "file://x" }));
    expect(await loadUploadJob("M1")).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it("discards a record with a zero byte size", async () => {
    mockStore.set(`${UPLOAD_JOB_PREFIX}M1`, JSON.stringify(job({ fileSizeBytes: 0 })));
    expect(await loadUploadJob("M1")).toBeNull();
  });

  it("discards a record with an unknown phase (an older or newer build)", async () => {
    mockStore.set(
      `${UPLOAD_JOB_PREFIX}M1`,
      JSON.stringify({ ...job(), phase: "transcoding" }),
    );
    expect(await loadUploadJob("M1")).toBeNull();
  });

  it("discards unparseable JSON", async () => {
    mockStore.set(`${UPLOAD_JOB_PREFIX}M1`, "{half-written");
    expect(await loadUploadJob("M1")).toBeNull();
  });
});

describe("loadUploadJobs", () => {
  it("returns every job oldest first", async () => {
    await saveUploadJob(job({ matchId: "M2", createdAt: 2_000 }));
    await saveUploadJob(job({ matchId: "M1", createdAt: 1_000 }));
    await saveUploadJob(job({ matchId: "M3", createdAt: 3_000 }));
    expect((await loadUploadJobs()).map((j) => j.matchId)).toEqual(["M1", "M2", "M3"]);
  });

  it("ignores keys belonging to other features in the same AsyncStorage", async () => {
    mockStore.set("elo-rated-theme-preference", "dark");
    mockStore.set("elo-tus-url::fp::1", "{}");
    await saveUploadJob(job());
    expect((await loadUploadJobs()).map((j) => j.matchId)).toEqual(["M1"]);
  });

  it("drops a malformed job and keeps the good ones", async () => {
    await saveUploadJob(job({ matchId: "M1" }));
    mockStore.set(`${UPLOAD_JOB_PREFIX}M9`, "{not json");
    const jobs = await loadUploadJobs();
    expect(jobs.map((j) => j.matchId)).toEqual(["M1"]);
    expect(mockStore.has(`${UPLOAD_JOB_PREFIX}M9`)).toBe(false);
  });

  it("returns an empty list rather than throwing when storage is unavailable", async () => {
    mockThrowOn.getAllKeys = true;
    expect(await loadUploadJobs()).toEqual([]);
  });
});

describe("patchUploadJob", () => {
  it("merges into the CURRENT record, not the caller's stale copy", async () => {
    await saveUploadJob(job());
    const stale = await loadUploadJob("M1");
    // The resume sweep bumps the attempt while a long-running upload still
    // holds `stale`. Patching from the caller's copy would roll it back.
    await patchUploadJob("M1", { attempt: 4 });
    await patchUploadJob(stale!.matchId, { uploadUrl: "https://up/1" });
    const merged = await loadUploadJob("M1");
    expect(merged).toMatchObject({ attempt: 4, uploadUrl: "https://up/1" });
  });

  it("flips the phase so a resume never re-uploads a complete object", async () => {
    await saveUploadJob(job());
    await patchUploadJob("M1", { phase: "row", bytesUploaded: 500_000_000, attempt: 0 });
    expect(await loadUploadJob("M1")).toMatchObject({ phase: "row", attempt: 0 });
  });

  it("returns null for a job that is already gone", async () => {
    expect(await patchUploadJob("M1", { attempt: 1 })).toBeNull();
  });

  it("cannot be used to rewrite the match id", async () => {
    await saveUploadJob(job());
    await patchUploadJob("M1", { attempt: 1 } as never);
    expect((await loadUploadJob("M1"))?.matchId).toBe("M1");
  });
});

describe("removeUploadJob", () => {
  it("removes only that match's job", async () => {
    await saveUploadJob(job({ matchId: "M1" }));
    await saveUploadJob(job({ matchId: "M2" }));
    await removeUploadJob("M1");
    expect(await loadUploadJob("M1")).toBeNull();
    expect(await loadUploadJob("M2")).not.toBeNull();
  });
});

describe("isJobExpired", () => {
  it("is false inside the retention window", () => {
    const created = 1_000_000;
    expect(isJobExpired(job({ createdAt: created }), created + UPLOAD_JOB_MAX_AGE_MS - 1)).toBe(
      false,
    );
  });

  it("is true past it", () => {
    const created = 1_000_000;
    expect(isJobExpired(job({ createdAt: created }), created + UPLOAD_JOB_MAX_AGE_MS + 1)).toBe(
      true,
    );
  });
});
