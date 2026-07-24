import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAthleteVideos, getMatchVideoSignedUrl } from "./queries";

// ---------------------------------------------------------------------------
// getAthleteVideos: mocked supabase client
// ---------------------------------------------------------------------------

describe("getAthleteVideos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows from the RPC (p_athlete_id only; p_limit is server-defaulted)", async () => {
    const rows = [{ video_id: "v1", match_id: "m1" }];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await getAthleteVideos({ rpc } as never, "ATH");
    expect(rpc).toHaveBeenCalledWith("get_athlete_videos", { p_athlete_id: "ATH" });
    expect(result).toEqual(rows);
  });

  it("returns [] on RPC error (aggregate-read style)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getAthleteVideos({ rpc } as never, "ATH")).toEqual([]);
  });

  it("returns [] when the RPC resolves null data", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await getAthleteVideos({ rpc } as never, "ATH")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMatchVideoSignedUrl: mocked supabase client + storage
// ---------------------------------------------------------------------------

function buildClient(
  row: unknown,
  rowError: unknown,
  signed: unknown,
  signError: unknown,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: rowError });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: signed, error: signError });
  const storageFrom = vi.fn().mockReturnValue({ createSignedUrl });
  return {
    client: { from, storage: { from: storageFrom } } as never,
    from,
    eq,
    createSignedUrl,
    storageFrom,
  };
}

describe("getMatchVideoSignedUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads storage_path off match_videos and signs it against match-videos", async () => {
    const { client, from, eq, createSignedUrl, storageFrom } = buildClient(
      { storage_path: "MATCH/ATH/1.mp4" },
      null,
      { signedUrl: "https://signed.example/x" },
      null,
    );
    const url = await getMatchVideoSignedUrl(client, "VID", 60);
    expect(from).toHaveBeenCalledWith("match_videos");
    expect(eq).toHaveBeenCalledWith("id", "VID");
    expect(storageFrom).toHaveBeenCalledWith("match-videos");
    expect(createSignedUrl).toHaveBeenCalledWith("MATCH/ATH/1.mp4", 60);
    expect(url).toBe("https://signed.example/x");
  });

  it("defaults expiry to 1 hour", async () => {
    const { client, createSignedUrl } = buildClient(
      { storage_path: "p" },
      null,
      { signedUrl: "u" },
      null,
    );
    await getMatchVideoSignedUrl(client, "VID");
    expect(createSignedUrl).toHaveBeenCalledWith("p", 3600);
  });

  it("returns null when the row is invisible (RLS) or absent", async () => {
    const { client, createSignedUrl } = buildClient(null, null, null, null);
    expect(await getMatchVideoSignedUrl(client, "VID")).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns null on a select error", async () => {
    const { client } = buildClient(null, { message: "denied" }, null, null);
    expect(await getMatchVideoSignedUrl(client, "VID")).toBeNull();
  });

  it("returns null when signing fails", async () => {
    const { client } = buildClient(
      { storage_path: "p" },
      null,
      null,
      { message: "sign denied" },
    );
    expect(await getMatchVideoSignedUrl(client, "VID")).toBeNull();
  });
});
