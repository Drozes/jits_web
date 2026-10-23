/**
 * Pure match-state reconciliation for the mobile wizard.
 *
 * The wizard advances on per-step broadcasts over `session-match:<matchId>`,
 * and a missed broadcast used to strand a side for good (jits-wfpo, -bh2v,
 * -vh7m, -bmei, -mzfu). The DB is the authority: this module maps a fetched
 * snapshot of it (match status + who has confirmed) onto what the wizard
 * should do, and `use-match-reconciler.ts` decides WHEN to fetch.
 *
 * Invariants, all pinned by `__tests__/lib/match-flow/reconcile.test.ts`:
 *  - Never move backwards, except where `step-transitions.ts` allows it. A
 *    snapshot can only be as new as the DB was when it was read, so it can
 *    only imply an earlier-or-equal step than the truth; moving forward to
 *    it is always safe, moving back is not. The exceptions are the initial
 *    correction below (both modes) and the two timekeeper-mode moves
 *    (`isAllowedBackward`: a pre-start drop-out back to `crew`, a result
 *    edit back to `confirm`), which the DB itself proves.
 *  - Never submit anything. Reconciling only moves the step; every mutation
 *    stays behind an explicit tap.
 *  - `completed` does NOT mean confirmed: `record_match_result` completes the
 *    match and applies ELO at record time; confirmations are separate rows.
 *
 * The two-athlete flow (no `mode`, or `self_run`) maps exactly as it always
 * did; timekeeper mode routes per spec 6.2.
 */
import type { MatchCancelReason, MatchDetails, MatchRowStatus } from "@jits/shared/api/queries";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { MatchAthleteView, MatchMode, ViewerRole } from "./match-roles";
import { MATCH_STEPS, type MatchStep } from "./step-router";
import { isAllowedBackward } from "./step-transitions";

export interface MatchSnapshot {
  status: string;
  /** Athlete ids with a positive `match_confirmations` row; null = unknown. */
  confirmedAthleteIds: string[] | null;
  // Timekeeper mode only, from the match read (null or 0 when the read lacks
  // them; a two-athlete match never reads them).
  /** The seated timekeeper; null while the athletes pick one. */
  timekeeperId?: string | null;
  /** The timekeeper ended the clock (the status stays `in_progress`). */
  endedAt?: string | null;
  cancelReason?: MatchCancelReason | null;
  /** `matches.result_edit_count` in this snapshot. */
  resultEditCount?: number;
  /**
   * A8: the `result_edit_count` the athlete's verdict stands on, fixed when
   * the wizard entered `summary` (undefined on any other step). A later
   * edit (a higher count) with this athlete's confirmation gone sends them
   * back to `confirm` (`isAllowedBackward`).
   */
  summaryEditCount?: number;
}

type AthleteRef = Pick<MatchAthleteView, "athleteId">;

/**
 * The part of `MatchRoles` reconciliation reads (`MatchRoles` satisfies
 * it): the viewer's own athlete, and the two athletes whose confirmations
 * finish the match (their order is not read). The match-loop bot builds it
 * from the two athlete ids it holds; with no `mode` it is the two-athlete
 * flow.
 */
export interface ReconcileRoles {
  me: AthleteRef | null;
  athletes: readonly [AthleteRef, AthleteRef];
  mode?: MatchMode;
  viewer?: ViewerRole;
}

/** Why a terminal match leaves the wizard: the toast copy differs. */
export type ExitReason = "cancelled" | "voided";

export type ReconcileAction =
  | { type: "none" }
  /** `cancelReason`: timekeeper mode's reason for a cancel, for its own exit toast. */
  | { type: "exit"; reason: ExitReason; cancelReason?: MatchCancelReason | null }
  | { type: "goto"; step: MatchStep };

interface PlanParams {
  current: MatchStep;
  snapshot: MatchSnapshot;
  roles: ReconcileRoles;
  /**
   * True only for the first snapshot after mount, before the athlete has
   * moved the wizard themselves. The mount-time step comes from status alone
   * (`getCurrentStep`), which puts every `completed` match on the summary,
   * including one this athlete never confirmed. That strands the opponent on
   * "Waiting for opponent to confirm" (jits-bmei), so the first snapshot may
   * move summary back to confirm, and only when this athlete has not
   * confirmed.
   */
  initial?: boolean;
}

const idx = (s: MatchStep) => MATCH_STEPS.indexOf(s);

/** Steps where the athlete is waiting on the other side and nothing in the
 * DB can reach them except a broadcast, so the reconciler polls. */
