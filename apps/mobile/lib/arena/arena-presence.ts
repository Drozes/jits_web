/**
 * The `arena` reading sent before an Arena match start while
 * `match_location_required` is on (contract-location-flag 6): the server's
 * proximity gate on `start_match_from_challenge` then has a fresh reading
 * for this athlete (the other one is covered by their `go_live` refresh).
 * Best effort and never throws: with no reading the server answers
 * `proximity_required`, which the caller explains.
 */
import { reportArenaPresence } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";

export async function reportArenaReading(challengeId: string, opts: { ask: boolean }): Promise<void> {
  const loc = await readLocationOnce({ ask: opts.ask });
  if (loc.status !== "ok") return;
  const res = await reportArenaPresence(supabase, loc.reading, challengeId);
  if (!res.ok) console.warn("[location] arena reading failed:", res.error.hint, res.error.message);
}

/** A `start_match_from_challenge` refusal from the proximity gate. */
export function isProximityRefusal(code: string | undefined): boolean {
  return code === "PROXIMITY_REQUIRED" || code === "PROXIMITY_FAILED";
}
