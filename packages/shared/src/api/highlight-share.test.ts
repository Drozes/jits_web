import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getHighlightDetail,
  getHighlightFlags,
  getMyHighlights,
  logHighlightShareEvent,
  markHighlightSeen,
  prepareHighlightShare,
  signHighlightDownload,
} from "./highlight-share";
import {
  HIGHLIGHT_DOWNLOAD_URL_TTL_S,
  HIGHLIGHT_SHARE_SOURCES,
  HIGHLIGHT_SHARE_STEPS,
} from "../constants/highlights";

const HL = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const VIDEO = "11111111-1111-4111-8111-111111111111";

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

function pgErr(hint: string) {
  return { code: "P0001", message: "db text", details: "", hint };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("constants", () => {
  it("lists the 20 steps of the DB CHECK enum (with B4) and the 7 sources", () => {
    expect(HIGHLIGHT_SHARE_STEPS).toHaveLength(20);
    expect(new Set(HIGHLIGHT_SHARE_STEPS).size).toBe(20);
    expect(HIGHLIGHT_SHARE_STEPS).toEqual(expect.arrayContaining(["matches_reel_tapped", "viewer_swiped"]));
    expect(HIGHLIGHT_SHARE_SOURCES).toEqual(["push", "bell", "home", "profile", "match_detail", "summary", "matches"]);
    expect(HIGHLIGHT_DOWNLOAD_URL_TTL_S).toBe(300);
  });
});

describe("getHighlightFlags", () => {
  it("calls get_highlight_flags and maps both flags", async () => {
    const { client, rpc } = rpcClient({ data: { clips_enabled: true, share_enabled: false }, error: null });
    await expect(getHighlightFlags(client)).resolves.toEqual({
      ok: true,
      data: { clipsEnabled: true, shareEnabled: false },
    });
    expect(rpc).toHaveBeenCalledWith("get_highlight_flags");
  });

  it("returns ok:false on an RPC error (callers treat both as false)", async () => {
    const { client } = rpcClient({ data: null, error: { code: "42501", message: "denied", details: "", hint: "" } });
    const result = await getHighlightFlags(client);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false on a throw and on a malformed body", async () => {
    const throwing = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as never;
    expect((await getHighlightFlags(throwing)).ok).toBe(false);
    const { client } = rpcClient({ data: "nope", error: null });
    expect((await getHighlightFlags(client)).ok).toBe(false);
  });

  it("treats a non-true value as false", async () => {
    const { client } = rpcClient({ data: { clips_enabled: "true", share_enabled: null }, error: null });
    expect(await getHighlightFlags(client)).toEqual({ ok: true, data: { clipsEnabled: false, shareEnabled: false } });
  });
});

const ITEM = {
  highlight_id: HL,
  match_id: MATCH,
  match_video_id: VIDEO,
  version: 2,
  duration_s: "31.200",
  poster_path: "m/u/highlights/2.jpg",
  ready_at: "2026-09-27T10:00:00Z",
  opponent_name: "Ana",
  match_type: "ranked",
  outcome: "win",
  played_at: "2026-09-27T09:00:00Z",
  notified_at: "2026-09-27T10:00:01Z",
  unseen: true,
  origin: "regen",
};

describe("getMyHighlights", () => {
  it("sends every option under its SQL name and maps items to camelCase", async () => {
    const { client, rpc } = rpcClient({
      data: { clips_enabled: true, share_enabled: true, items: [ITEM] },
      error: null,
    });
    const result = await getMyHighlights(client, { limit: 1, before: "2026-09-28T00:00:00Z", unseenOnly: true });
    expect(rpc).toHaveBeenCalledWith("get_my_highlights", {
      p_limit: 1,
      p_before: "2026-09-28T00:00:00Z",
      p_unseen_only: true,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        clipsEnabled: true,
        shareEnabled: true,
        items: [
          {
            highlightId: HL,
            matchId: MATCH,
            matchVideoId: VIDEO,
            version: 2,
            durationS: 31.2,
            posterPath: "m/u/highlights/2.jpg",
            readyAt: "2026-09-27T10:00:00Z",
            opponentName: "Ana",
            matchType: "ranked",
            outcome: "win",
            playedAt: "2026-09-27T09:00:00Z",
            notifiedAt: "2026-09-27T10:00:01Z",
            unseen: true,
            origin: "regen",
          },
        ],
        nextBefore: null,
        nextBeforeId: null,
        inFlight: [],
        inFlightSupported: false,
      },
    });
  });

  it("omits unset options so the SQL defaults apply, and maps nulls", async () => {
    const { client, rpc } = rpcClient({
      data: {
        clips_enabled: true,
        share_enabled: false,
        items: [
          {
            ...ITEM,
            poster_path: null,
            opponent_name: null,
            outcome: null,
            match_type: "casual",
            notified_at: null,
            unseen: false,
          },
        ],
      },
      error: null,
    });
    const result = await getMyHighlights(client);
    expect(rpc).toHaveBeenCalledWith("get_my_highlights", {});
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items[0]).toMatchObject({
      posterPath: null,
      opponentName: null,
      outcome: null,
      matchType: "casual",
      notifiedAt: null,
      unseen: false,
    });
  });

  it.each([
    ["auto", "auto"],
    ["regen", "regen"],
    ["retry", "retry"],
    ["manual", null],
    [null, null],
    [undefined, null],
    [7, null],
  ])("maps origin %p -> %p (additive key; unknown or missing -> null)", async (origin, expected) => {
    const item: Record<string, unknown> = { ...ITEM, origin };
    if (origin === undefined) delete item.origin;
    const { client } = rpcClient({ data: { clips_enabled: true, share_enabled: true, items: [item] }, error: null });
    const result = await getMyHighlights(client);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items[0].origin).toBe(expected);
  });

  it("returns an empty list when items is missing, and skips malformed items", async () => {
    const { client } = rpcClient({ data: { clips_enabled: false, share_enabled: false, items: [null, 3, ITEM] }, error: null });
    const result = await getMyHighlights(client);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items).toHaveLength(1);
    const { client: c2 } = rpcClient({ data: { clips_enabled: false, share_enabled: false }, error: null });
    const r2 = await getMyHighlights(c2);
    expect(r2.ok && r2.data.items).toEqual([]);
  });

  describe("B1 cursor (p_before_id, next_before / next_before_id)", () => {
    const B1 = "44444444-4444-4444-8444-444444444444";

    it("sends p_before_id only when beforeId is set", async () => {
      const { client, rpc } = rpcClient({ data: { clips_enabled: true, share_enabled: true, items: [] }, error: null });
      await getMyHighlights(client, { limit: 10, before: "2026-09-28T00:00:00Z", beforeId: B1 });
      expect(rpc).toHaveBeenLastCalledWith("get_my_highlights", {
        p_limit: 10,
        p_before: "2026-09-28T00:00:00Z",
        p_before_id: B1,
      });
      await getMyHighlights(client, { limit: 10, before: "2026-09-28T00:00:00Z", beforeId: null });
      expect(rpc).toHaveBeenLastCalledWith("get_my_highlights", { p_limit: 10, p_before: "2026-09-28T00:00:00Z" });
      await getMyHighlights(client, { limit: 10, beforeId: "" });
      expect(rpc).toHaveBeenLastCalledWith("get_my_highlights", { p_limit: 10 });
    });

    it.each(["PGRST202", "42883"])(
      "retries once without p_before_id on function-not-found (%s), keeping p_before",
      async (code) => {
        const rpc = vi
          .fn()
          .mockResolvedValueOnce({ data: null, error: { code, message: "no function", details: "", hint: "" } })
          .mockResolvedValueOnce({ data: { clips_enabled: true, share_enabled: true, items: [ITEM] }, error: null });
        const result = await getMyHighlights({ rpc } as never, { limit: 5, before: "2026-09-28T00:00:00Z", beforeId: B1 });
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(rpc.mock.calls[0][1]).toEqual({ p_limit: 5, p_before: "2026-09-28T00:00:00Z", p_before_id: B1 });
        expect(rpc.mock.calls[1][1]).toEqual({ p_limit: 5, p_before: "2026-09-28T00:00:00Z" });
        expect(result.ok && result.data.items).toHaveLength(1);
        expect(result.ok && result.data.nextBefore).toBeNull();
      },
    );

    it("does not retry a function-not-found when no beforeId was sent", async () => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x", details: "", hint: "" } });
      const result = await getMyHighlights({ rpc } as never, { limit: 5 });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
    });

    it("does not retry other errors, and surfaces a failed retry", async () => {
      const other = vi.fn().mockResolvedValue({ data: null, error: pgErr("highlight_no_athlete") });
      const r1 = await getMyHighlights({ rpc: other } as never, { before: "2026-09-28T00:00:00Z", beforeId: B1 });
      expect(other).toHaveBeenCalledTimes(1);
      expect(!r1.ok && r1.error.code).toBe("ATHLETE_NOT_FOUND");

      const twice = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x", details: "", hint: "" } });
      const r2 = await getMyHighlights({ rpc: twice } as never, { before: "2026-09-28T00:00:00Z", beforeId: B1 });
      expect(twice).toHaveBeenCalledTimes(2);
      expect(r2.ok).toBe(false);
    });

    it("reads next_before / next_before_id when present", async () => {
      const { client } = rpcClient({
        data: { clips_enabled: true, share_enabled: true, items: [ITEM], next_before: "2026-09-27T10:00:00Z", next_before_id: HL },
        error: null,
      });
      const result = await getMyHighlights(client, { limit: 1 });
      expect(result.ok && [result.data.nextBefore, result.data.nextBeforeId]).toEqual(["2026-09-27T10:00:00Z", HL]);
    });

    it("reads null cursor keys (last page) and drops an id without a time", async () => {
      const { client } = rpcClient({
        data: { clips_enabled: true, share_enabled: true, items: [], next_before: null, next_before_id: HL },
        error: null,
      });
      const result = await getMyHighlights(client);
      expect(result.ok && [result.data.nextBefore, result.data.nextBeforeId]).toEqual([null, null]);
    });
  });

  describe("B2 in_flight", () => {
    const RAW_IN_FLIGHT = {
      match_id: MATCH,
      match_video_id: VIDEO,
      reel_state: "waiting",
      wait_deadline_at: "2026-10-06T10:05:00Z",
      server_now: "2026-10-06T10:01:00Z",
      opponent_name: "Ana",
      played_at: "2026-10-06T09:50:00Z",
      poster_path: "m/u/poster.jpg",
    };

    it("is [] when the key is absent (older backend) or not an array", async () => {
      const { client } = rpcClient({ data: { clips_enabled: true, share_enabled: true, items: [] }, error: null });
      const r1 = await getMyHighlights(client);
      expect(r1.ok && r1.data.inFlight).toEqual([]);
      expect(r1.ok && r1.data.inFlightSupported).toBe(false);
      const { client: c2 } = rpcClient({ data: { clips_enabled: true, share_enabled: true, items: [], in_flight: { a: 1 } }, error: null });
      const r2 = await getMyHighlights(c2);
      expect(r2.ok && r2.data.inFlight).toEqual([]);
    });

    it("maps the spec keys to camelCase with a derived step", async () => {
      const { client } = rpcClient({
        data: {
          clips_enabled: true,
          share_enabled: true,
          items: [],
          in_flight: [
            RAW_IN_FLIGHT,
            { ...RAW_IN_FLIGHT, match_id: "m-2", reel_state: "planning", wait_deadline_at: "2026-10-06T10:05:00Z" },
            { ...RAW_IN_FLIGHT, match_id: "m-3", reel_state: "rendering", poster_path: null },
          ],
        },
        error: null,
      });
      const result = await getMyHighlights(client);
      if (!result.ok) throw new Error("expected ok");
      expect(result.data.inFlightSupported).toBe(true);
      expect(result.data.inFlight).toEqual([
        {
          matchId: MATCH,
          matchVideoId: VIDEO,
          highlightId: null,
          reelState: "waiting",
          step: 1,
          waitDeadlineAt: "2026-10-06T10:05:00Z",
          serverNow: "2026-10-06T10:01:00Z",
          opponentName: "Ana",
          playedAt: "2026-10-06T09:50:00Z",
          posterPath: "m/u/poster.jpg",
        },
        expect.objectContaining({ matchId: "m-2", reelState: "planning", step: 1, waitDeadlineAt: null }),
        expect.objectContaining({ matchId: "m-3", reelState: "rendering", step: 2, posterPath: null }),
      ]);
    });

    it("accepts the phase / poster_key / highlight_id / step spellings", async () => {
      const { client } = rpcClient({
        data: {
          clips_enabled: true,
          share_enabled: true,
          items: [],
          in_flight: [{ match_id: MATCH, highlight_id: HL, phase: "rendering", step: 2, poster_key: "k.jpg", opponent_name: "" }],
        },
        error: null,
      });
      const result = await getMyHighlights(client);
      expect(result.ok && result.data.inFlight[0]).toEqual(
        expect.objectContaining({ highlightId: HL, reelState: "rendering", step: 2, posterPath: "k.jpg", opponentName: null, matchVideoId: null }),
      );
    });

    it("drops entries with no match id or a state that is not in flight", async () => {
      const { client } = rpcClient({
        data: {
          clips_enabled: true,
          share_enabled: true,
          items: [],
          in_flight: [null, 7, { reel_state: "rendering" }, { ...RAW_IN_FLIGHT, reel_state: "ready" }, { ...RAW_IN_FLIGHT, reel_state: "failed" }, { ...RAW_IN_FLIGHT, reel_state: null }, RAW_IN_FLIGHT],
        },
        error: null,
      });
      const result = await getMyHighlights(client);
      expect(result.ok && result.data.inFlight.map((r) => r.matchId)).toEqual([MATCH]);
    });

    it("is [] with clips off even if the server sent entries", async () => {
      const { client } = rpcClient({
        data: { clips_enabled: false, share_enabled: false, items: [], in_flight: [RAW_IN_FLIGHT] },
        error: null,
      });
      const result = await getMyHighlights(client);
      expect(result.ok && result.data.inFlight).toEqual([]);
    });
  });

  it("maps a hinted error", async () => {
    const { client } = rpcClient({ data: null, error: pgErr("highlight_no_athlete") });
    const result = await getMyHighlights(client);
    expect(!result.ok && result.error.code).toBe("ATHLETE_NOT_FOUND");
  });
});

