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
  for (const op of ["insert", "update", "select", "eq", "is"]) {
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
      data: {
        id: "V1",
        status: "uploading",
        storagePath: "M/A/1.mp4",
        failureCode: null,
        resumed: false,
        outcome: "reserved",
        previousStoragePath: null,
      },
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

  const DUP = { data: null, error: { code: "23505", message: "dup", details: "", hint: "" } };

  it("on 23505 takes an 'uploading' row at another key over, guarded on the key it read (no second row)", async () => {
    const { sb, calls } = client([
      DUP,
      { data: { ...ROW, id: "OLD", storage_path: "M/A/0.mp4" }, error: null },
      { data: { ...ROW, id: "OLD" }, error: null },
    ]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok && res.data).toMatchObject({
      id: "OLD",
      resumed: true,
      outcome: "reserved",
      previousStoragePath: "M/A/0.mp4",
    });
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
      ["id", "OLD"],
      ["storage_path", "M/A/0.mp4"],
      ["status", "uploading"],
    ]);
  });

  it("on 23505 takes an ABANDONED row over (free re-path), guarded on the abandon code", async () => {
    const { sb, calls } = client([
      DUP,
      { data: { ...ROW, id: "OLD", status: "failed", failure_code: "upload_abandoned", storage_path: "M/A/0.mp4" }, error: null },
      { data: { ...ROW, id: "OLD" }, error: null },
    ]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok && res.data.outcome).toBe("reserved");
    expect(calls.some((c) => c.op === "update")).toBe(true);
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["status", "failed"]);
    expect(eqs).toContainEqual(["failure_code", "upload_abandoned"]);
  });

  it("R2-M1: a row the trigger flipped to 'ready' between the read and the PATCH is never taken over; the retry defers", async () => {
    // Attempt 1: the read says 'uploading', but by the PATCH the row is
    // 'ready' at the same key, so the status-guarded PATCH matches nothing.
    const first = client([
      DUP,
      { data: { ...ROW, id: "R", status: "uploading", storage_path: "M/A/0.mp4" }, error: null },
      { data: null, error: null },
    ]);
    const r1 = await reserveMatchVideoUpload(first.sb, RESERVE);
    expect(r1.ok).toBe(false);
    expect(first.calls.filter((c) => c.op === "eq").map((c) => c.args)).toContainEqual(["status", "uploading"]);
    // The caller's retry re-reads: now 'ready' (it has bytes), so it defers
    // with no takeover and no key to delete.
    const retry = client([DUP, { data: { ...ROW, id: "R", status: "ready", storage_path: "M/A/0.mp4" }, error: null }]);
    const r2 = await reserveMatchVideoUpload(retry.sb, RESERVE);
    expect(r2.ok && r2.data).toMatchObject({ outcome: "deferred", id: "R", previousStoragePath: null });
    expect(retry.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("B1: on 23505 NEVER re-paths a row that already has bytes; it defers", async () => {
    for (const existing of [
      { status: "ready", failure_code: null },
      { status: "analyzed", failure_code: null },
      { status: "failed", failure_code: null },
      { status: "deleted", failure_code: null },
    ]) {
      const { sb, calls } = client([DUP, { data: { ...ROW, id: "GOOD", storage_path: "M/A/0.mp4", ...existing }, error: null }]);
      const res = await reserveMatchVideoUpload(sb, RESERVE);
      expect(res.ok && res.data).toMatchObject({ id: "GOOD", outcome: "deferred", storagePath: "M/A/0.mp4", status: existing.status });
      expect(calls.some((c) => c.op === "update")).toBe(false);
    }
  });

  it("on 23505 returns our own row untouched when it is already at our key (kill after the INSERT)", async () => {
    const { sb, calls } = client([DUP, { data: { ...ROW, id: "MINE", status: "ready" }, error: null }]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok && res.data).toMatchObject({ id: "MINE", status: "ready", outcome: "reserved", previousStoragePath: null });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("defers when the existing row cannot be read", async () => {
    const { sb } = client([DUP, { data: null, error: null }]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok && res.data.outcome).toBe("deferred");
  });

  it("reports a transient failure when the row changed between the read and the takeover", async () => {
    const { sb } = client([DUP, { data: { ...ROW, id: "OLD", storage_path: "M/A/0.mp4" }, error: null }, { data: null, error: null }]);
    const res = await reserveMatchVideoUpload(sb, RESERVE);
    expect(res.ok).toBe(false);
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
      { data: { ...ROW, id: "OLD", storage_path: "M/A/0.mp4" }, error: null },
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

  it("never revives a deleted row: 'deleted', whether the PATCH or the read-back finds it", async () => {
    const patched = client([{ data: { ...ROW, status: "deleted" }, error: null }]);
    expect(await finalizeMatchVideoUpload(patched.sb, { videoId: "V1", storagePath: "M/A/1.mp4" })).toEqual({
      ok: true,
      data: { outcome: "deleted" },
    });
    const read = client([{ data: null, error: null }, { data: { ...ROW, status: "deleted" }, error: null }]);
    expect(await finalizeMatchVideoUpload(read.sb, { videoId: "V1", storagePath: "M/A/1.mp4" })).toEqual({
      ok: true,
      data: { outcome: "deleted" },
    });
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
