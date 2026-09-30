import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { type Result, mapPostgrestError } from "./errors";

type Client = SupabaseClient<Database>;

/**
 * One athlete's check of the OTHER athlete's rated weigh-in at face-off
 * (jr_be-ahn.4, table `match_weight_checks`).
 *
 *  - pending: not checked yet.
 *  - confirmed: "Confirm" (or a withdrawn flag).
 *  - flagged: "Doesn't look right". Blocks start_match until the checker
 *    confirms at the subject's (new) weight or withdraws.
 *  - recheck: was confirmed, and the subject re-weighed since. Blocks
 *    start_match until the checker confirms or flags the new weight.
 */
export type WeightCheckStatus = "pending" | "confirmed" | "flagged" | "recheck";

export interface WeightCheck {
  checkerId: string;
  subjectId: string;
  status: WeightCheckStatus;
  weightSeen: number | null;
  flagCount: number;
  flaggedAt: string | null;
  reweighedAt: string | null;
  updatedAt: string | null;
}

/** The shared payload of get_match_weight_checks / check_opponent_weight /
 * reweigh_for_match. */
export interface MatchWeightChecks {
  matchId: string;
  /** feature flag opponent_weight_check_required: pending checks block too. */
  required: boolean;
  /** A check is flagged or awaiting a recheck: the match cannot start. */
  blocked: boolean;
  /** The weight gate only (not the match status). */
  canStart: boolean;
  /** The rated (challenge) weights, lbs, by athlete. */
  weights: Record<string, number | null>;
  checks: WeightCheck[];
}

export type WeightVerdict = "confirm" | "flag" | "withdraw";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const STATUSES: readonly WeightCheckStatus[] = ["pending", "confirmed", "flagged", "recheck"];

/** Shape the RPC payload; null when it is not one. */
export function parseMatchWeightChecks(data: unknown): MatchWeightChecks | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const matchId = str(d.match_id);
  if (!matchId || !Array.isArray(d.checks) || !Array.isArray(d.weights)) return null;
  const weights: Record<string, number | null> = {};
  for (const w of d.weights as Record<string, unknown>[]) {
    const id = str(w?.athlete_id);
    if (id) weights[id] = num(w.weight);
  }
  const checks: WeightCheck[] = [];
  for (const c of d.checks as Record<string, unknown>[]) {
    const checkerId = str(c?.checker_id);
    const subjectId = str(c?.subject_id);
    if (!checkerId || !subjectId) continue;
    const status = STATUSES.includes(c.status as WeightCheckStatus) ? (c.status as WeightCheckStatus) : "pending";
    checks.push({
      checkerId,
      subjectId,
      status,
      weightSeen: num(c.weight_seen),
      flagCount: num(c.flag_count) ?? 0,
      flaggedAt: str(c.flagged_at),
      reweighedAt: str(c.reweighed_at),
      updatedAt: str(c.updated_at),
    });
  }
  const blocked = d.blocked === true;
  return {
    matchId,
    required: d.required === true,
    blocked,
    canStart: d.can_start === true && !blocked,
    weights,
    checks,
  };
}

async function call(
  run: () => PromiseLike<{ data: unknown; error: Parameters<typeof mapPostgrestError>[0] | null }>,
): Promise<Result<MatchWeightChecks>> {
  const { data, error } = await run();
  if (error) return { ok: false, error: mapPostgrestError(error) };
  const parsed = parseMatchWeightChecks(data);
  if (!parsed) return { ok: false, error: { code: "UNKNOWN", message: "Unexpected weight check response." } };
  return { ok: true, data: parsed };
}

/** The face-off weight-check state of a challenge-backed match. */
export function getMatchWeightChecks(supabase: Client, matchId: string): Promise<Result<MatchWeightChecks>> {
  return call(() => supabase.rpc("get_match_weight_checks", { p_match_id: matchId }));
}

/**
 * Record this athlete's check of the opponent's weigh-in. `weightSeen` is
 * the opponent weight on screen: confirm / flag are refused with
 * WEIGHT_CHANGED when it is no longer the opponent's rated weight.
 */
export function checkOpponentWeight(
  supabase: Client,
  matchId: string,
  verdict: WeightVerdict,
  weightSeen?: number | null,
): Promise<Result<MatchWeightChecks>> {
  const args: { p_match_id: string; p_verdict: string; p_weight_seen?: number } = {
    p_match_id: matchId,
    p_verdict: verdict,
  };
  if (weightSeen != null) args.p_weight_seen = weightSeen;
  return call(() => supabase.rpc("check_opponent_weight", args));
}

/** Re-weigh for this match (writes the rated challenge weight only). */
export function reweighForMatch(
  supabase: Client,
  matchId: string,
  weightLbs: number,
): Promise<Result<MatchWeightChecks>> {
  return call(() => supabase.rpc("reweigh_for_match", { p_match_id: matchId, p_weight: weightLbs }));
}

/** This athlete's check of the opponent, and the opponent's check of them. */
export function checksFor(
  state: MatchWeightChecks | null,
  meId: string,
): { mine: WeightCheck | null; theirs: WeightCheck | null } {
  if (!state) return { mine: null, theirs: null };
  return {
    mine: state.checks.find((c) => c.checkerId === meId) ?? null,
    theirs: state.checks.find((c) => c.subjectId === meId) ?? null,
  };
}

/** True when the subject re-weighed after this (flagged) check was raised. */
export function reweighedSinceFlag(check: WeightCheck | null): boolean {
  if (!check || check.status !== "flagged" || !check.reweighedAt) return false;
  if (!check.flaggedAt) return true;
  return Date.parse(check.reweighedAt) > Date.parse(check.flaggedAt);
}
