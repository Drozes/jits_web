/** Match type: casual (no ELO) or ranked (ELO at stake) */
export const MATCH_TYPE = {
  CASUAL: "casual",
  RANKED: "ranked",
} as const;

export type MatchType = (typeof MATCH_TYPE)[keyof typeof MATCH_TYPE];

/** Challenge status values */
export const CHALLENGE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type ChallengeStatus =
  (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

/** Match outcome for a participant */
export const MATCH_OUTCOME = {
  WIN: "win",
  LOSS: "loss",
  DRAW: "draw",
} as const;

export type MatchOutcome =
  (typeof MATCH_OUTCOME)[keyof typeof MATCH_OUTCOME];

/** Athlete status */
export const ATHLETE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type AthleteStatus =
  (typeof ATHLETE_STATUS)[keyof typeof ATHLETE_STATUS];
