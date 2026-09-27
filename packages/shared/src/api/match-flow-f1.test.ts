/**
 * Match-flow redesign (F1) wrappers: `getMatchRankChange` (jr_be B6) and
 * `updateAthleteWeight` (the face-off weigh-in edit). Both must degrade
 * quietly: an older backend without the RPC is a normal case, not a crash.
 */
import { describe, it, expect, vi } from "vitest";
import { getMatchRankChange, parseMatchRankChange } from "./match-rank-change";
import { updateAthleteWeight, isValidAthleteWeight } from "./athlete-weight";
import { mapPostgrestError } from "./errors";

function rpcClient(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  return { client: { rpc } as never, rpc };
}

describe("getMatchRankChange", () => {
  it("calls get_match_rank_change with the match id and shapes the payload", async () => {
    const { client, rpc } = rpcClient({
      data: {
        rank_before: 23,
        rank_after: 19,
        passed: [
          { athlete_id: "a1", display_name: "J. Silva" },
          { athlete_id: "a2", display_name: "  " },
          { nope: true },
          { athlete_id: "a3", display_name: "C" },
          { athlete_id: "a4", display_name: "D" },
        ],
      },
    });
    const res = await getMatchRankChange(client, "m-1");
    expect(rpc).toHaveBeenCalledWith("get_match_rank_change", { p_match_id: "m-1" });
    expect(res).toEqual({
      ok: true,
      data: {
        rank_before: 23,
        rank_after: 19,
        passed: [
          { athlete_id: "a1", display_name: "J. Silva" },
          { athlete_id: "a2", display_name: "An athlete" },
          { athlete_id: "a3", display_name: "C" },
        ],
      },
    });
  });

  it("keeps null ranks for an unranked athlete", () => {
    expect(parseMatchRankChange({ rank_before: null, rank_after: 0, passed: null })).toEqual({
      rank_before: null,
      rank_after: null,
      passed: [],
    });
  });

  it("is ok:false when the RPC is missing on an older backend", async () => {
    const error = { code: "PGRST202", message: "Could not find the function", details: "", hint: "" };
    const { client } = rpcClient({ error });
    const res = await getMatchRankChange(client, "m-1");
    expect(res).toEqual({ ok: false, error: mapPostgrestError(error as never) });
  });

  it("is ok:false on a null payload or a thrown transport error", async () => {
    expect((await getMatchRankChange(rpcClient({ data: null }).client, "m")).ok).toBe(false);
    expect((await getMatchRankChange(rpcClient(new Error("offline")).client, "m")).ok).toBe(false);
  });
});

describe("updateAthleteWeight", () => {
  function fromClient(error: unknown = null) {
    const eq = vi.fn(() => Promise.resolve({ error }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return { client: { from } as never, from, update, eq };
  }

  it("writes current_weight in lbs on the athlete's own row, rounded to 0.1", async () => {
    const m = fromClient();
    const res = await updateAthleteWeight(m.client, "me", 171.26);
    expect(m.from).toHaveBeenCalledWith("athletes");
    expect(m.update).toHaveBeenCalledWith({ current_weight: 171.3 });
    expect(m.eq).toHaveBeenCalledWith("id", "me");
    expect(res).toEqual({ ok: true, data: { weight: 171.3 } });
  });

  it("refuses an out-of-range weight without a round trip", async () => {
    const m = fromClient();
    const res = await updateAthleteWeight(m.client, "me", 12);
    expect(res.ok).toBe(false);
    expect(m.from).not.toHaveBeenCalled();
    expect(isValidAthleteWeight(Number.NaN)).toBe(false);
    expect(isValidAthleteWeight(400)).toBe(true);
  });

  it("maps a database error", async () => {
    const m = fromClient({ code: "42501", message: "denied", details: "", hint: "" });
    const res = await updateAthleteWeight(m.client, "me", 170);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("RLS_VIOLATION");
  });
});

describe("dispute window hint", () => {
  it("maps dispute_window_closed to its own code", () => {
    const e = mapPostgrestError({ code: "P0001", message: "x", details: "", hint: "dispute_window_closed" } as never);
    expect(e.code).toBe("DISPUTE_WINDOW_CLOSED");
  });
});
