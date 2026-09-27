/**
 * Match-flow redesign (F1) wrappers: `getMatchRankChange` (jr_be B6) and
 * `updateAthleteWeight` (the face-off weigh-in edit). Both must degrade
 * quietly: an older backend without the RPC is a normal case, not a crash.
 */
import { describe, it, expect, vi } from "vitest";
import { getMatchRankChange, parseMatchRankChange } from "./match-rank-change";
import { updateAthleteWeight, isValidAthleteWeight } from "./athlete-weight";
import { mapPostgrestError } from "./errors";
import { getMatchChallengeWeights, weightsFor } from "./match-weights";
import { buildShareUrl } from "../utils/share";

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
        direction: "up",
        passed_total: 7,
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
        direction: "up",
        passed: [
          { athlete_id: "a1", display_name: "J. Silva" },
          { athlete_id: "a2", display_name: "An athlete" },
          { athlete_id: "a3", display_name: "C" },
        ],
        passed_total: 7,
      },
    });
  });

  it("keeps null ranks for an unranked athlete", () => {
    expect(parseMatchRankChange({ rank_before: null, rank_after: 0, passed: null, direction: "sideways" })).toEqual({
      rank_before: null,
      rank_after: null,
      direction: "none",
      passed: [],
      passed_total: 0,
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

describe("match challenge weights", () => {
  function client(result: { data?: unknown; error?: unknown }) {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as never, from, select, eq };
  }

  it("reads the challenge's stamped weights", async () => {
    const m = client({ data: { challenger_id: "a", opponent_id: "b", challenger_weight: 170, opponent_weight: null } });
    const w = await getMatchChallengeWeights(m.client, "c1");
    expect(m.from).toHaveBeenCalledWith("challenges");
    expect(m.eq).toHaveBeenCalledWith("id", "c1");
    expect(w).toEqual({ challengerId: "a", opponentId: "b", challengerWeight: 170, opponentWeight: null });
    expect(weightsFor(w, "a")).toEqual({ mine: 170, theirs: null });
    expect(weightsFor(w, "b")).toEqual({ mine: null, theirs: 170 });
    expect(weightsFor(w, "zz")).toBeNull();
  });

  it("is null on an error", async () => {
    expect(await getMatchChallengeWeights(client({ error: { message: "x" } }).client, "c1")).toBeNull();
  });
});

describe("match share URL", () => {
  it("links the live web app's match page (elorated.com is not live, jits-x1t2)", () => {
    expect(buildShareUrl("match", "M1")).toBe("https://jitsweb.vercel.app/matches/M1");
    expect(buildShareUrl("athlete", "A1")).toBe("https://elorated.com/athlete/A1");
  });
});
