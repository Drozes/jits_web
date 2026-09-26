import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMatchDetailView,
  getMatchVideoPlaybackResult,
  getMyMatchVideos,
} from "./queries";

// ---------------------------------------------------------------------------
// Mock supabase client: rpc by name, match_videos query chains, storage signing
// ---------------------------------------------------------------------------

type Resp = { data: unknown; error: unknown };
type SignImpl = (path: string) => Resp | Promise<Resp>;

interface MockOpts {
  rpc?: (name: string, args: Record<string, unknown>) => Resp | Promise<Resp>;
  maybeSingle?: Resp;
  list?: Resp;
  sign?: SignImpl;
}

function mockClient(opts: MockOpts) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) =>
    opts.rpc ? opts.rpc(name, args) : { data: null, error: null },
  );
  const maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingle ?? { data: null, error: null });
  const limit = vi.fn().mockResolvedValue(opts.list ?? { data: [], error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const neq = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq, neq });
  const from = vi.fn().mockReturnValue({ select });
  const createSignedUrl = vi.fn(async (path: string) =>
    opts.sign ? opts.sign(path) : { data: { signedUrl: `https://signed/${path}` }, error: null },
  );
  const storageFrom = vi.fn().mockReturnValue({ createSignedUrl });
  return {
    client: { rpc, from, storage: { from: storageFrom } } as never,
    rpc,
    from,
    select,
    eq,
    neq,
    order,
    limit,
    createSignedUrl,
    storageFrom,
  };
}

const MATCH_ID = "11111111-2222-4333-8444-555555555555";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OPP = "bbbbbbbb-0000-4000-8000-000000000002";
const VID = "dddddddd-0000-4000-8000-000000000004";

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 170,
    profile_photo_url: null,
    default_still_url: null,
    role: id === ME ? "challenger" : "opponent",
    outcome,
    elo_before: 1200,
    elo_after: 1210,
    elo_delta: 10,
    weight_division_gap: 0,
  };
}

function matchRow(status = "completed", id = MATCH_ID) {
  return {
    id,
    challenge_id: null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status,
    result: "points",
    started_at: "2026-09-20T10:00:00Z",
    completed_at: status === "completed" ? "2026-09-20T10:06:00Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: null,
  };
}

function videoRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "vid-x",
    uploaded_by: OPP,
    uploaded_by_name: "Bob",
    status: "ready",
    duration_seconds: 300,
    thumbnail_url: null,
    camera_angle: null,
    angle_quality: null,
    has_analysis: false,
    analysis_tier: null,
    ...over,
  };
}

function detailsPayload(videos: unknown = [], status = "completed") {
  return {
    match: matchRow(status),
    participants: [participant(ME, "Alice", "win"), participant(OPP, "Bob", "loss")],
    videos,
  };
}

