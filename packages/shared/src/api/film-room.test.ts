import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMyMatchLibrary, getVideoAnalysis, getVideoSyncOffsets, isMissingRpcError } from "./film-room";
import { signPosterKeys } from "./poster-signing";

// ---------------------------------------------------------------------------
// Mock client: rpc by name, match_videos .select().in().neq(), batch signing
// ---------------------------------------------------------------------------

type Resp = { data: unknown; error: unknown };

interface MockOpts {
  rpc?: (name: string, args: Record<string, unknown>) => Resp;
  videos?: Resp;
  signUrls?: (paths: string[]) => Resp;
}

function mockClient(opts: MockOpts) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) =>
    opts.rpc ? opts.rpc(name, args) : { data: null, error: null },
  );
  const neq = vi.fn().mockResolvedValue(opts.videos ?? { data: [], error: null });
  const inFn = vi.fn().mockReturnValue({ neq });
  const select = vi.fn().mockReturnValue({ in: inFn });
  const from = vi.fn().mockReturnValue({ select });
  const createSignedUrls = vi.fn(async (paths: string[]) =>
    opts.signUrls
      ? opts.signUrls(paths)
      : {
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
          error: null,
        },
  );
  const createSignedUrl = vi.fn();
  const storageFrom = vi.fn().mockReturnValue({ createSignedUrls, createSignedUrl });
  return {
    client: { rpc, from, storage: { from: storageFrom } } as never,
    rpc,
    from,
    select,
    inFn,
    neq,
    createSignedUrls,
    createSignedUrl,
    storageFrom,
  };
}

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OPP = "bbbbbbbb-0000-4000-8000-000000000002";
const VID = "dddddddd-0000-4000-8000-000000000004";

function libVideo(over: Record<string, unknown> = {}) {
  return {
    video_id: "v-1",
    uploaded_by: ME,
    status: "analyzed",
    thumbnail_key: "m1/me/poster.jpg",
    thumbnail_width: 720,
    thumbnail_height: 1280,
    duration_seconds: 377,
    has_analysis: true,
    analysis_tier: "premium",
    chunk_count: 5,
    chunks_completed: 5,
    ...over,
  };
}

function libItem(over: Record<string, unknown> = {}) {
  return {
    match_id: "m1",
    completed_at: "2026-09-27T10:06:00Z",
    match_type: "ranked",
    status: "completed",
    outcome: "win",
    submission_name: "Rear-naked choke",
    finish_time_seconds: 377,
    duration_seconds: 600,
    elo_before: 1512,
    elo_after: 1526,
    elo_delta: 14,
    opponent: { id: OPP, display_name: "Mina Park", profile_photo_url: null },
    videos: [libVideo()],
    highlight_count: 2,
    ...over,
  };
}

function pgError(code: string, message = "err") {
  return { code, message, hint: null, details: null, name: "PostgrestError" };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signPosterKeys", () => {
  it("returns aligned output, passes http through and dedupes keys", async () => {
    const m = mockClient({});
    const out = await signPosterKeys(
      m.client,
      ["a.jpg", null, "https://cdn/x.jpg", "a.jpg", "b.jpg", ""],
      600,
    );
    expect(out).toEqual([
      "https://signed/a.jpg",
      null,
      "https://cdn/x.jpg",
      "https://signed/a.jpg",
      "https://signed/b.jpg",
      null,
    ]);
    expect(m.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(m.createSignedUrls).toHaveBeenCalledWith(["a.jpg", "b.jpg"], 600);
  });

  it("makes no storage call when nothing needs signing", async () => {
    const m = mockClient({});
    expect(await signPosterKeys(m.client, [null, "http://x/y.jpg"], 60)).toEqual([
      null,
      "http://x/y.jpg",
    ]);
    expect(m.createSignedUrls).not.toHaveBeenCalled();
  });

  it("nulls per-entry errors and survives a failed or throwing call", async () => {
    const partial = mockClient({
      signUrls: (paths) => ({
        data: paths.map((path) =>
          path === "bad.jpg"
            ? { path, signedUrl: "", error: "Object not found" }
            : { path, signedUrl: `https://signed/${path}`, error: null },
        ),
        error: null,
      }),
    });
    expect(await signPosterKeys(partial.client, ["ok.jpg", "bad.jpg"], 60)).toEqual([
      "https://signed/ok.jpg",
      null,
    ]);

    const failed = mockClient({ signUrls: () => ({ data: null, error: { message: "down" } }) });
    expect(await signPosterKeys(failed.client, ["ok.jpg"], 60)).toEqual([null]);

    const throwing = mockClient({
      signUrls: () => {
        throw new Error("boom");
      },
    });
    expect(await signPosterKeys(throwing.client, ["ok.jpg", "https://a/b"], 60)).toEqual([
      null,
      "https://a/b",
    ]);
  });
});

