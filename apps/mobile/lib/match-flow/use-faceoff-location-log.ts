/**
 * The face-off location re-poll (jr_be 016 addendum, live location fixes
 * 4.6): when an athlete enters the face-off for a match, one reading, only
 * if foreground location permission is ALREADY granted, logged as
 * `match_start` for that match. Telemetry only, whatever the
 * `match_location_required` value (decision D9):
 *  - never asks for permission and never shows anything;
 *  - never awaited by, and never blocking, `start_match`, the ready step or
 *    the weight step (it runs beside them, fire and forget);
 *  - once per match per mount (the server dedups per athlete per match too).
 */
import * as React from "react";
import type { LocationEventOutcome } from "@jits/shared/api/location";
import type { LocationReading } from "@jits/shared/api/invites";
import { GOOD_ACCURACY_M, readLocationOnce } from "@/lib/invites/location";
import { logMatchStartLocation } from "@/lib/arena/location-telemetry";

/** One silent reading and its `match_start` outcome. Never throws. */
export async function faceoffLocationOutcome(): Promise<{
  outcome: LocationEventOutcome;
  reading: LocationReading | null;
}> {
  try {
    const loc = await readLocationOnce({ ask: false, fast: true });
    if (loc.status === "denied") return { outcome: "permission_denied", reading: null };
    if (loc.status === "unavailable") {
      return { outcome: loc.reason === "timeout" ? "timeout" : "unavailable", reading: null };
    }
    // Coarser than the server's 100 m: still sent, so the distance shows how far off.
    const coarse = loc.reducedPrecision || loc.reading.accuracyM > GOOD_ACCURACY_M;
    return { outcome: coarse ? "accuracy_too_low" : "ok", reading: loc.reading };
  } catch {
    return { outcome: "unavailable", reading: null };
  }
}

/** `active`: the face-off (weight or ready step) is showing for `matchId`. */
export function useFaceoffLocationLog(matchId: string, active: boolean): void {
  const loggedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!active || !matchId || loggedRef.current === matchId) return;
    loggedRef.current = matchId;
    void faceoffLocationOutcome()
      .then(({ outcome, reading }) => logMatchStartLocation(matchId, outcome, reading))
      .catch(() => undefined);
  }, [matchId, active]);
}