function pgError(hint: string | null, message = "err", code = "P0001") {
  return { code, message, hint, details: null, name: "PostgrestError" };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// getMatchDetailView
// ---------------------------------------------------------------------------

describe("getMatchDetailView", () => {
  it("rejects a non-UUID match id as MATCH_NOT_FOUND without calling the RPC", async () => {
    const m = mockClient({});
    const r = await getMatchDetailView(m.client, "not-a-uuid", ME);
    expect(r).toEqual({ ok: false, error: { code: "MATCH_NOT_FOUND", message: "Match not found." } });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("calls get_match_details with the match id", async () => {
    const m = mockClient({ rpc: () => ({ data: detailsPayload(), error: null }) });
    await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(m.rpc).toHaveBeenCalledWith("get_match_details", { p_match_id: MATCH_ID });
  });

  it("maps hint not_participant to NOT_PARTICIPANT", async () => {
    const m = mockClient({ rpc: () => ({ data: null, error: pgError("not_participant") }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_PARTICIPANT");
  });

  it("maps hint match_not_found to MATCH_NOT_FOUND", async () => {
    const m = mockClient({ rpc: () => ({ data: null, error: pgError("match_not_found") }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MATCH_NOT_FOUND");
  });

  it("maps any other RPC error to UNKNOWN", async () => {
    const m = mockClient({ rpc: () => ({ data: null, error: pgError(null, "fetch failed", "") }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN");
  });

  it("returns MATCH_NOT_FOUND when data is null", async () => {
    const m = mockClient({ rpc: () => ({ data: null, error: null }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MATCH_NOT_FOUND");
  });

  it("returns NOT_PARTICIPANT when the viewer has no participant row (timekeeper)", async () => {
    const m = mockClient({ rpc: () => ({ data: detailsPayload(), error: null }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, "cccccccc-0000-4000-8000-000000000003");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_PARTICIPANT");
  });

  it("returns never-throws UNKNOWN when the client throws", async () => {
    const m = mockClient({
      rpc: () => {
        throw new Error("network down");
      },
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r).toEqual({ ok: false, error: { code: "UNKNOWN", message: "network down" } });
  });

  it("treats absent or null videos as []", async () => {
    const { videos: _omit, ...noVideos } = detailsPayload();
    for (const payload of [noVideos, detailsPayload(null)]) {
      const m = mockClient({ rpc: () => ({ data: payload, error: null }) });
      const r = await getMatchDetailView(m.client, MATCH_ID, ME);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.videos).toEqual([]);
    }
  });

  it("splits me/opponent and keeps the match row without participants", async () => {
    const m = mockClient({ rpc: () => ({ data: detailsPayload(), error: null }) });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.me.athlete_id).toBe(ME);
    expect(r.data.opponent?.athlete_id).toBe(OPP);
    expect(r.data.match.id).toBe(MATCH_ID);
    expect(r.data.match).not.toHaveProperty("participants");
  });

  it("returns disputed matches and failed videos (no status filtering)", async () => {
    const m = mockClient({
      rpc: () => ({
        data: detailsPayload([videoRow({ id: "v-failed", status: "failed" })], "disputed"),
        error: null,
      }),
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.match.status).toBe("disputed");
    expect(r.data.videos).toHaveLength(1);
    expect(r.data.videos[0].playability).toBe("failed");
  });

  it("sorts the viewer's video first and labels each angle", async () => {
    const m = mockClient({
      rpc: () => ({
        data: detailsPayload([
          videoRow({ id: "v-opp", uploaded_by: OPP, uploaded_by_name: "Bob" }),
          videoRow({ id: "v-me", uploaded_by: ME, uploaded_by_name: "Alice", has_analysis: true }),
        ]),
        error: null,
      }),
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.videos.map((v) => v.id)).toEqual(["v-me", "v-opp"]);
    expect(r.data.videos[0]).toMatchObject({
      is_mine: true,
      angle_label: "Your recording",
      has_analysis: true,
      playability: "playable",
    });
    expect(r.data.videos[1]).toMatchObject({
      is_mine: false,
      angle_label: "Bob's recording",
      has_analysis: false,
    });
  });

  it("falls back to the opponent's display_name when uploaded_by_name is null", async () => {
    const m = mockClient({
      rpc: () => ({
        data: detailsPayload([videoRow({ uploaded_by_name: null })]),
        error: null,
      }),
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok && r.data.videos[0].angle_label).toBe("Bob's recording");
  });

  it("signs poster keys (1h), passes http through, and nulls failures without failing", async () => {
    const m = mockClient({
      rpc: () => ({
        data: detailsPayload([
          videoRow({ id: "v1", thumbnail_url: "m/a/poster/1.jpg" }),
          videoRow({ id: "v2", thumbnail_url: "https://cdn.example/legacy.jpg" }),
          videoRow({ id: "v3", thumbnail_url: "m/a/poster/broken.jpg" }),
          videoRow({ id: "v4", thumbnail_url: "m/a/poster/nourl.jpg" }),
          videoRow({ id: "v5", thumbnail_url: null }),
        ]),
        error: null,
      }),
      sign: (path) => {
        if (path.includes("broken")) return { data: null, error: { message: "Object not found" } };
        if (path.includes("nourl")) return { data: { signedUrl: "" }, error: null };
        return { data: { signedUrl: `https://signed/${path}` }, error: null };
      },
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.videos.map((v) => v.poster_url)).toEqual([
      "https://signed/m/a/poster/1.jpg",
      "https://cdn.example/legacy.jpg",
      null,
      null,
      null,
    ]);
    expect(m.storageFrom).toHaveBeenCalledWith("match-videos");
    expect(m.createSignedUrl).toHaveBeenCalledWith("m/a/poster/1.jpg", 3600);
    expect(m.createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it("a throwing poster signer is still non-fatal", async () => {
    const m = mockClient({
      rpc: () => ({ data: detailsPayload([videoRow({ thumbnail_url: "k.jpg" })]), error: null }),
      sign: () => {
        throw new Error("boom");
      },
    });
    const r = await getMatchDetailView(m.client, MATCH_ID, ME);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.videos[0].poster_url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMatchVideoPlaybackResult
// ---------------------------------------------------------------------------

describe("getMatchVideoPlaybackResult", () => {
  it("reads the row by id with the playback columns", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
        error: null,
      },
    });
    await getMatchVideoPlaybackResult(m.client, VID);
    expect(m.from).toHaveBeenCalledWith("match_videos");
    expect(m.select).toHaveBeenCalledWith("storage_path, normalized_path, thumbnail_url, status");
    expect(m.eq).toHaveBeenCalledWith("id", VID);
  });

  it("prefers normalized_path over storage_path", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.webm", normalized_path: "m/a/1.norm.mp4", thumbnail_url: null, status: "analyzed" },
        error: null,
      },
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID, 600);
    expect(m.createSignedUrl).toHaveBeenCalledWith("m/a/1.norm.mp4", 600);
    expect(r).toEqual({
      ok: true,
      data: { url: "https://signed/m/a/1.norm.mp4", posterUrl: null, status: "analyzed", playability: "playable" },
    });
  });

  it("falls back to storage_path and defaults to 1h", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
        error: null,
      },
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(m.createSignedUrl).toHaveBeenCalledWith("m/a/1.mp4", 3600);
    expect(r.ok && r.data?.url).toBe("https://signed/m/a/1.mp4");
  });

  it("a failed-status video is still returned as playable data (playability failed)", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "failed" },
        error: null,
      },
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ url: "https://signed/m/a/1.mp4", status: "failed", playability: "failed" });
  });

  it("returns ok:true,null when no row is visible", async () => {
    const m = mockClient({ maybeSingle: { data: null, error: null } });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r).toEqual({ ok: true, data: null });
    expect(m.createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns ok:true,null when the row has no path yet", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: null, normalized_path: null, thumbnail_url: null, status: "uploading" },
        error: null,
      },
    });
    expect(await getMatchVideoPlaybackResult(m.client, VID)).toEqual({ ok: true, data: null });
  });

  it("maps a read error through mapPostgrestError", async () => {
    const m = mockClient({ maybeSingle: { data: null, error: pgError(null, "fetch failed", "") } });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN");
  });

  it.each(["Object not found", "object not_found", "NotFound"])(
    "maps sign error %j to VIDEO_FILE_MISSING",
    async (message) => {
      const m = mockClient({
        maybeSingle: {
          data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
          error: null,
        },
        sign: () => ({ data: null, error: { message } }),
      });
      const r = await getMatchVideoPlaybackResult(m.client, VID);
      expect(r).toEqual({
        ok: false,
        error: { code: "VIDEO_FILE_MISSING", message: "The video file was not found." },
      });
    },
  );

  it("returns ok:true,null for a malformed video id without reading", async () => {
    const m = mockClient({});
    expect(await getMatchVideoPlaybackResult(m.client, "not-a-uuid")).toEqual({ ok: true, data: null });
    expect(m.from).not.toHaveBeenCalled();
  });

  it("returns ok:true,null for a deleted row without signing", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "deleted" },
        error: null,
      },
    });
    expect(await getMatchVideoPlaybackResult(m.client, VID)).toEqual({ ok: true, data: null });
    expect(m.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: "Bucket not found" }, "Bucket not found"],
    [{ message: "Bucket not found", statusCode: "404" }, "Bucket not found"],
    [{ message: "Object not found", statusCode: "500" }, "Object not found"],
  ])("does not treat %j as a missing file", async (err, message) => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
        error: null,
      },
      sign: () => ({ data: null, error: err }),
    });
    expect(await getMatchVideoPlaybackResult(m.client, VID)).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message },
    });
  });

  it("maps a 404 Object not found (numeric or string statusCode) to VIDEO_FILE_MISSING", async () => {
    for (const statusCode of ["404", 404]) {
      const m = mockClient({
        maybeSingle: {
          data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
          error: null,
        },
        sign: () => ({ data: null, error: { message: "Object not found", statusCode } }),
      });
      const r = await getMatchVideoPlaybackResult(m.client, VID);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("VIDEO_FILE_MISSING");
    }
  });

  it("maps any other sign error to UNKNOWN", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
        error: null,
      },
      sign: () => ({ data: null, error: { message: "Gateway timeout" } }),
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Gateway timeout" } });
  });

  it("maps a sign with no URL to UNKNOWN", async () => {
    const m = mockClient({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: null, status: "ready" },
        error: null,
      },
      sign: () => ({ data: { signedUrl: "" }, error: null }),
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN");
  });

  it("signs the poster best effort: success, http passthrough, failure is non-fatal", async () => {
    const row = (thumb: string) => ({
      maybeSingle: {
        data: { storage_path: "m/a/1.mp4", normalized_path: null, thumbnail_url: thumb, status: "ready" },
        error: null,
      },
    });
    const ok = mockClient(row("m/a/poster/1.jpg"));
    const r1 = await getMatchVideoPlaybackResult(ok.client, VID);
    expect(r1.ok && r1.data?.posterUrl).toBe("https://signed/m/a/poster/1.jpg");

    const legacy = mockClient(row("http://old.example/p.jpg"));
    const r2 = await getMatchVideoPlaybackResult(legacy.client, VID);
    expect(r2.ok && r2.data?.posterUrl).toBe("http://old.example/p.jpg");

    const failing = mockClient({
      ...row("m/a/poster/missing.jpg"),
      sign: (path) =>
        path.includes("poster")
          ? { data: null, error: { message: "Object not found" } }
          : { data: { signedUrl: `https://signed/${path}` }, error: null },
    });
    const r3 = await getMatchVideoPlaybackResult(failing.client, VID);
    expect(r3).toEqual({
      ok: true,
      data: { url: "https://signed/m/a/1.mp4", posterUrl: null, status: "ready", playability: "playable" },
    });
  });

  it("never throws when the client throws", async () => {
    const m = mockClient({});
    (m.from as unknown as { mockImplementation: (f: () => never) => void }).mockImplementation(() => {
      throw new Error("offline");
    });
    const r = await getMatchVideoPlaybackResult(m.client, VID);
    expect(r).toEqual({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  });
});