describe("isMissingRpcError", () => {
  it("recognises PGRST202 and 42883 only", () => {
    expect(isMissingRpcError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcError({ code: "42883" })).toBe(true);
    expect(isMissingRpcError({ code: "P0001" })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});

describe("getMyMatchLibrary (rpc)", () => {
  it("calls the RPC with the clamped limit and no p_before on the first page", async () => {
    const m = mockClient({ rpc: () => ({ data: { items: [], next_before: null }, error: null }) });
    await getMyMatchLibrary(m.client, ME);
    expect(m.rpc).toHaveBeenCalledWith("get_my_match_library", { p_limit: 20 });

    await getMyMatchLibrary(m.client, ME, { limit: 500, before: "2026-09-01T00:00:00Z" });
    expect(m.rpc).toHaveBeenLastCalledWith("get_my_match_library", {
      p_limit: 50,
      p_before: "2026-09-01T00:00:00Z",
    });
    // Both halves of the keyset cursor go back verbatim.
    await getMyMatchLibrary(m.client, ME, { before: "2026-09-01 00:00:00.123456+00", beforeId: "m9" });
    expect(m.rpc).toHaveBeenLastCalledWith("get_my_match_library", {
      p_limit: 20,
      p_before: "2026-09-01 00:00:00.123456+00",
      p_before_id: "m9",
    });
    await getMyMatchLibrary(m.client, ME, { limit: 0 });
    expect(m.rpc).toHaveBeenLastCalledWith("get_my_match_library", { p_limit: 1 });
  });

  it("maps items, signs every poster on the page in ONE call, and returns next_before", async () => {
    const m = mockClient({
      rpc: () => ({
        data: {
          items: [
            libItem({
              videos: [
                libVideo({ video_id: "v-opp", uploaded_by: OPP, thumbnail_key: "m1/opp/p.jpg" }),
                libVideo(),
              ],
            }),
            libItem({ match_id: "m2", outcome: "loss", elo_delta: -9, videos: [libVideo({ video_id: "v-2", thumbnail_key: null, status: "uploading", has_analysis: false })] }),
          ],
          next_before: "2026-09-20T00:00:00Z",
          next_before_id: "m2",
        },
        error: null,
      }),
    });
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.source).toBe("rpc");
    expect(r.data.next_before).toBe("2026-09-20T00:00:00Z");
    expect(r.data.next_before_id).toBe("m2");
    expect(m.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(m.createSignedUrls).toHaveBeenCalledWith(["m1/me/poster.jpg", "m1/opp/p.jpg"], 3600);

    const [first, second] = r.data.items;
    // The viewer's own angle first.
    expect(first.videos.map((v) => v.video_id)).toEqual(["v-1", "v-opp"]);
    expect(first.videos[0]).toMatchObject({
      poster_url: "https://signed/m1/me/poster.jpg",
      playability: "playable",
      has_analysis: true,
      chunk_count: 5,
      chunks_completed: 5,
    });
    expect(first).toMatchObject({
      outcome: "win",
      elo_delta: 14,
      submission_name: "Rear-naked choke",
      opponent: { id: OPP, display_name: "Mina Park", profile_photo_url: null },
      highlight_count: 2,
    });
    expect(second.videos[0]).toMatchObject({ poster_url: null, playability: "processing" });
    expect(second.outcome).toBe("loss");
  });

  it("tolerates malformed payloads: no items, junk rows, bad outcome", async () => {
    const m = mockClient({
      rpc: () => ({
        data: {
          items: [null, { nope: 1 }, libItem({ outcome: "weird", opponent: null, videos: [{ video_id: null }] })],
          next_before: 42,
        },
        error: null,
      }),
    });
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items).toHaveLength(1);
    expect(r.data.items[0]).toMatchObject({ outcome: null, opponent: null, videos: [] });
    expect(r.data.next_before).toBeNull();

    const empty = mockClient({ rpc: () => ({ data: null, error: null }) });
    const r2 = await getMyMatchLibrary(empty.client, ME);
    expect(r2).toEqual({ ok: true, data: { items: [], next_before: null, next_before_id: null, source: "rpc" } });
  });

  it("maps a real RPC error to a Result error (no fallback)", async () => {
    const m = mockClient({ rpc: () => ({ data: null, error: pgError("", "fetch failed") }) });
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN");
    expect(m.from).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    const m = mockClient({
      rpc: () => {
        throw new Error("network down");
      },
    });
    expect(await getMyMatchLibrary(m.client, ME)).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "network down" },
    });
  });
});