const DETAIL = {
  highlight_id: HL,
  match_video_id: VIDEO,
  match_id: MATCH,
  version: 2,
  clips_enabled: true,
  share_enabled: true,
  caption: {
    athlete_name: "Me",
    opponent_name: "Ana",
    match_type: "ranked",
    outcome: "win",
    elo_after: 1234,
    elo_delta: 12,
    technique: "armbar",
    played_at: "2026-09-27T09:00:00Z",
  },
};

describe("getHighlightDetail", () => {
  it("calls get_highlight_detail with p_highlight_id and maps every key", async () => {
    const { client, rpc } = rpcClient({ data: DETAIL, error: null });
    const result = await getHighlightDetail(client, HL);
    expect(rpc).toHaveBeenCalledWith("get_highlight_detail", { p_highlight_id: HL });
    expect(result).toEqual({
      ok: true,
      data: {
        highlightId: HL,
        matchVideoId: VIDEO,
        matchId: MATCH,
        version: 2,
        clipsEnabled: true,
        shareEnabled: true,
        caption: {
          athleteName: "Me",
          opponentName: "Ana",
          matchType: "ranked",
          outcome: "win",
          eloAfter: 1234,
          eloDelta: 12,
          technique: "armbar",
          playedAt: "2026-09-27T09:00:00Z",
        },
      },
    });
  });

  it("maps the null variants (no live version, casual, no opponent)", async () => {
    const { client } = rpcClient({
      data: {
        ...DETAIL,
        version: null,
        share_enabled: false,
        caption: {
          ...DETAIL.caption,
          opponent_name: null,
          match_type: "casual",
          outcome: null,
          elo_after: null,
          elo_delta: null,
          technique: null,
        },
      },
      error: null,
    });
    const result = await getHighlightDetail(client, HL);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.version).toBeNull();
    expect(result.data.shareEnabled).toBe(false);
    expect(result.data.caption).toEqual({
      athleteName: "Me",
      opponentName: null,
      matchType: "casual",
      outcome: null,
      eloAfter: null,
      eloDelta: null,
      technique: null,
      playedAt: "2026-09-27T09:00:00Z",
    });
  });

  it("maps highlight_not_found", async () => {
    const { client } = rpcClient({ data: null, error: pgErr("highlight_not_found") });
    const result = await getHighlightDetail(client, HL);
    expect(!result.ok && result.error).toMatchObject({
      code: "HIGHLIGHT_NOT_FOUND",
      message: "That highlight no longer exists.",
    });
  });
});