const WAITING_POLL_MS = 4_000;
/** The live step polls slowly: a missed `match_ended` followed by the
 * opponent recording would otherwise leave this side on the timer until it
 * runs out (up to the full match length). */
const LIVE_POLL_MS = 10_000;

/**
 * Poll cadence for a step, or null when the step must not poll. The
 * two-athlete intervals are unchanged; a timekeeper-mode match also polls
 * `crew` and `weight` (a seat, a drop-out back to the picker, a deadline
 * cancel) and the timekeeper's `summary` (the athletes' confirmations on the
 * done screen), so a missed realtime event never strands a phone (review
 * tech M7). The done screen stops once `doneSettled`
 * (`timekeeperDoneSettled`, jits-o47s.44).
 */
export function pollIntervalFor(
  step: MatchStep | null,
  roles?: Pick<ReconcileRoles, "mode" | "viewer"> | null,
  doneSettled = false,
): number | null {
  if (roles?.mode === "timekeeper") {
    if (step === "crew" || step === "weight") return WAITING_POLL_MS;
    if (step === "summary" && roles.viewer === "timekeeper") return doneSettled ? null : WAITING_POLL_MS;
  }
  if (step === "ready" || step === "result" || step === "confirm") return WAITING_POLL_MS;
  if (step === "live") return LIVE_POLL_MS;
  return null;
}

/** The step the DB implies, or "exit" for a cancelled or voided match, or
 * null when the snapshot says nothing about the step (pending, unknown
 * statuses). `voided` is set only by an admin resolving a dispute (ELO
 * reverted, no winner), so there is nothing left for the wizard to show. */
export function targetFor(snapshot: MatchSnapshot, roles: ReconcileRoles): MatchStep | "exit" | null {
  if (roles.mode === "timekeeper") return timekeeperTargetFor(snapshot, roles);
  switch (snapshot.status) {
    case "cancelled":
    case "voided":
      return "exit";
    case "in_progress":
      return "live";
    case "completed":
      return allConfirmed(snapshot, roles) ? "summary" : "confirm";
    case "disputed":
      return "summary";
    default:
      return null;
  }
}

function allConfirmed(
  snapshot: Pick<MatchSnapshot, "confirmedAthleteIds">,
  roles: Pick<ReconcileRoles, "athletes">,
): boolean {
  const ids = snapshot.confirmedAthleteIds;
  return !!ids && roles.athletes.every((a) => ids.includes(a.athleteId));
}

/**
 * True once nothing on the timekeeper's done screen can change from its
 * poll's point of view (jits-o47s.44): a voided match (final), or a
 * completed one both athletes have confirmed. The poll's job there is the
 * athletes' confirmations (spec 10, M7), and with both in, `edit_match_result`
 * refuses an edit (edit_closed_confirmed) whatever the 30-minute window says,
 * so the window opens nothing more; a result-stall review is over once the
 * result is recorded. A disputed match keeps polling: the admin's review
 * moves it to completed or voided. Realtime (the `matches` row, the
 * timekeeper-mode tables) and the foreground re-read still catch a late
 * change without the poll.
 */
export function timekeeperDoneSettled(
  snapshot: Pick<MatchSnapshot, "status" | "confirmedAthleteIds">,
  roles: Pick<ReconcileRoles, "athletes">,
): boolean {
  if (snapshot.status === "voided") return true;
  return snapshot.status === "completed" && allConfirmed(snapshot, roles);
}

/**
 * Timekeeper mode (spec 6.2): athletes pick on `crew` while nobody is seated
 * and face off once someone is; the clock's end (`ended_at`, status still
 * `in_progress`) is `result` for everyone; a completed match is `confirm`
 * for an athlete who owes a confirmation and the done screen (`summary`)
 * for the timekeeper. A cancel exits everyone, as in the two-athlete flow; a
 * void (an admin's dispute review) exits the athletes with the shipped
 * toast and keeps the timekeeper on the done screen, which shows it (spec
 * 6.2; the shipped toast's rating sentence is not about them).
 */
function timekeeperTargetFor(snapshot: MatchSnapshot, roles: ReconcileRoles): MatchStep | "exit" | null {
  const timekeeper = roles.viewer === "timekeeper";
  switch (snapshot.status) {
    case "cancelled":
      return "exit";
    case "voided":
      return timekeeper ? "summary" : "exit";
    case "pending":
      return timekeeper || snapshot.timekeeperId ? "weight" : "crew";
    case "in_progress":
      return snapshot.endedAt ? "result" : "live";
    case "completed":
      return timekeeper || allConfirmed(snapshot, roles) ? "summary" : "confirm";
    case "disputed":
      return "summary";
    default:
      return null;
  }
}

