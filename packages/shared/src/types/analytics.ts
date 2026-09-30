/** Weekly match activity for activity charts */
export interface WeeklyActivity {
  week: string;
  matches: number;
  wins: number;
}

/** Submission type breakdown for pie/bar displays */
export interface SubmissionBreakdown {
  type: string;
  count: number;
  asWinner: number;
  asLoser: number;
}

/** Which side of a submission get_submission_breakdown counts */
export type SubmissionOutcome = "wins" | "losses";

/** One row of get_submission_breakdown: a submission type and its count */
export interface SubmissionOutcomeCount {
  code: string;
  name: string;
  count: number;
}

/** Win/loss/draw record grouped by opponent weight division */
export interface WeightClassStats {
  division: string;
  wins: number;
  losses: number;
  draws: number;
}

/** Aggregate stats for gym managers */
export interface GymManagerStats {
  totalSessions: number;
  totalParticipants: number;
  totalMatches: number;
  activeMemberCount: number;
}
