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

/** Match status lifecycle */
export const MATCH_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  DISPUTED: "disputed",
} as const;

export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

/** Match result type */
export const MATCH_RESULT = {
  SUBMISSION: "submission",
  DRAW: "draw",
} as const;

export type MatchResult = (typeof MATCH_RESULT)[keyof typeof MATCH_RESULT];

/**
 * "The Climb" launch reveal — timing + sequence (single source of truth so the
 * mobile overlay, and a future web intro, stay in lockstep). All values in ms.
 * Colors are NOT here; they come from the platform token files (Void palette).
 * Easing is the brand ease-out curve (no overshoot), shared as bezier control
 * points so each platform can build its own easing fn.
 */
export const SPLASH_REVEAL = {
  /** Fallback rating when no cached ELO exists on device (pre-auth cold start). */
  DEFAULT_ELO: 1481,

  /** Brand ease-out, mirrors --easing-default in the web design tokens. */
  EASING_BEZIER: [0.22, 1, 0.36, 1] as const,

  /** Bars rise one-by-one, left → right, like a rating climbing. */
  BAR_COUNT: 5,
  BAR_FIRST_DELAY_MS: 100,
  BAR_STAGGER_MS: 90,
  BAR_RISE_MS: 420,

  /** Gold "breakthrough" peak pops after the tallest bar lands. */
  PEAK_DELAY_MS: 700,
  PEAK_POP_MS: 340,

  /** ELO number fades in, then rolls up (odometer) alongside the bars. */
  NUMBER_DELAY_MS: 250,
  NUMBER_FADE_MS: 300,
  NUMBER_ROLL_MS: 900,

  /** ELO RATED wordmark fades/locks in (hard stop, no bounce). */
  WORDMARK_DELAY_MS: 950,
  WORDMARK_MS: 450,

  /** Signal-Red accent rule wipes left → right under the wordmark. */
  RULE_DELAY_MS: 1180,
  RULE_MS: 500,

  /** "EARN YOUR RANK" tagline fades in just after the rule starts. */
  TAG_DELAY_AFTER_RULE_MS: 120,
  TAG_MS: 400,

  /** Beat to hold the locked frame before dismissing to the app. */
  HOLD_AFTER_MS: 260,

  /** Reduced-motion: show the resting frame, hold briefly, dismiss. No motion. */
  REDUCED_MOTION_HOLD_MS: 260,

  /** Total time from mount to onDone() in the full-motion path. */
  /** = RULE_DELAY_MS (1180) + RULE_MS (500) + HOLD_AFTER_MS (260). */
  TOTAL_MS: 1940,
} as const;
