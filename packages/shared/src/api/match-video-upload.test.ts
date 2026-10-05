import { describe, it, expect, vi } from "vitest";
import {
  abandonMatchVideoUpload,
  canUploadMatchVideo,
  finalizeMatchVideoUpload,
  reserveMatchVideoUpload,
  setMatchRecordingIntent,
  touchMatchVideoUpload,
} from "./match-video-upload";

type Res = { data: unknown; error: unknown };

/**
 * A chainable `from()` double. Every terminal (`single` / `maybeSingle`)
 * pops the next queued result, and every call is recorded so a test can
 * assert what was written and how it was filtered.
 */
function client(results: Res[], rpc?: Res) {
  const queue = [...results];
  const calls: { op: string; args: unknown[] }[] = [];
  const next = () => Promise.resolve(queue.shift() ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "select", "eq"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.single = () => next();
  chain.maybeSingle = () => next();
  const rpcFn = vi.fn().mockResolvedValue(rpc ?? { data: null, error: null });
  return {
    sb: { from: vi.fn(() => chain), rpc: rpcFn } as never,
    calls,
    rpc: rpcFn,
  };
}

const ROW = { id: "V1", status: "uploading", storage_path: "M/A/1.mp4", failure_code: null };

const RESERVE = {
  matchId: "M",
  uploaderAthleteId: "A",
  storagePath: "M/A/1.mp4",
  fileSizeBytes: 1234,
  recordStartedAt: "2026-10-05T10:00:00.000Z",
  recordDurationMs: 361_000.4,
};

describe("reserveMatchVideoUpload", () => {
  it("INSERTs at 'uploading' with the final path, size, transport and record metadata", async () => {
    const { sb, calls } = client([{ data: ROW, error: null }]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res).toEqual({
      ok: true,
      data: { id: "V1", status: "uploading", storagePath: "M/A/1.mp4", failureCode: null, resumed: false },
    });
    const insert = calls.find((c) => c.op === "insert")!.args[0];
    expect(insert).toEqual({
      match_id: "M",
      uploaded_by: "A",
      storage_path: "M/A/1.mp4",
      status: "uploading",
      requested_tier: "standard",
      file_size_bytes: 1234,
      upload_bytes_total: 1234,
      upload_transport: "tus",
      record_started_at: "2026-10-05T10:00:00.000Z",
      record_duration_ms: 361_000,
    });
  });

  it("omits record metadata it does not have", async () => {
    const { sb, calls } = client([{ data: ROW, error: null }]);
    await reserveMatchVideoUpload(sb, { ...RESERVE, recordStartedAt: null, recordDurationMs: null });
    const insert = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).not.toHaveProperty("record_started_at");
    expect(insert).not.toHaveProperty("record_duration_ms");
  });

  it("on 23505 takes the existing row over with a re-path PATCH (no second row)", async () => {
    const { sb, calls } = client([
      { data: null, error: { code: "23505", message: "dup", details: "", hint: "" } },
      { data: { ...ROW, id: "OLD" }, error: null },
    ]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok && res.data).toMatchObject({ id: "OLD", resumed: true });
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1);
    const update = calls.find((c) => c.op === "update")!.args[0];
    expect(update).toEqual({
      storage_path: "M/A/1.mp4",
      status: "uploading",
      file_size_bytes: 1234,
      upload_bytes_total: 1234,
      upload_transport: "tus",
    });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["match_id", "M"],
      ["uploaded_by", "A"],
    ]);
  });

  it("keeps the raw PostgrestError (code + HINT) for a gate or a bad path", async () => {
    const gate = { code: "P0001", message: "limit", details: "", hint: "upload_rate_limited" };
    const r1 = await reserveMatchVideoUpload(client([{ data: null, error: gate }]).sb, RESERVE);
    expect(!r1.ok && r1.error.raw?.hint).toBe("upload_rate_limited");
    const path = { code: "42501", message: "bad path", details: "", hint: "invalid_storage_path" };
    const r2 = await reserveMatchVideoUpload(client([{ data: null, error: path }]).sb, RESERVE);
    expect(!r2.ok && r2.error.raw).toMatchObject({ code: "42501", hint: "invalid_storage_path" });
  });

  it("surfaces a reslice-limit refusal on the re-path PATCH", async () => {
    const { sb } = client([
      { data: null, error: { code: "23505", message: "dup", details: "", hint: "" } },
      { data: null, error: { code: "P0001", message: "reslice", details: "", hint: "video_reslice_limit" } },
    ]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(!res.ok && res.error.raw?.hint).toBe("video_reslice_limit");
  });

  it("never throws", async () => {
    const sb = { from: () => { throw new Error("boom"); } } as never;
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });
});