// ---------------------------------------------------------------------------
// getMyMatchVideos
// ---------------------------------------------------------------------------

function listRow(id: string, matchId: string, uploadedBy: string, status: string, createdAt: string) {
  return { id, match_id: matchId, uploaded_by: uploadedBy, status, created_at: createdAt };
}

function historyRow(matchId: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    match_id: matchId,
    match_type: "ranked",
    result: "points",
    completed_at: "2026-09-20T10:06:00Z",
    opponent_id: OPP,
    opponent_display_name: "Bob",
    athlete_outcome: "win",
    submission_type_code: null,
    submission_type_display_name: null,
    finish_time_seconds: null,
    elo_before: 1200,
    elo_after: 1210,
    elo_delta: 10,
    opponent_elo_at_time: 1190,
    ...over,
  };
}

describe("getMyMatchVideos", () => {
  it("reads non-deleted match_videos newest first with the default limit and no joins", async () => {
    const m = mockClient({ list: { data: [], error: null } });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r).toEqual({ ok: true, data: [] });
    expect(m.from).toHaveBeenCalledWith("match_videos");
    expect(m.select).toHaveBeenCalledWith("id, match_id, uploaded_by, status, created_at");
    expect(m.neq).toHaveBeenCalledWith("status", "deleted");
    expect(m.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(m.limit).toHaveBeenCalledWith(100);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("honours opts.limit", async () => {
    const m = mockClient({ list: { data: [], error: null } });
    await getMyMatchVideos(m.client, ME, { limit: 5 });
    expect(m.limit).toHaveBeenCalledWith(5);
  });

  it("returns ok:false on the list read error", async () => {
    const m = mockClient({ list: { data: null, error: pgError(null, "boom", "") } });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN");
  });

  it("groups two uploaders into one item with history metadata; failed counts as playable", async () => {
    const m = mockClient({
      list: {
        data: [
          listRow("v2", MATCH_ID, OPP, "failed", "2026-09-20T10:08:00Z"),
          listRow("v1", MATCH_ID, ME, "ready", "2026-09-20T10:07:00Z"),
        ],
        error: null,
      },
      rpc: (name) =>
        name === "get_match_history"
          ? { data: [historyRow(MATCH_ID)], error: null }
          : { data: null, error: null },
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r).toEqual({
      ok: true,
      data: [
        {
          match_id: MATCH_ID,
          match_status: "completed",
          match_type: "ranked",
          match_date: "2026-09-20T10:06:00Z",
          opponent_id: OPP,
          opponent_name: "Bob",
          outcome: "win",
          video_count: 2,
          playable_count: 2,
          latest_video_at: "2026-09-20T10:08:00Z",
        },
      ],
    });
    expect(m.rpc).toHaveBeenCalledWith("get_match_history", { p_athlete_id: ME });
    expect(m.rpc).not.toHaveBeenCalledWith("get_match_details", expect.anything());
  });

  it("excludes processing videos from playable_count", async () => {
    const m = mockClient({
      list: {
        data: [
          listRow("v2", MATCH_ID, OPP, "uploading", "2026-09-20T10:08:00Z"),
          listRow("v1", MATCH_ID, ME, "ready", "2026-09-20T10:07:00Z"),
        ],
        error: null,
      },
      rpc: (name) =>
        name === "get_match_history" ? { data: [historyRow(MATCH_ID)], error: null } : { data: null, error: null },
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r.ok && r.data[0]).toMatchObject({ video_count: 2, playable_count: 1 });
  });

  it("keeps a disputed match (absent from history) via the get_match_details fallback", async () => {
    const DISPUTED = "22222222-2222-4222-8222-222222222222";
    const m = mockClient({
      list: {
        data: [
          listRow("vd", DISPUTED, ME, "ready", "2026-09-22T09:00:00Z"),
          listRow("vc", MATCH_ID, ME, "ready", "2026-09-20T10:07:00Z"),
        ],
        error: null,
      },
      rpc: (name, args) => {
        if (name === "get_match_history") return { data: [historyRow(MATCH_ID)], error: null };
        if (name === "get_match_details" && args.p_match_id === DISPUTED) {
          return {
            data: {
              match: { ...matchRow("disputed", DISPUTED), match_type: "casual" },
              participants: [participant(ME, "Alice", "loss"), participant(OPP, "Bob", "win")],
              videos: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((i) => i.match_id)).toEqual([DISPUTED, MATCH_ID]);
    expect(r.data[0]).toEqual({
      match_id: DISPUTED,
      match_status: "disputed",
      match_type: "casual",
      match_date: "2026-09-22T09:00:00Z",
      opponent_id: OPP,
      opponent_name: "Bob",
      outcome: "loss",
      video_count: 1,
      playable_count: 1,
      latest_video_at: "2026-09-22T09:00:00Z",
    });
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps the item with nulls and status unknown when the detail call fails", async () => {
    const LOST = "33333333-3333-4333-8333-333333333333";
    const m = mockClient({
      list: { data: [listRow("vl", LOST, ME, "ready", "2026-09-22T09:00:00Z")], error: null },
      rpc: (name) =>
        name === "get_match_history"
          ? { data: [], error: null }
          : { data: null, error: pgError("not_participant") },
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r).toEqual({
      ok: true,
      data: [
        {
          match_id: LOST,
          match_status: "unknown",
          match_type: null,
          match_date: "2026-09-22T09:00:00Z",
          opponent_id: null,
          opponent_name: null,
          outcome: null,
          video_count: 1,
          playable_count: 1,
          latest_video_at: "2026-09-22T09:00:00Z",
        },
      ],
    });
  });

  it("a history failure still yields items via the fallback (never ok:false)", async () => {
    const m = mockClient({
      list: { data: [listRow("v1", MATCH_ID, ME, "ready", "2026-09-20T10:07:00Z")], error: null },
      rpc: (name) =>
        name === "get_match_history"
          ? { data: null, error: pgError(null, "history down", "") }
          : { data: detailsPayload([], "completed"), error: null },
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0]).toMatchObject({ match_status: "completed", opponent_name: "Bob", outcome: "win" });
  });

  it("caps get_match_details fallback calls at 20 and keeps the rest with nulls", async () => {
    const ids = Array.from({ length: 25 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const rows = ids.map((id, i) =>
      listRow(`v${i}`, id, ME, "ready", `2026-09-${String(25 - (i % 20)).padStart(2, "0")}T00:00:${String(59 - i).padStart(2, "0")}Z`),
    );
    const m = mockClient({
      list: { data: rows, error: null },
      rpc: (name, args) => {
        if (name === "get_match_history") return { data: [], error: null };
        return {
          data: {
            match: matchRow("disputed", args.p_match_id as string),
            participants: [participant(ME, "Alice", null), participant(OPP, "Bob", null)],
            videos: [],
          },
          error: null,
        };
      },
    });
    const r = await getMyMatchVideos(m.client, ME);
    const detailCalls = m.rpc.mock.calls.filter(([n]) => n === "get_match_details");
    expect(detailCalls).toHaveLength(20);
    expect(detailCalls.map(([, a]) => a.p_match_id)).toEqual(ids.slice(0, 20));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(25);
    expect(r.data.map((i) => i.match_id)).toEqual(ids);
    expect(r.data.slice(0, 20).every((i) => i.match_status === "disputed")).toBe(true);
    expect(r.data.slice(20).every((i) => i.match_status === "unknown" && i.opponent_name === null)).toBe(true);
  });

  it("never throws when the client throws", async () => {
    const m = mockClient({});
    (m.from as unknown as { mockImplementation: (f: () => never) => void }).mockImplementation(() => {
      throw new Error("offline");
    });
    const r = await getMyMatchVideos(m.client, ME);
    expect(r).toEqual({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  });
});
