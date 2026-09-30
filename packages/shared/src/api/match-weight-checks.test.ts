/**
 * Face-off weight-check wrappers (jr_be-ahn.4): get_match_weight_checks,
 * check_opponent_weight, reweigh_for_match, and the payload parser.
 */
import { describe, it, expect, vi } from "vitest";
import {
  checkOpponentWeight,
  checksFor,
  getMatchWeightChecks,
  parseMatchWeightChecks,
  reweighForMatch,
  reweighedSinceFlag,
} from "./match-weight-checks";

const PAYLOAD = {
  match_id: "M1",
  required: false,
  blocked: true,
  can_start: false,
  weights: [
    { athlete_id: "a", weight: 170 },
    { athlete_id: "b", weight: "168.50" },
  ],
  checks: [
    { checker_id: "a", subject_id: "b", status: "flagged", weight_seen: 168.5, flag_count: 1, flagged_at: "2026-09-30T10:00:00Z", reweighed_at: null, updated_at: "2026-09-30T10:00:00Z" },
    { checker_id: "b", subject_id: "a", status: "recheck", weight_seen: null, flag_count: 0, updated_at: null },
  ],
};

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as never, rpc };
}

describe("parseMatchWeightChecks", () => {
  it("shapes the payload (numeric strings included)", () => {
    const s = parseMatchWeightChecks(PAYLOAD)!;
    expect(s.blocked).toBe(true);
    expect(s.canStart).toBe(false);
    expect(s.weights).toEqual({ a: 170, b: 168.5 });
    expect(s.checks[0]).toMatchObject({ checkerId: "a", subjectId: "b", status: "flagged", weightSeen: 168.5, flagCount: 1 });
    expect(s.checks[1]).toMatchObject({ status: "recheck", flaggedAt: null, reweighedAt: null });
    expect(checksFor(s, "a").mine?.status).toBe("flagged");
    expect(checksFor(s, "a").theirs?.status).toBe("recheck");
  });

  it("never reports can_start while blocked, and rejects a non-payload", () => {
    expect(parseMatchWeightChecks({ ...PAYLOAD, can_start: true })!.canStart).toBe(false);
    expect(parseMatchWeightChecks(null)).toBeNull();
    expect(parseMatchWeightChecks({ match_id: "M1" })).toBeNull();
  });

  it("an unknown status reads as pending", () => {
    const s = parseMatchWeightChecks({ ...PAYLOAD, checks: [{ checker_id: "a", subject_id: "b", status: "weird" }] })!;
    expect(s.checks[0].status).toBe("pending");
  });
});

describe("reweighedSinceFlag", () => {
  const flagged = { checkerId: "a", subjectId: "b", status: "flagged" as const, weightSeen: 1, flagCount: 1, updatedAt: null };
  it("true only when the reweigh is newer than the flag", () => {
    expect(reweighedSinceFlag({ ...flagged, flaggedAt: "2026-09-30T10:00:00Z", reweighedAt: null })).toBe(false);
    expect(reweighedSinceFlag({ ...flagged, flaggedAt: "2026-09-30T10:00:00Z", reweighedAt: "2026-09-30T10:01:00Z" })).toBe(true);
    expect(reweighedSinceFlag({ ...flagged, flaggedAt: "2026-09-30T10:02:00Z", reweighedAt: "2026-09-30T10:01:00Z" })).toBe(false);
    expect(reweighedSinceFlag({ ...flagged, status: "confirmed", flaggedAt: null, reweighedAt: "2026-09-30T10:01:00Z" })).toBe(false);
  });
});

describe("RPC wrappers", () => {
  it("get_match_weight_checks", async () => {
    const { client, rpc } = rpcClient({ data: PAYLOAD });
    const res = await getMatchWeightChecks(client, "M1");
    expect(rpc).toHaveBeenCalledWith("get_match_weight_checks", { p_match_id: "M1" });
    expect(res.ok && res.data.matchId).toBe("M1");
  });

  it("check_opponent_weight sends the weight seen for confirm / flag, none for withdraw", async () => {
    const { client, rpc } = rpcClient({ data: PAYLOAD });
    await checkOpponentWeight(client, "M1", "confirm", 168.5);
    expect(rpc).toHaveBeenLastCalledWith("check_opponent_weight", { p_match_id: "M1", p_verdict: "confirm", p_weight_seen: 168.5 });
    await checkOpponentWeight(client, "M1", "withdraw");
    expect(rpc).toHaveBeenLastCalledWith("check_opponent_weight", { p_match_id: "M1", p_verdict: "withdraw" });
  });

  it("maps weight_changed and weight_flagged hints", async () => {
    const changed = rpcClient({ error: { code: "P0001", hint: "weight_changed", message: "x" } });
    const r1 = await checkOpponentWeight(changed.client, "M1", "flag", 1);
    expect(!r1.ok && r1.error.code).toBe("WEIGHT_CHANGED");
    const invalid = rpcClient({ error: { code: "P0001", hint: "invalid_weight", message: "x" } });
    const r2 = await reweighForMatch(invalid.client, "M1", 0);
    expect(!r2.ok && r2.error.code).toBe("INVALID_WEIGHT");
  });

  it("reweigh_for_match", async () => {
    const { client, rpc } = rpcClient({ data: PAYLOAD });
    await reweighForMatch(client, "M1", 171.4);
    expect(rpc).toHaveBeenCalledWith("reweigh_for_match", { p_match_id: "M1", p_weight: 171.4 });
  });
});
