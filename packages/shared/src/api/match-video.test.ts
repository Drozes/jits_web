import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildMatchVideoStoragePath,
  createMatchVideo,
  upsertMatchVideo,
} from "./mutations";

// ---------------------------------------------------------------------------
// buildMatchVideoStoragePath
// ---------------------------------------------------------------------------

describe("buildMatchVideoStoragePath", () => {
  it("composes <match_id>/<uploader>/<unix_ts>.<ext>", () => {
    const path = buildMatchVideoStoragePath("MATCH", "ATH", "mp4");
    expect(path).toMatch(/^MATCH\/ATH\/\d+\.mp4$/);
  });

  it("defaults to mp4 extension", () => {
    const path = buildMatchVideoStoragePath("M", "A");
    expect(path).toMatch(/\.mp4$/);
  });

  it("normalises the extension (strips dot, lowercases)", () => {
    expect(buildMatchVideoStoragePath("m", "a", ".WEBM")).toMatch(/\.webm$/);
  });

  it("falls back to mp4 on empty extension", () => {
    expect(buildMatchVideoStoragePath("m", "a", "")).toMatch(/\.mp4$/);
  });
});

// ---------------------------------------------------------------------------
// createMatchVideo / upsertMatchVideo — mocked supabase client
// ---------------------------------------------------------------------------

interface MockBuilderResult {
  data: unknown;
  error: unknown;
}

function buildMockClient(
  insertResult: MockBuilderResult,
  updateResult?: MockBuilderResult,
) {
  const insertSingle = vi.fn().mockResolvedValue(insertResult);
  const updateSingle = vi.fn().mockResolvedValue(updateResult ?? { data: null, error: null });

  const insertChain = {
    select: vi.fn().mockReturnValue({ single: insertSingle }),
  };
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue({ single: updateSingle }),
  };
  const insertSpy = vi.fn().mockReturnValue(insertChain);
  const updateSpy = vi.fn().mockReturnValue(updateChain);
  const fromMock = vi.fn().mockReturnValue({
    insert: insertSpy,
    update: updateSpy,
  });

  return {
    client: { from: fromMock } as never,
    insertSingle,
    updateSingle,
    insertSpy,
    updateSpy,
    fromMock,
  };
}

describe("createMatchVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("INSERTs at status='ready' and returns ok Result", async () => {
    const { client, insertSingle, fromMock } = buildMockClient({
      data: { id: "VID-1" },
      error: null,
    });
    const result = await createMatchVideo(client, {
      matchId: "M1",
      uploaderAthleteId: "A1",
      storagePath: "M1/A1/123.webm",
      fileSizeBytes: 1024,
    });
    expect(result).toEqual({ ok: true, data: { id: "VID-1" } });
    expect(fromMock).toHaveBeenCalledWith("match_videos");
    expect(insertSingle).toHaveBeenCalledOnce();
  });

  it("defaults requested_tier to 'standard'", async () => {
    const { client, insertSpy } = buildMockClient({
      data: { id: "V" },
      error: null,
    });
    await createMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/1.webm",
    });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: "M",
        uploaded_by: "A",
        storage_path: "M/A/1.webm",
        status: "ready",
        requested_tier: "standard",
      }),
    );
  });

  it("returns a mapped DomainError instead of throwing on PostgREST error", async () => {
    const { client } = buildMockClient({
      data: null,
      error: { code: "23503", message: "fk violation" },
    });
    const result = await createMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/1.webm",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toBe("fk violation");
      expect(result.error.raw).toMatchObject({ code: "23503" });
    }
  });

  it("maps a bare 23505 to VIDEO_ALREADY_EXISTS, not the challenge-flavored MATCH_ALREADY_EXISTS", async () => {
    const { client } = buildMockClient({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const result = await createMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/1.webm",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VIDEO_ALREADY_EXISTS");
      expect(result.error.message).toBe(
        "A video has already been uploaded for this match.",
      );
      // The raw code is preserved so upsertMatchVideo's 23505
      // interception keeps working.
      expect(result.error.raw).toMatchObject({ code: "23505" });
    }
  });
});

describe("upsertMatchVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok Result when INSERT succeeds", async () => {
    const { client, updateSingle } = buildMockClient({ data: { id: "V" }, error: null });
    await expect(
      upsertMatchVideo(client, {
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/1.webm",
      }),
    ).resolves.toEqual({ ok: true, data: { id: "V" } });
    expect(updateSingle).not.toHaveBeenCalled();
  });

  it("falls back to UPDATE on 23505 unique violation", async () => {
    const { client, updateSingle } = buildMockClient(
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: { id: "EXISTING" }, error: null },
    );
    const result = await upsertMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/new.webm",
    });
    expect(result).toEqual({ ok: true, data: { id: "EXISTING" } });
    expect(updateSingle).toHaveBeenCalledOnce();
  });

  it("UPDATE path sets only the columns the caller provided (no clearing)", async () => {
    const { client, updateSpy } = buildMockClient(
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: { id: "EXISTING" }, error: null },
    );
    await upsertMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/retry.webm",
    });
    // A retry that omits the optional fields must NOT null them out;
    // the existing row keeps its recording_type / recorded_by / etc.
    expect(updateSpy).toHaveBeenCalledExactlyOnceWith({
      storage_path: "M/A/retry.webm",
      status: "ready",
    });
  });

  it("UPDATE path includes optional columns when they are provided", async () => {
    const { client, updateSpy } = buildMockClient(
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: { id: "EXISTING" }, error: null },
    );
    await upsertMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/retry.webm",
      fileSizeBytes: 2048,
      recordingType: "self",
      recordedBy: "A",
    });
    expect(updateSpy).toHaveBeenCalledExactlyOnceWith({
      storage_path: "M/A/retry.webm",
      status: "ready",
      file_size_bytes: 2048,
      recording_type: "self",
      recorded_by: "A",
    });
  });

  it("returns non-23505 errors as not-ok without attempting UPDATE", async () => {
    const { client, updateSingle } = buildMockClient({
      data: null,
      error: { code: "42501", message: "rls denied" },
    });
    const result = await upsertMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/1.webm",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RLS_VIOLATION");
      expect(result.error.raw).toMatchObject({ code: "42501" });
    }
    expect(updateSingle).not.toHaveBeenCalled();
  });

  it("returns not-ok when the UPDATE fallback itself fails", async () => {
    const { client } = buildMockClient(
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: null, error: { code: "42501", message: "rls denied" } },
    );
    const result = await upsertMatchVideo(client, {
      matchId: "M",
      uploaderAthleteId: "A",
      storagePath: "M/A/1.webm",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RLS_VIOLATION");
  });
});