export function planReconcile({
  current,
  snapshot,
  roles,
  initial = false,
}: PlanParams): ReconcileAction {
  const target = targetFor(snapshot, roles);
  if (target == null) return { type: "none" };
  if (target === "exit") {
    // A voided result leaves even the summary: the verdict and ELO it shows
    // were reverted. A cancel cannot follow a result, so a finished wizard
    // stays put; anything else leaves like match_cancelled.
    if (snapshot.status === "voided") return { type: "exit", reason: "voided" };
    if (current === "summary") return { type: "none" };
    return roles.mode === "timekeeper"
      ? { type: "exit", reason: "cancelled", cancelReason: snapshot.cancelReason ?? null }
      : { type: "exit", reason: "cancelled" };
  }
  if (idx(target) > idx(current)) return { type: "goto", step: target };
  if (isAllowedBackward(current, target, snapshot, roles)) return { type: "goto", step: target };
  if (
    initial &&
    current === "summary" &&
    target === "confirm" &&
    snapshot.confirmedAthleteIds != null &&
    roles.me != null &&
    !snapshot.confirmedAthleteIds.includes(roles.me.athleteId)
  ) {
    return { type: "goto", step: "confirm" };
  }
  return { type: "none" };
}

/**
 * The snapshot a match read implies. Every field is always set: a read
 * without the timekeeper-mode columns (a two-athlete match on an older
 * backend) gives null `timekeeperId`, `endedAt` and `cancelReason` and a
 * `resultEditCount` of 0, and `summaryEditCount` is whatever the wizard
 * passes (undefined off `summary`). A two-athlete match never reads them:
 * its routing is the status and the confirmations alone (`targetFor`).
 */
export function matchSnapshot(
  match: Pick<MatchDetails, "status" | "timekeeper_id" | "ended_at" | "cancel_reason" | "result_edit_count">,
  confirmedAthleteIds: string[] | null,
  summaryEditCount?: number,
): MatchSnapshot {
  return {
    status: match.status,
    confirmedAthleteIds,
    timekeeperId: match.timekeeper_id ?? null,
    endedAt: match.ended_at ?? null,
    cancelReason: match.cancel_reason ?? null,
    resultEditCount: match.result_edit_count ?? 0,
    summaryEditCount,
  };
}

/**
 * Rank used to keep a stale fetch from regressing the match row in hand.
 * Every status has one (`satisfies`), and an unknown string has none.
 */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
  // An admin can resolve a dispute back to completed; both are terminal
  // results, so they share a rank and either may replace the other.
  disputed: 2,
  cancelled: 3,
  // Only reachable from disputed (resolve_dispute), and final.
  voided: 3,
} satisfies Record<MatchRowStatus, number>;

/** True when `next` must not replace `prev` because it is older. */
export function isStatusRegression(prev: string, next: string): boolean {
  const p = STATUS_RANK[prev];
  const n = STATUS_RANK[next];
  if (p == null || n == null) return false;
  return n < p;
}

/**
 * Rebuild the confirm step's verdict from the DB when the `result_submitted`
 * broadcast that normally carries it was missed. Null when no outcome is
 * stamped yet.
 */
export function resultFromOutcome(
  ownOutcome: string | null,
  currentAthleteId: string,
  opponentId: string,
): BroadcastResult | null {
  if (ownOutcome === "draw") return { result: "draw" };
  if (ownOutcome === "win") return { result: "submission", winnerId: currentAthleteId };
  if (ownOutcome === "loss") return { result: "submission", winnerId: opponentId };
  return null;
}

type OutcomeRef = Pick<MatchAthleteView, "athleteId" | "outcome">;

/**
 * `resultFromOutcome` for whoever is viewing: an athlete from their own
 * outcome (as always), the timekeeper from the challenger's.
 */
export function resultFromRoles(roles: {
  me: OutcomeRef | null;
  opponent: OutcomeRef | null;
  athletes: readonly [OutcomeRef, OutcomeRef];
}): BroadcastResult | null {
  if (roles.me && roles.opponent) return resultFromOutcome(roles.me.outcome, roles.me.athleteId, roles.opponent.athleteId);
  const [first, second] = roles.athletes;
  return resultFromOutcome(first.outcome, first.athleteId, second.athleteId);
}
