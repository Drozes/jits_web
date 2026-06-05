/**
 * Return shapes for the gym-owner portal RPCs (epic jits-iwd):
 *   get_gym_roster, get_gym_athlete_detail, get_gym_stats,
 *   get_gym_stats_by_elo_range, get_gym_ladder.
 *
 * The roster + ladder RPCs return SQL TABLE rows (snake_case, reflected in
 * `database.ts`); the three JSONB RPCs (athlete-detail, stats, stats-by-range)
 * return loosely-typed `Json`, so these interfaces document and narrow the
 * shape built by `jsonb_build_object` in the BE migration.
 */

// ---------------------------------------------------------------------------
// get_gym_roster — active members ordered by current_elo DESC
// ---------------------------------------------------------------------------

/** One active member in the gym roster (BE row -> camelCase). */
export interface GymRosterRow {
  athleteId: string;
  displayName: string;
  currentElo: number;
  /** Most-recent completed-match ELO delta (0 when none). */
  eloDelta: number;
  /** Most-recent completed-match timestamp, or null if never matched. */
  lastActive: string | null;
  /** True while the member has fewer than 20 completed matches. */
  isProvisional: boolean;
  wins: number;
  losses: number;
  draws: number;
}

// ---------------------------------------------------------------------------
// get_gym_athlete_detail — single manager-scoped member detail
// ---------------------------------------------------------------------------

/** One point on a member's ELO trend (last 10 ranked deltas, oldest -> newest). */
export interface GymAthleteEloPoint {
  rating_after: number;
  delta: number;
  created_at: string;
}

/** One of a member's last 5 completed matches. */
export interface GymAthleteRecentMatch {
  opponent_name: string;
  /** participant_outcome_enum as text: "win" | "loss" | "draw". */
  result: string;
  /** Submission display name, or null for non-submission finishes. */
  submission: string | null;
  elo_delta: number;
  occurred_at: string;
}

/** Manager-scoped detail for a single gym member. */
export interface GymAthleteDetail {
  currentElo: number;
  peakElo: number;
  wins: number;
  losses: number;
  draws: number;
  /** 0..1 fraction (wins / total_matches). */
  winRate: number;
  eloTrend: GymAthleteEloPoint[];
  lastMatches: GymAthleteRecentMatch[];
}

// ---------------------------------------------------------------------------
// get_gym_stats — gym-wide aggregate dashboard
// ---------------------------------------------------------------------------

/** A submission technique with its count and share of the relevant total. */
export interface GymSubmissionStat {
  name: string;
  count: number;
  /** 0..1 fraction of the winning/losing submission total. */
  pct: number;
}

/** One day of net gym-wide ELO change. */
export interface GymEloTrendPoint {
  day: string;
  net_delta: number;
}

/** Gym-wide aggregate dashboard over a 30d/90d/all window. */
export interface GymStats {
  avgElo: number;
  /** Avg per-member net ELO change inside the window. */
  momentum: number;
  /** 0..1 fraction of completed matches finished by submission. */
  submissionRate: number;
  /** 0..1 fraction of completed matches ending in a draw. */
  drawRate: number;
  /** Avg ELO of participants in drawn matches (Pressure Score context). */
  avgEloOnDraw: number;
  winningSubmissions: GymSubmissionStat[];
  losingSubmissions: GymSubmissionStat[];
  /** Avg finish time in seconds (see BE note: win/loss times are equal). */
  avgWinTime: number;
  avgLossTime: number;
  eloTrend: GymEloTrendPoint[];
}

// ---------------------------------------------------------------------------
// get_gym_stats_by_elo_range — per-ELO-bracket breakdown
// ---------------------------------------------------------------------------

/** Aggregate stats for one fixed ELO bracket. */
export interface GymEloBracketStats {
  /** "1900+" | "1700-1900" | "1500-1700" | "1300-1500". */
  bracket: string;
  athleteCount: number;
  matchCount: number;
  avgElo: number;
  momentum: number;
  submissionRate: number;
  drawRate: number;
  avgWinTime: number;
  avgLossTime: number;
  /** Most-used winning submission name, or null when none. */
  topWinningSub: string | null;
  /** Most-suffered losing submission name, or null when none. */
  topLosingSub: string | null;
}

// ---------------------------------------------------------------------------
// get_gym_ladder — gyms ranked by avg member ELO
// ---------------------------------------------------------------------------

/** One gym's standing on the (optionally city-scoped) gym ladder. */
export interface GymLadderRow {
  gymId: string;
  gymName: string;
  city: string | null;
  athleteCount: number;
  matchCount: number;
  avgElo: number;
  momentum: number;
}