describe("getMyMatchLibrary (fallback when the RPC is missing)", () => {
  function history(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      match_id: `h${i}`,
      completed_at: `2026-09-${String(28 - i).padStart(2, "0")}T10:00:00Z`,
      match_type: "ranked",
      athlete_outcome: i % 2 ? "loss" : "win",
      result: "submission",
      submission_type_display_name: "Armbar",
      finish_time_seconds: 200,
      elo_before: 1500,
      elo_after: 1510,
      elo_delta: 10,
      opponent_id: OPP,
      opponent_display_name: "Mina Park",
    }));
  }

  function fallbackClient(rows: number, videos: Resp = { data: [], error: null }) {
    return mockClient({
      rpc: (name) =>
        name === "get_my_match_library"
          ? { data: null, error: pgError("PGRST202", "Could not find the function") }
          : { data: history(rows), error: null },
      videos,
    });
  }

  it("composes a page from history + match_videos, paged on completed_at", async () => {
    const m = fallbackClient(3, {
      data: [
        { id: "vx", match_id: "h0", uploaded_by: ME, status: "analyzed", thumbnail_url: "h0/p.jpg", duration_seconds: 300, chunk_count: 4, chunks_completed: 4, requested_tier: "standard" },
      ],
      error: null,
    });
    const r = await getMyMatchLibrary(m.client, ME, { limit: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.source).toBe("fallback");
    expect(r.data.items.map((i) => i.match_id)).toEqual(["h0", "h1"]);
    expect(r.data.next_before).toBe("2026-09-27T10:00:00Z");
    expect(r.data.next_before_id).toBe("h1");
    expect(m.rpc).toHaveBeenCalledWith("get_match_history", { p_athlete_id: ME });
    expect(m.inFn).toHaveBeenCalledWith("match_id", ["h0", "h1"]);
    expect(m.neq).toHaveBeenCalledWith("status", "deleted");
    expect(r.data.items[0]).toMatchObject({
      outcome: "win",
      submission_name: "Armbar",
      opponent: { id: OPP, display_name: "Mina Park", profile_photo_url: null },
      videos: [
        {
          video_id: "vx",
          has_analysis: true,
          analysis_tier: "standard",
          poster_url: "https://signed/h0/p.jpg",
        },
      ],
    });
    expect(r.data.items[1].videos).toEqual([]);

    const next = await getMyMatchLibrary(m.client, ME, {
      limit: 2,
      before: r.data.next_before,
      beforeId: r.data.next_before_id,
    });
    expect(next.ok && next.data.items.map((i) => i.match_id)).toEqual(["h2"]);
    expect(next.ok && next.data.next_before).toBeNull();
  });

  it("never loses a match that shares completed_at with the page boundary", async () => {
    const same = "2026-09-20T10:00:00Z";
    const rows = ["t-a", "t-b", "t-c", "t-d"].map((match_id, i) => ({
      match_id,
      completed_at: i === 3 ? "2026-09-19T10:00:00Z" : same,
      match_type: "ranked",
      athlete_outcome: "win",
      result: "points",
      submission_type_display_name: null,
      finish_time_seconds: null,
      elo_before: 1500,
      elo_after: 1510,
      elo_delta: 10,
      opponent_id: OPP,
      opponent_display_name: "Mina Park",
    }));
    const m = mockClient({
      rpc: (name) =>
        name === "get_my_match_library"
          ? { data: null, error: pgError("PGRST202") }
          : { data: rows, error: null },
    });
    const seen: string[] = [];
    let before: string | null = null;
    let beforeId: string | null = null;
    for (let i = 0; i < 5; i++) {
      const r = await getMyMatchLibrary(m.client, ME, { limit: 2, before, beforeId });
      if (!r.ok) throw new Error("page failed");
      seen.push(...r.data.items.map((it) => it.match_id));
      if (!r.data.next_before) break;
      before = r.data.next_before;
      beforeId = r.data.next_before_id;
    }
    // completed_at desc, match_id desc on ties; every match exactly once.
    expect(seen).toEqual(["t-c", "t-b", "t-a", "t-d"]);
  });

  it("surfaces a failed history read instead of an empty library", async () => {
    const m = mockClient({
      rpc: (name) =>
        name === "get_my_match_library"
          ? { data: null, error: pgError("PGRST202") }
          : { data: null, error: pgError("", "offline") },
    });
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r.ok).toBe(false);
  });

  it("surfaces a failed video read", async () => {
    const m = fallbackClient(1, { data: null, error: pgError("", "offline") });
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r.ok).toBe(false);
  });

  it("returns an empty last page without reading videos when there is no history", async () => {
    const m = fallbackClient(0);
    const r = await getMyMatchLibrary(m.client, ME);
    expect(r).toEqual({ ok: true, data: { items: [], next_before: null, next_before_id: null, source: "fallback" } });
    expect(m.from).not.toHaveBeenCalled();
  });
});

