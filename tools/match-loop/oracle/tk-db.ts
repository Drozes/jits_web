/**
 * Timekeeper-mode database oracles (jr_be 024 sections 2 and 6): ground truth
 * read as `postgres`, like `oracle/db.ts`, so a scenario asserts what the
 * server really did and not only what the simulator shows (PLAN 3.2, M7
 * reviewer focus). Kept apart from `db.ts`, whose flag-OFF readers stay as
 * they are.
 */
import { lit, queryJson } from "../lib/psql";
import { pollUntil } from "../lib/util";
import type { MatchDb } from "./db";

/** `matches` with the timekeeper-mode columns (jr_be 024 2.1). */
export interface TkMatchDb extends MatchDb {
  created_at: string;
  requires_timekeeper: boolean;
  tk_weight_check_required: boolean;
  timekeeper_id: string | null;
  timekeeper_deadline_at: string | null;
  ended_at: string | null;
  final_elapsed_s: number | null;
  cancel_reason: string | null;
  result_edit_count: number;
  result_edited_at: string | null;
  result_recorded_by_admin: boolean;
  rating_seq: number | null;
}

export interface TkRequestDb {
  id: string;
  match_id: string;
  requested_by: string;
  invitee_id: string;
  status: string;
  expires_at: string;
  responded_at: string | null;
}

export interface TkHistoryDb {
  timekeeper_id: string;
  seated_at: string;
  left_at: string | null;
  left_reason: string | null;
}

export interface TkFlagDb {
  kind: string;
  resolved_at: string | null;
}

export interface TkNotificationDb {
  kind: string;
  recipient_athlete_id: string;
  subject_athlete_id: string | null;
}

export interface ChallengeCapsDb {
  challenger_tk_capable: boolean;
  opponent_tk_capable: boolean;
}

/** The drop-out `left_reason` values (A26): only these count against a timekeeper. */
export const DROP_OUT_REASONS: ReadonlySet<string> = new Set(["left_prestart", "offline_prestart", "left_live", "offline_live"]);

export const tkDb = {
  match: async (id: string) =>
    (await queryJson<TkMatchDb>(`select * from public.matches where id = ${lit(id)}`))[0] ?? null,

  /** Every request for a match, oldest first. */
  requests: (matchId: string) =>
    queryJson<TkRequestDb>(
      `select id, match_id, requested_by, invitee_id, status, expires_at, responded_at
       from public.match_timekeeper_requests where match_id = ${lit(matchId)} order by created_at`,
    ),

  /** The seat history, oldest first (one row per seat). */
  history: (matchId: string) =>
    queryJson<TkHistoryDb>(
      `select timekeeper_id, seated_at, left_at, left_reason
       from public.match_timekeeper_history where match_id = ${lit(matchId)} order by seated_at, id`,
    ),

  flags: (matchId: string) =>
    queryJson<TkFlagDb>(`select kind, resolved_at from public.match_timekeeper_flags where match_id = ${lit(matchId)} order by kind`),

  /** Athletes with a `match_ready` row. */
  ready: async (matchId: string) =>
    (await queryJson<{ athlete_id: string }>(`select athlete_id from public.match_ready where match_id = ${lit(matchId)} order by athlete_id`)).map(
      (r) => r.athlete_id,
    ),

  /** The timekeeper's verdicts (`match_timekeeper_weight_checks`). */
  timekeeperChecks: (matchId: string) =>
    queryJson<{ subject_id: string; status: string }>(
      `select subject_id, status from public.match_timekeeper_weight_checks where match_id = ${lit(matchId)} order by subject_id`,
    ),

  /** Every athlete check on the match (`match_weight_checks`). */
  athleteChecks: (matchId: string) =>
    queryJson<{ checker_id: string; subject_id: string; status: string }>(
      `select checker_id, subject_id, status from public.match_weight_checks where match_id = ${lit(matchId)} order by checker_id`,
    ),

  /** The timekeeper's recording intent row, if any. */
  timekeeperIntent: async (matchId: string, timekeeperId: string) =>
    (
      await queryJson<{ role: string; intends_to_record: boolean }>(
        `select role, intends_to_record from public.match_recording_intents
         where match_id = ${lit(matchId)} and athlete_id = ${lit(timekeeperId)}`,
      )
    )[0] ?? null,

  /** `social_notifications` rows about this match (TK-N kinds), oldest first. */
  notifications: (matchId: string) =>
    queryJson<TkNotificationDb>(
      `select kind, recipient_athlete_id, subject_athlete_id from public.social_notifications
       where match_id = ${lit(matchId)} order by id`,
    ),

  challengeCaps: async (challengeId: string) =>
    (
      await queryJson<ChallengeCapsDb>(
        `select challenger_tk_capable, opponent_tk_capable from public.challenges where id = ${lit(challengeId)}`,
      )
    )[0] ?? null,

  /** Whether the athlete has recorded the AI consent (`record_ai_processing_consent`). */
  consented: async (athleteId: string) =>
    (
      await queryJson<{ consented: boolean }>(
        `select ai_processing_consent_at is not null as consented from public.athletes where id = ${lit(athleteId)}`,
      )
    )[0]?.consented ?? null,

  /**
   * Completed timekeeper-mode matches of these accounts whose result is still
   * open (fewer than two athlete confirmations, completed in the last 30
   * minutes, the production edit window): a scenario that failed between the
   * record and both confirms leaves one, which `get_my_timekeeping_match`
   * keeps offering its timekeeper. The reset leaves completed matches alone,
   * so a timekeeper scenario notes them in its trace.
   */
  openResults: (ids: readonly string[]) =>
    queryJson<{ id: string; timekeeper_id: string | null; completed_at: string }>(
      `select m.id, m.timekeeper_id, m.completed_at from public.matches m
       where m.requires_timekeeper and m.status = 'completed' and m.completed_at > now() - interval '30 minutes'
         and (m.timekeeper_id in (${ids.map(lit).join(", ")})
              or exists (select 1 from public.match_participants p where p.match_id = m.id and p.athlete_id in (${ids.map(lit).join(", ")})))
         and (select count(*) from public.match_confirmations c where c.match_id = m.id and c.confirmed) < 2
       order by m.completed_at`,
    ),

  /**
   * The athlete's newest completed match as `get_match_history` lists it
   * (completed, the athlete and an opponent seated, in the RPC's own order),
   * or null when there is none: the positive anchor of a history read. The
   * RPC lists newest first, so this match is on its first page whatever
   * PostgREST's row cap (`max_rows`).
   */
  newestCompletedMatch: async (athleteId: string) =>
    (
      await queryJson<{ id: string }>(
        `select m.id from public.matches m
         join public.match_participants mp on mp.match_id = m.id and mp.athlete_id = ${lit(athleteId)}
         where m.status = 'completed'
           and exists (select 1 from public.match_participants o where o.match_id = m.id and o.athlete_id <> ${lit(athleteId)})
         order by m.completed_at desc, m.id desc limit 1`,
      )
    )[0]?.id ?? null,

  /** Poll a match until `pred` holds; returns the row (or throws ExpectationTimeout). */
  waitMatch: (id: string, what: string, pred: (m: TkMatchDb) => boolean, timeoutMs: number) =>
    pollUntil(
      `match ${id}: ${what}`,
      async () => {
        const m = await tkDb.match(id);
        return m && pred(m) ? m : undefined;
      },
      { timeoutMs, intervalMs: 500, lastSeen: () => what },
    ),
};

