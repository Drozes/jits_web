/**
 * The `arena` reading sent before an Arena match start while
 * `match_location_required` is on (contract-location-flag 6): the server's
 * proximity gate on `start_match_from_challenge` then has a fresh reading
 * for this athlete (the other one is covered by their `go_live` refresh).
 * Best effort and never throws: with no reading the server answers
 * `proximity_required`, which the caller explains.
 */
import { reportArenaPresence } from "@jits/shared/api/location";
import type { DomainError } from "@jits/shared/api/errors";
import { arenaProximityCopy, type ArenaChallengeRole } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";

export async function reportArenaReading(challengeId: string, opts: { ask: boolean }): Promise<void> {
  const loc = await readLocationOnce({ ask: opts.ask });
  if (loc.status !== "ok") return;
  // The server answers only `{ ok:true, verdict:'recorded' }` for an arena
  // reading (no verdict or distance, for privacy), or `{ ok:false, code }`
  // (accuracy, an implausible jump): nothing here reads either. The start's
  // own proximity gate is the only verdict.
  const res = await reportArenaPresence(supabase, loc.reading, challengeId);
  if (!res.ok) console.warn("[location] arena reading failed:", res.error.hint, res.error.message);
  else if (!res.data.ok) console.warn("[location] arena reading refused:", res.data.code);
}

/** A `start_match_from_challenge` refusal from the proximity gate. */
export function isProximityRefusal(code: string | undefined): boolean {
  return code === "PROXIMITY_REQUIRED" || code === "PROXIMITY_FAILED";
}

/**
 * What a proximity refusal says, by whose reading the server is missing:
 * `proximity_required` carries `challenger` | `opponent` | `both` in the
 * exception DETAIL (`error.raw.details`).
 */
export function proximityRefusalCopy(
  error: DomainError,
  selfRole: ArenaChallengeRole,
  opponentName: string | null | undefined,
): string {
  return arenaProximityCopy({
    hint: error.code === "PROXIMITY_FAILED" ? "proximity_failed" : "proximity_required",
    detail: error.raw?.details ?? null,
    selfRole,
    opponentName,
  });
}