describe("finalizeMatchVideoUpload", () => {
  it("PATCHes to 'ready' filtered on id AND storage_path", async () => {
    const { sb, calls } = client([{ data: { ...ROW, status: "ready" }, error: null }]);
    const res = await finalizeMatchVideoUpload(sb, { videoId: "V1", storagePath: "M/A/1.mp4" });
    expect(res).toEqual({ ok: true, data: { outcome: "landed", status: "ready" } });
    expect(calls.find((c) => c.op === "update")!.args[0]).toEqual({ status: "ready" });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["id", "V1"],
      ["storage_path", "M/A/1.mp4"],
    ]);
  });

  it("treats a row the storage trigger already flipped (and the slicer moved on) as landed", async () => {
    // The guard reverts the redundant status write, so the row comes back as
    // the pipeline left it.
    const { sb } = client([{ data: { ...ROW, status: "slicing" }, error: null }]);
    const res = await finalizeMatchVideoUpload(sb, { videoId: "V1", storagePath: "M/A/1.mp4" });
    expect(res).toEqual({ ok: true, data: { outcome: "landed", status: "slicing" } });
  });

  it("reports an abandoned row by failure_code", async () => {
    const { sb } = client([{ data: { ...ROW, status: "failed", failure_code: "upload_abandoned" }, error: null }]);
    const res = await finalizeMatchVideoUpload(sb, { videoId: "V1", storagePath: "M/A/1.mp4" });
    expect(res).toEqual({ ok: true, data: { outcome: "abandoned", failureCode: "upload_abandoned" } });
  });

  it("tells a re-pathed row (moved) from a deleted one (missing)", async () => {
    const moved = client([{ data: null, error: null }, { data: { ...ROW, storage_path: "M/A/2.mp4" }, error: null }]);
    expect(await finalizeMatchVideoUpload(moved.sb, { videoId: "V1", storagePath: "M/A/1.mp4" })).toEqual({
      ok: true,
      data: { outcome: "moved" },
    });
    const gone = client([{ data: null, error: null }, { data: null, error: null }]);
    expect(await finalizeMatchVideoUpload(gone.sb, { videoId: "V1", storagePath: "M/A/1.mp4" })).toEqual({
      ok: true,
      data: { outcome: "missing" },
    });
  });

  it("returns a transport error as a Result", async () => {
    const { sb } = client([{ data: null, error: { code: "", message: "TypeError: Network request failed", details: "", hint: "" } }]);
    const res = await finalizeMatchVideoUpload(sb, { videoId: "V1", storagePath: "M/A/1.mp4" });
    expect(res.ok).toBe(false);
  });
});

describe("touch / abandon / preflight / intent RPCs", () => {
  it("touch sends floored bytes, total and transport", async () => {
    const { sb, rpc } = client([], { data: { status: "uploading", updated: true }, error: null });
    const res = await touchMatchVideoUpload(sb, { videoId: "V1", bytesConfirmed: 10.7, bytesTotal: 100, transport: "tus" });
    expect(rpc).toHaveBeenCalledWith("touch_match_video_upload", {
      p_video_id: "V1",
      p_bytes_confirmed: 10,
      p_bytes_total: 100,
      p_transport: "tus",
    });
    expect(res).toEqual({ ok: true, data: { status: "uploading", updated: true } });
  });

  it("touch answers updated=false once the row left uploading", async () => {
    const { sb } = client([], { data: { status: "ready", updated: false }, error: null });
    expect(await touchMatchVideoUpload(sb, { videoId: "V1", bytesConfirmed: 5 })).toEqual({
      ok: true,
      data: { status: "ready", updated: false },
    });
  });

  it("abandon reads the abandoned flag", async () => {
    const { sb, rpc } = client([], { data: { status: "failed", abandoned: true }, error: null });
    expect(await abandonMatchVideoUpload(sb, "V1")).toEqual({ ok: true, data: { status: "failed", abandoned: true } });
    expect(rpc).toHaveBeenCalledWith("abandon_match_video_upload", { p_video_id: "V1" });
  });

  it("preflight normalises the payload", async () => {
    const { sb, rpc } = client([], {
      data: {
        allowed: false,
        reason: "rate_limited",
        remaining_today: 0,
        daily_cap: 10,
        resets_at: "2026-10-06T09:00:00Z",
        max_bytes: 2147483648,
        existing_video_id: null,
        existing_status: null,
      },
      error: null,
    });
    const res = await canUploadMatchVideo(sb, "M", 500);
    expect(rpc).toHaveBeenCalledWith("can_upload_match_video", { p_match_id: "M", p_file_size_bytes: 500 });
    expect(res).toEqual({
      ok: true,
      data: {
        allowed: false,
        reason: "rate_limited",
        remainingToday: 0,
        dailyCap: 10,
        resetsAt: "2026-10-06T09:00:00Z",
        maxBytes: 2147483648,
        existingVideoId: null,
        existingStatus: null,
      },
    });
  });

  it("preflight omits the size when unknown", async () => {
    const { sb, rpc } = client([], { data: { allowed: true, reason: null }, error: null });
    await canUploadMatchVideo(sb, "M");
    expect(rpc).toHaveBeenCalledWith("can_upload_match_video", { p_match_id: "M" });
  });

  it("intent passes the boolean through and maps errors", async () => {
    const ok = client([], { data: {}, error: null });
    expect(await setMatchRecordingIntent(ok.sb, "M", false)).toEqual({ ok: true, data: undefined });
    expect(ok.rpc).toHaveBeenCalledWith("set_match_recording_intent", { p_match_id: "M", p_intends: false });
    const frozen = client([], { data: null, error: { code: "P0001", message: "frozen", details: "", hint: "intent_frozen" } });
    const res = await setMatchRecordingIntent(frozen.sb, "M", true);
    expect(!res.ok && res.error.raw?.hint).toBe("intent_frozen");
  });
});
