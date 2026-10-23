import type { MatchRoles } from "./match-roles";
import { useMatchWeights, type MatchWeights } from "./use-match-weights";
import { useMatchWeightChecks, type WeightChecksHandle } from "./use-match-weight-checks";

interface WizardWeightsParams {
  matchId: string;
  challengeId: string | null | undefined;
  /** The signed-in athlete: which side of the challenge's weights is theirs. */
  viewerId: string;
  /** Null until the match is loaded, and for a viewer who is not in it. */
  roles: MatchRoles | null;
  /** Read the face-off weight checks (jr_be-ahn.4): a challenge-backed match on the weight or ready step. */
  checksEnabled: boolean;
}

export interface WizardWeights {
  /** The weights the face-off and the countdown show and price. */
  weights: MatchWeights;
  weightChecks: WeightChecksHandle;
}

/**
 * The weights this match is rated on (the challenge's), for the face-off and
 * the countdown. The weight checks carry them too, read fresh, so once both
 * athletes are in a check read a re-weigh on either phone shows here without
 * a reload. Until the challenge is read, the profile weights stand in.
 */
export function useWizardWeights({ matchId, challengeId, viewerId, roles, checksEnabled }: WizardWeightsParams): WizardWeights {
  const challengeWeights = useMatchWeights(
    challengeId,
    viewerId,
    roles?.me?.weightLbs ?? null,
    roles?.opponent?.weightLbs ?? null,
  );
  const weightChecks = useMatchWeightChecks(matchId, checksEnabled);
  const checked = weightChecks.state?.weights;
  const meId = roles?.me?.athleteId;
  const opponentId = roles?.opponent?.athleteId;
  const weights =
    checked && meId && opponentId && meId in checked && opponentId in checked
      ? { mine: checked[meId] ?? null, theirs: checked[opponentId] ?? null, rated: true }
      : challengeWeights;
  return { weights, weightChecks };
}