describe("markHighlightSeen", () => {
  it("calls mark_highlight_seen with p_highlight_id and p_version", async () => {
    const { client, rpc } = rpcClient({ data: null, error: null });
    await expect(markHighlightSeen(client, HL, 3)).resolves.toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith("mark_highlight_seen", { p_highlight_id: HL, p_version: 3 });
  });

  it("maps highlight_bad_event to HIGHLIGHT_EVENT_REJECTED", async () => {
    const { client } = rpcClient({ data: null, error: pgErr("highlight_bad_event") });
    const result = await markHighlightSeen(client, HL, 0);
    expect(!result.ok && result.error.code).toBe("HIGHLIGHT_EVENT_REJECTED");
  });
});

describe("prepareHighlightShare", () => {
  const SOURCE = {
    highlight_id: HL,
    version: 2,
    storage_path: "m/u/highlights/2.mp4",
    duration_s: 31.2,
    file_name: "elorated-highlight-22222222-v2.mp4",
  };

  it("calls prepare_highlight_share and maps the source", async () => {
    const { client, rpc } = rpcClient({ data: SOURCE, error: null });
    await expect(prepareHighlightShare(client, HL)).resolves.toEqual({
      ok: true,
      data: {
        highlightId: HL,
        version: 2,
        storagePath: "m/u/highlights/2.mp4",
        durationS: 31.2,
        fileName: "elorated-highlight-22222222-v2.mp4",
      },
    });
    expect(rpc).toHaveBeenCalledWith("prepare_highlight_share", { p_highlight_id: HL });
  });

  it("maps the kill switch to HIGHLIGHT_SHARE_DISABLED", async () => {
    const { client } = rpcClient({ data: null, error: pgErr("highlight_share_disabled") });
    const result = await prepareHighlightShare(client, HL);
    expect(!result.ok && result.error).toMatchObject({
      code: "HIGHLIGHT_SHARE_DISABLED",
      message: "Sharing is turned off right now.",
    });
  });

  it("refuses a body without a storage path or file name", async () => {
    const { client } = rpcClient({ data: { ...SOURCE, storage_path: "" }, error: null });
    expect((await prepareHighlightShare(client, HL)).ok).toBe(false);
    const { client: c2 } = rpcClient({ data: { ...SOURCE, file_name: null }, error: null });
    expect((await prepareHighlightShare(c2, HL)).ok).toBe(false);
  });
});