/**
 * Whether the history says a timekeeper drop-out was recorded (A26): only
 * `left_prestart`, `offline_prestart`, `left_live` and `offline_live` count.
 */
export function droppedOut(history: TkHistoryDb[], timekeeperId: string): boolean {
  return history.some((h) => h.timekeeper_id === timekeeperId && !!h.left_reason && DROP_OUT_REASONS.has(h.left_reason));
}

/** A history read as the athlete: `get_match_history` through their own client, error included. */
export interface HistoryRead {
  data: readonly { match_id: string }[] | null;
  error: { message: string } | null;
}

/**
 * The no-contest "absent from history" oracle (pure, for tests). An absence
 * means something only once the read is shown to work: no error, a rows
 * array, and the athlete's newest completed match the database has
 * (`newest`, from `tkDb.newestCompletedMatch`) listed in it; with no
 * completed match in the database only the error check anchors it. The
 * shared `getMatchHistory` returns [] on an error, which would read as
 * "absent" (a pass), so the scenarios read the RPC through the athlete's
 * client and hand its error here. `anchor` is "ok" or why the read cannot
 * be trusted; `inHistory` is then "history read failed".
 */
export function historyVerdict(
  read: HistoryRead,
  newest: string | null,
  matchId: string,
): { anchor: string; inHistory: boolean | "history read failed" } {
  const failed = (anchor: string) => ({ anchor, inHistory: "history read failed" as const });
  if (read.error) return failed(`the read failed: ${read.error.message}`);
  if (!read.data) return failed("the read returned no rows array");
  const ids = read.data.map((h) => h.match_id);
  if (newest && !ids.includes(newest)) return failed(`the read (${ids.length} rows) does not list the newest completed match ${newest}`);
  return { anchor: "ok", inHistory: ids.includes(matchId) };
}

/**
 * Recipients of one notification kind (sorted, one entry per row, so a
 * duplicate push shows), for a "who was told" oracle. `subject` narrows it
 * to the rows about one acting person (`subject_athlete_id`), for a kind
 * that can be sent more than once in a match (a re-seat sends TK-N2 again).
 */
export function recipientsOf(rows: TkNotificationDb[], kind: string, subject?: string): string[] {
  return rows
    .filter((r) => r.kind === kind && (subject === undefined || r.subject_athlete_id === subject))
    .map((r) => r.recipient_athlete_id)
    .sort();
}
