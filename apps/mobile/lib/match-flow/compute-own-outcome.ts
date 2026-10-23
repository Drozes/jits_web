import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { AthleteOutcome, MatchAthleteView } from "./match-roles";

/**
 * This athlete's outcome for the verdict: the one stamped on their
 * participant row, else the one the result broadcast implies (the row
 * catches up on the next read), else null.
 */
export function computeOwnOutcome(
  me: Pick<MatchAthleteView, "athleteId" | "outcome">,
  resultData: BroadcastResult | null,
): AthleteOutcome | null {
  if (me.outcome) return me.outcome;
  if (!resultData) return null;
  if (resultData.result === "draw") return "draw";
  return resultData.winnerId === me.athleteId ? "win" : "loss";
}
