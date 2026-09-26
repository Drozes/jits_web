/**
 * Database oracles: ground truth read as `postgres` (bypasses RLS, so the
 * oracle sees what really happened, not what one athlete may see).
 */
import { lit, queryJson } from "../lib/psql";
import { pollUntil } from "../lib/util";

export interface ChallengeDb {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  match_type: string;
  created_at: string;
  expires_at: string;
}

export interface MatchDb {
  id: string;
  challenge_id: string | null;
  status: string;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
  paused_at: string | null;
  total_paused_duration: number;
}

export interface ParticipantDb {
  athlete_id: string;
  outcome: string | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_delta: number | null;
  weight_division_gap: number | null;
}

export interface SubmissionDb {
  winner_id: string;
  loser_id: string;
  code: string;
  finish_time_seconds: number | null;
}

export interface AthleteDb {
  id: string;
  current_elo: number;
  current_weight: number;
  looking_for_ranked: boolean;
  status: string;
}

export const db = {
  challenge: async (id: string) =>
    (await queryJson<ChallengeDb>(`select * from public.challenges where id = ${lit(id)}`))[0] ?? null,

  /** Newest challenge from `challenger` to `opponent` created after `since`. */
  latestChallenge: async (challenger: string, opponent: string, since: string) =>
    (
      await queryJson<ChallengeDb>(
        `select * from public.challenges where challenger_id = ${lit(challenger)} and opponent_id = ${lit(opponent)}
         and created_at >= ${lit(since)}::timestamptz order by created_at desc limit 1`,
      )
    )[0] ?? null,

  matchesForChallenge: (challengeId: string) =>
    queryJson<MatchDb>(`select * from public.matches where challenge_id = ${lit(challengeId)}`),

  match: async (id: string) =>
    (await queryJson<MatchDb>(`select * from public.matches where id = ${lit(id)}`))[0] ?? null,

  participants: (matchId: string) =>
    queryJson<ParticipantDb>(
      `select athlete_id, outcome, elo_before, elo_after, elo_delta, weight_division_gap
       from public.match_participants where match_id = ${lit(matchId)}`,
    ),

  submission: async (matchId: string) =>
    (
      await queryJson<SubmissionDb>(
        `select s.winner_id, s.loser_id, t.code, s.finish_time_seconds
         from public.submissions s join public.submission_types t on t.id = s.submission_type_id
         where s.match_id = ${lit(matchId)}`,
      )
    )[0] ?? null,

  eloHistory: (matchId: string) =>
    queryJson<{ athlete_id: string; rating_before: number; rating_after: number; delta: number }>(
      `select athlete_id, rating_before, rating_after, delta from public.elo_history where match_id = ${lit(matchId)}`,
    ),

  confirmations: (matchId: string) =>
    queryJson<{ athlete_id: string; confirmed: boolean }>(
      `select athlete_id, confirmed from public.match_confirmations where match_id = ${lit(matchId)}`,
    ),

  disputes: (matchId: string) =>
    queryJson<{ raised_by: string; reason: string | null; status: string }>(
      `select raised_by, reason, status from public.match_disputes where match_id = ${lit(matchId)}`,
    ),

  athlete: async (id: string) =>
    (
      await queryJson<AthleteDb>(
        `select id, current_elo, current_weight::float as current_weight, looking_for_ranked, status
         from public.athletes where id = ${lit(id)}`,
      )
    )[0] ?? null,

  /** Poll `looking_for_ranked` until it equals `expected`. */
  waitLooking: (id: string, expected: boolean, timeoutMs: number) =>
    pollUntil(
      `athlete ${id} looking_for_ranked=${expected}`,
      async () => ((await db.athlete(id))?.looking_for_ranked === expected ? true : undefined),
      { timeoutMs, intervalMs: 500 },
    ),

  /** Poll a match until its status is one of `statuses`. */
  waitMatchStatus: (id: string, statuses: string[], timeoutMs: number) =>
    pollUntil(
      `match ${id} status in ${statuses.join("|")}`,
      async () => {
        const m = await db.match(id);
        return m && statuses.includes(m.status) ? m : undefined;
      },
      { timeoutMs, intervalMs: 500 },
    ),
};
