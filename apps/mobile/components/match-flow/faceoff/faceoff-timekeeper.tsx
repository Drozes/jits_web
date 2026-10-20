import { View } from "react-native";
import { useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import type { RatedWeight } from "@/lib/match-flow/step-seams";

export interface FaceoffTimekeeperProps {
  matchId: string;
  durationSeconds: number;
  /** Where the timekeeper's own exits go (their Leave is a drop-out back to the picker). */
  exitHref: string;
  /**
   * The athletes' rated weights, challenger first (`roles.athletes` order;
   * BE-G3, PM26, `seams.ratedWeights`): what each row shows and what a
   * verdict quotes as `weightSeen` (`checkAthleteWeightAsTimekeeper`). A null
   * weight (the state not read yet, or none on the challenge) offers no
   * verdict, since the server refuses one that does not quote the rated
   * weight. Never the profile weight.
   */
  ratedWeights: readonly RatedWeight[];
}

/**
 * The timekeeper's one combined face-off screen (timekeeper mode spec 4.2,
 * TK-K0 to TK-K12): one row per athlete, the weight verdicts (when the match
 * snapshot asks for them), Start with its reason, the camera gate. The
 * athletes, the Start blockers and the checks come from `useMatchFlow()`
 * (`roles`, `tkState`), the weights from `ratedWeights`; after a successful
 * Start the wizard's reconciler moves to `live`.
 *
 * Stub with its final name and props (timekeeper mode PLAN 3.2, slice M1):
 * the screen is slice M3 (jits-o47s.4). A two-athlete match never renders it.
 * The one thing it already does is hold the timekeeper's match channel, so an
 * athlete's Leave reaches this phone with their name (TK-E1).
 */
export function FaceoffTimekeeper({ matchId }: FaceoffTimekeeperProps) {
  // The timekeeper's one match channel on the face-off. M3 adds its sends and
  // handlers to THIS call: `supabase.channel` hands back the channel already
  // open on the topic, so a second hook here would subscribe it twice. In
  // timekeeper mode `useStepMatchSync` turns a received `match_cancelled`
  // into a re-read that knows who left (M-R8; TK-E1).
  useStepMatchSync({ matchId });
  return <View testID="faceoff-timekeeper" />;
}