describe("getVideoAnalysis", () => {
  it("skips the round trip for a malformed id", async () => {
    const m = mockClient({});
    expect(await getVideoAnalysis(m.client, "nope")).toEqual({ ok: true, data: null });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("returns null when no analysis is complete yet", async () => {
    const m = mockClient({
      rpc: () => ({ data: { analysis: null, technique_tags: [] }, error: null }),
    });
    expect(await getVideoAnalysis(m.client, VID)).toEqual({ ok: true, data: null });
    expect(m.rpc).toHaveBeenCalledWith("get_video_analysis", { p_video_id: VID });
  });

  it("maps summary, tier, moments and tags (dropping nameless tags)", async () => {
    const m = mockClient({
      rpc: () => ({
        data: {
          analysis: {
            summary: "Reyes shot a single leg.",
            analysis_tier: "premium",
            positions: [{ position: "standing", timestamp_s: 9 }],
            scoring_moments: [{ type: "takedown", timestamp_s: 27 }],
            completed_at: "2026-09-27T10:20:00Z",
          },
          technique_tags: [
            { id: "t1", technique_name: "Single leg", category: "takedown", timestamp_start: 27, timestamp_end: 30 },
            { id: "t2", technique_name: "" },
          ],
        },
        error: null,
      }),
    });
    const r = await getVideoAnalysis(m.client, VID);
    expect(r.ok).toBe(true);
    if (!r.ok || !r.data) throw new Error("expected analysis");
    expect(r.data.summary).toBe("Reyes shot a single leg.");
    expect(r.data.analysis_tier).toBe("premium");
    expect(r.data.positions).toHaveLength(1);
    expect(r.data.scoring_moments).toHaveLength(1);
    expect(r.data.technique_tags.map((t) => t.technique_name)).toEqual(["Single leg"]);
  });

  describe("match_detected (jr_be-0qf)", () => {
    function analysisClient(analysis: Record<string, unknown>, tags: unknown[] = []) {
      return mockClient({ rpc: () => ({ data: { analysis, technique_tags: tags }, error: null }) });
    }

    it("maps an explicit no-match with its reason and camera tips, and never any match data", async () => {
      const m = analysisClient(
        {
          summary: "The video shows an empty office.",
          analysis_tier: "standard",
          // Contract says these are [] for a no-match; a stray entry is dropped.
          positions: [{ position: "standing", timestamp_s: 0 }],
          scoring_moments: [{ type: "takedown", timestamp_s: 5 }],
          recommendations: [
            { athlete_id: "a1", suggestion: "Frame both athletes from mat level." },
            { athlete_id: null, text: "  Turn on more light.  " },
            { athlete_id: "a1", suggestion: "   " },
            "junk",
          ],
          match_detected: false,
          no_match_reason: "  An empty office; nobody is grappling.  ",
        },
        [{ id: "t1", technique_name: "Single leg", timestamp_start: 3 }],
      );
      const r = await getVideoAnalysis(m.client, VID);
      if (!r.ok || !r.data) throw new Error("expected analysis");
      expect(r.data.match_detected).toBe(false);
      expect(r.data.no_match_reason).toBe("An empty office; nobody is grappling.");
      expect(r.data.positions).toEqual([]);
      expect(r.data.scoring_moments).toEqual([]);
      expect(r.data.technique_tags).toEqual([]);
      expect(r.data.recommendations).toEqual([
        { athlete_id: "a1", text: "Frame both athletes from mat level." },
        { athlete_id: null, text: "Turn on more light." },
      ]);
    });

    it("keeps a detected match's data and drops any reason", async () => {
      const m = analysisClient(
        {
          positions: [{ position: "standing", timestamp_s: 0 }],
          scoring_moments: [{ type: "takedown", timestamp_s: 5 }],
          match_detected: true,
          no_match_reason: "should not be here",
        },
        [{ id: "t1", technique_name: "Single leg", timestamp_start: 3 }],
      );
      const r = await getVideoAnalysis(m.client, VID);
      if (!r.ok || !r.data) throw new Error("expected analysis");
      expect(r.data.match_detected).toBe(true);
      expect(r.data.no_match_reason).toBeNull();
      expect(r.data.positions).toHaveLength(1);
      expect(r.data.scoring_moments).toHaveLength(1);
      expect(r.data.technique_tags).toHaveLength(1);
    });

    it.each([
      ["null (legacy analysis)", null],
      ["absent (older backend)", undefined],
      ["a string", "false"],
    ])("treats match_detected %s as unknown and keeps the data", async (_label, value) => {
      const m = analysisClient({
        positions: [{ position: "standing", timestamp_s: 0 }],
        match_detected: value,
        no_match_reason: "stray",
      });
      const r = await getVideoAnalysis(m.client, VID);
      if (!r.ok || !r.data) throw new Error("expected analysis");
      expect(r.data.match_detected).toBeNull();
      expect(r.data.no_match_reason).toBeNull();
      expect(r.data.positions).toHaveLength(1);
      expect(r.data.recommendations).toEqual([]);
    });
  });

  it("maps errors (not_participant) and never throws", async () => {
    const denied = mockClient({
      rpc: () => ({ data: null, error: { ...pgError("P0001", "no"), hint: "not_participant" } }),
    });
    const r = await getVideoAnalysis(denied.client, VID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_PARTICIPANT");

    const throwing = mockClient({
      rpc: () => {
        throw new Error("boom");
      },
    });
    expect(await getVideoAnalysis(throwing.client, VID)).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
  });
});

describe("getVideoSyncOffsets", () => {
  it("reads offsets by id and is best effort", async () => {
    const m = mockClient({});
    m.inFn.mockResolvedValueOnce({ data: [{ id: VID, sync_offset_ms: 1200 }], error: null });
    expect(await getVideoSyncOffsets(m.client, [VID, "not-a-uuid"])).toEqual({ [VID]: 1200 });
    expect(m.select).toHaveBeenCalledWith("id, sync_offset_ms");
    expect(m.inFn).toHaveBeenCalledWith("id", [VID]);

    const failed = mockClient({});
    failed.inFn.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await getVideoSyncOffsets(failed.client, [VID])).toEqual({});
    expect(await getVideoSyncOffsets(failed.client, [])).toEqual({});
  });
});
