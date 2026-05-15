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
  const fromMock = vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  });

  return {
    client: { from: fromMock } as never,
    insertSingle,
    updateSingle,
    fromMock,
  };
}

describe("createMatchVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("INSERTs at status='ready' with FE-owned columns only", async () => {
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
    expect(result).toEqual({ id: "VID-1" });
    expect(fromMock).toHaveBeenCalledWith("match_videos");
    expect(insertSingle).toHaveBeenCalledOnce();
  });

  it("defaults requested_tier to 'standard'", async () => {
    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "V" }, error: null }),
      }),
    });
    const client = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as never;
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

  it("throws on PostgREST error", async () => {
    const { client } = buildMockClient({
      data: null,
      error: { code: "23503", message: "fk violation" },
    });
    await expect(
      createMatchVideo(client, {
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/1.webm",
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("upsertMatchVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the row when INSERT succeeds", async () => {
    const { client } = buildMockClient({ data: { id: "V" }, error: null });
    await expect(
      upsertMatchVideo(client, {
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/1.webm",
      }),
    ).resolves.toEqual({ id: "V" });
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
    expect(result).toEqual({ id: "EXISTING" });
    expect(updateSingle).toHaveBeenCalledOnce();
  });

  it("rethrows non-23505 errors", async () => {
    const { client } = buildMockClient({
      data: null,
      error: { code: "42501", message: "rls denied" },
    });
    await expect(
      upsertMatchVideo(client, {
        matchId: "M",
        uploaderAthleteId: "A",
        storagePath: "M/A/1.webm",
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