describe("signHighlightDownload", () => {
  function storageClient(result: { data: unknown; error: unknown }) {
    const createSignedUrl = vi.fn().mockResolvedValue(result);
    const from = vi.fn(() => ({ createSignedUrl }));
    return { client: { storage: { from } } as never, from, createSignedUrl };
  }

  it("signs in match-videos with a 300 s TTL by default", async () => {
    const { client, from, createSignedUrl } = storageClient({ data: { signedUrl: "https://x/signed" }, error: null });
    await expect(signHighlightDownload(client, "m/u/h.mp4")).resolves.toEqual({ ok: true, data: { url: "https://x/signed" } });
    expect(from).toHaveBeenCalledWith("match-videos");
    expect(createSignedUrl).toHaveBeenCalledWith("m/u/h.mp4", 300);
  });

  it("honours an explicit TTL", async () => {
    const { client, createSignedUrl } = storageClient({ data: { signedUrl: "u" }, error: null });
    await signHighlightDownload(client, "k", 60);
    expect(createSignedUrl).toHaveBeenCalledWith("k", 60);
  });

  it("maps a missing object to VIDEO_FILE_MISSING and other errors to UNKNOWN", async () => {
    const { client } = storageClient({ data: null, error: { message: "Object not found" } });
    const missing = await signHighlightDownload(client, "k");
    expect(!missing.ok && missing.error.code).toBe("VIDEO_FILE_MISSING");
    const { client: c2 } = storageClient({ data: null, error: { message: "boom" } });
    const other = await signHighlightDownload(c2, "k");
    expect(!other.ok && other.error.code).toBe("UNKNOWN");
    const { client: c3 } = storageClient({ data: {}, error: null });
    expect((await signHighlightDownload(c3, "k")).ok).toBe(false);
  });
});

