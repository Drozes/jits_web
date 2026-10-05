import { describe, expect, it, vi } from "vitest";
import { getMatchVideoStatus, parseMatchVideoStatus } from "./match-video-status";

const MATCH = "11111111-1111-4111-8111-111111111111";

function doc(over: Record<string, unknown> = {}) {
  return {
    match_id: MATCH,
    match_status: "completed",
    match_ended_at: "2026-10-05T20:00:00Z",
    server_now: "2026-10-05T20:05:00Z",
    phase: "collecting",
    phase_reason: "awaiting_first_angle",
    wait_deadline_at: null,
    wait_extended: null,
    angles_expected: 2,
    angles_pending: 2,
    angles_ready: 0,
    angles_used: null,
    angles_used_count: null,
    angles: [
      { recorder_athlete_id: "a", recorder_name_short: "M. Reyes", role: "competitor", state: "uploading", progress_pct: 42, is_primary: false, used: null, video_id: "v1" },
      { recorder_athlete_id: "b", recorder_name_short: "D. Okafor", role: "competitor", state: "teleporting" },
    ],
    reels: [{ athlete_id: "a", state: "weird" }],
    event_seq: 9,
    ...over,
  };
}

describe("parseMatchVideoStatus", () => {
  it("keeps known fields and drops an angle state it does not know", () => {
    const s = parseMatchVideoStatus(doc())!;
    expect(s.phase).toBe("collecting");
    expect(s.angles).toHaveLength(1);
    expect(s.angles[0]).toMatchObject({ state: "uploading", progress_pct: 42, video_id: "v1", is_primary: false });
    // Unknown reel state reads as not started, never as ready.
    expect(s.reels[0].state).toBe("not_started");
    expect(s.wait_extended).toBeNull();
    expect(s.angles_used).toBeNull();
  });

  it("refuses an unknown phase and non-objects", () => {
    expect(parseMatchVideoStatus(doc({ phase: "melting" }))).toBeNull();
    expect(parseMatchVideoStatus(null)).toBeNull();
    expect(parseMatchVideoStatus("x")).toBeNull();
  });
});

describe("getMatchVideoStatus", () => {
  it("answers not found for a malformed id without a round trip", async () => {
    const rpc = vi.fn();
    const r = await getMatchVideoStatus({ rpc } as never, "nope");
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps not_participant and never treats an error as an empty status", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", hint: "not_participant", message: "x" } });
    const r = await getMatchVideoStatus({ rpc } as never, MATCH);
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_PARTICIPANT" } });
    const rpc2 = vi.fn().mockResolvedValue({ data: null, error: { code: "08000", message: "network" } });
    expect((await getMatchVideoStatus({ rpc: rpc2 } as never, MATCH)).ok).toBe(false);
  });

  it("returns the parsed document", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: doc(), error: null });
    const r = await getMatchVideoStatus({ rpc } as never, MATCH);
    expect(rpc).toHaveBeenCalledWith("get_match_video_status", { p_match_id: MATCH });
    expect(r.ok && r.data.event_seq).toBe(9);
  });

  it("never throws", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("boom"));
    expect((await getMatchVideoStatus({ rpc } as never, MATCH)).ok).toBe(false);
  });
});
