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
