import { describe, expect, it, vi } from "vitest";
import { getEloHistory, getEloHistoryResult, getMatchHistory, getSubmissionBreakdownRpc } from "./queries";

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as never, rpc };
}

const SINCE = "2026-09-01T00:00:00.000Z";

describe("windowed history wrappers (jr_be-ahn.8 contract)", () => {
  it("getMatchHistory omits p_since for all time and passes it when given", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    await getMatchHistory(supabase, "a1");
    await getMatchHistory(supabase, "a1", null);
    await getMatchHistory(supabase, "a1", SINCE);
    expect(rpc.mock.calls).toEqual([
      ["get_match_history", { p_athlete_id: "a1" }],
      ["get_match_history", { p_athlete_id: "a1" }],
      ["get_match_history", { p_athlete_id: "a1", p_since: SINCE }],
    ]);
  });

  it("getEloHistory omits p_since for all time and passes it when given", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    await getEloHistory(supabase, "a1");
    await getEloHistory(supabase, "a1", SINCE);
    expect(rpc.mock.calls).toEqual([
      ["get_elo_history", { p_athlete_id: "a1" }],
      ["get_elo_history", { p_athlete_id: "a1", p_since: SINCE }],
    ]);
  });

  it("getEloHistoryResult keeps an empty history apart from a failed read", async () => {
    const empty = client({ data: [], error: null });
    expect(await getEloHistoryResult(empty.supabase, "a1")).toEqual({ ok: true, data: [] });
    expect(empty.rpc).toHaveBeenCalledWith("get_elo_history", { p_athlete_id: "a1" });
    const failed = client({ data: null, error: { code: "P0001", message: "boom", details: "", hint: "" } });
    const r = await getEloHistoryResult(failed.supabase, "a1", SINCE);
    expect(r.ok).toBe(false);
    expect(failed.rpc).toHaveBeenCalledWith("get_elo_history", { p_athlete_id: "a1", p_since: SINCE });
  });
});

describe("getSubmissionBreakdownRpc", () => {
  it("defaults to wins, all time, and maps rows (bigint count as number)", async () => {
    const { supabase, rpc } = client({
      data: [
        { submission_type_code: "armbar", submission_type_display_name: "Armbar", count: "4" },
        { submission_type_code: "rnc", submission_type_display_name: "Rear Naked Choke", count: 3 },
      ],
      error: null,
    });
    const rows = await getSubmissionBreakdownRpc(supabase, "a1");
    expect(rpc).toHaveBeenCalledWith("get_submission_breakdown", {
      p_athlete_id: "a1",
      p_outcome: "wins",
    });
    expect(rows).toEqual([
      { code: "armbar", name: "Armbar", count: 4 },
      { code: "rnc", name: "Rear Naked Choke", count: 3 },
    ]);
  });

  it("passes losses and p_since", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    await getSubmissionBreakdownRpc(supabase, "a1", { since: SINCE, outcome: "losses" });
    expect(rpc).toHaveBeenCalledWith("get_submission_breakdown", {
      p_athlete_id: "a1",
      p_outcome: "losses",
      p_since: SINCE,
    });
  });

  it("throws on an RPC error so a failed load is not shown as empty", async () => {
    const { supabase } = client({ data: null, error: { message: "boom" } });
    await expect(getSubmissionBreakdownRpc(supabase, "a1")).rejects.toThrow("boom");
  });
});