describe("logHighlightShareEvent", () => {
  it("calls log_highlight_share_event with the step and detail", async () => {
    const { client, rpc } = rpcClient({ data: null, error: null });
    await logHighlightShareEvent(client, HL, "download_ok", { byte_count: 10, path: "reels" });
    expect(rpc).toHaveBeenCalledWith("log_highlight_share_event", {
      p_highlight_id: HL,
      p_step: "download_ok",
      p_detail: { byte_count: 10, path: "reels" },
    });
  });

  it("sends an empty detail object when none is given", async () => {
    const { client, rpc } = rpcClient({ data: null, error: null });
    await logHighlightShareEvent(client, HL, "viewer_opened");
    expect(rpc).toHaveBeenCalledWith("log_highlight_share_event", {
      p_highlight_id: HL,
      p_step: "viewer_opened",
      p_detail: {},
    });
  });

  it("never rejects: RPC error, rejected promise, synchronous throw", async () => {
    const { client } = rpcClient({ data: null, error: pgErr("highlight_event_limit") });
    await expect(logHighlightShareEvent(client, HL, "share_tapped")).resolves.toBeUndefined();
    const rejecting = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as never;
    await expect(logHighlightShareEvent(rejecting, HL, "share_tapped")).resolves.toBeUndefined();
    const throwing = {
      rpc: vi.fn(() => {
        throw new Error("sync");
      }),
    } as never;
    await expect(logHighlightShareEvent(throwing, HL, "share_tapped")).resolves.toBeUndefined();
  });
});

describe("no raw data access outside packages/shared/src/api", () => {
  it("the caption util and the constants call neither .rpc( nor .from(", () => {
    const root = path.join(__dirname, "..");
    const files = [
      path.join(root, "utils", "highlight-caption.ts"),
      path.join(root, "constants", "highlights.ts"),
      ...fs
        .readdirSync(path.join(root, "utils"))
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => path.join(root, "utils", f)),
    ];
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/\.rpc\(|\.from\(/);
    }
  });
});
