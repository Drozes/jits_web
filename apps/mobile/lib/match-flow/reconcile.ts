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
 *  - Never move backwards. A snapshot can only be as new as the DB was when
 *    it was read, so it can only imply an earlier-or-equal step than the
 *    truth; moving forward to it is always safe, moving back never is. The
 *    single exception is the initial correction below.
 *  - Never submit anything. Reconciling only moves the step; every mutation
 *    stays behind an explicit tap.
 *  - `completed` does NOT mean confirmed: `record_match_result` completes the
 *    match and applies ELO at record time; confirmations are separate rows.
 */
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { MATCH_STEPS, type MatchStep } from "./step-router";

export interface MatchSnapshot {
  status: string;
  /** Athlete ids with a positive `match_confirmations` row; null = unknown. */
  confirmedAthleteIds: string[] | null;
}

/** Why a terminal match leaves the wizard: the toast copy differs. */
export type ExitReason = "cancelled" | "voided";

export type ReconcileAction =
  | { type: "none" }
  | { type: "exit"; reason: ExitReason }
  | { type: "goto"; step: MatchStep };

interface PlanParams {
  current: MatchStep;
  snapshot: MatchSnapshot;
  currentAthleteId: string;
  opponentId: string;
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

/** Poll cadence for a step, or null when the step must not poll. */
export function pollIntervalFor(step: MatchStep | null): number | null {
  if (step === "ready" || step === "result" || step === "confirm") return WAITING_POLL_MS;
  if (step === "live") return LIVE_POLL_MS;
  return null;
}

/** The step the DB implies, or "exit" for a cancelled or voided match, or
 * null when the snapshot says nothing about the step (pending, unknown
 * statuses). `voided` is set only by an admin resolving a dispute (ELO
 * reverted, no winner), so there is nothing left for the wizard to show. */
export function targetFor(
  snapshot: MatchSnapshot,
  currentAthleteId: string,
  opponentId: string,
): MatchStep | "exit" | null {
  switch (snapshot.status) {
    case "cancelled":
    case "voided":
      return "exit";
    case "in_progress":
      return "live";
    case "completed": {
      const ids = snapshot.confirmedAthleteIds;
      if (ids && ids.includes(currentAthleteId) && ids.includes(opponentId)) return "summary";
      return "confirm";
    }
    case "disputed":
      return "summary";
    default:
      return null;
  }
}

export function planReconcile({
  current,
  snapshot,
  currentAthleteId,
  opponentId,
  initial = false,
}: PlanParams): ReconcileAction {
  const target = targetFor(snapshot, currentAthleteId, opponentId);
  if (target == null) return { type: "none" };
  if (target === "exit") {
    // A voided result leaves even the summary: the verdict and ELO it shows
    // were reverted. A cancel cannot follow a result, so a finished wizard
    // stays put; anything else leaves like match_cancelled.
    if (snapshot.status === "voided") return { type: "exit", reason: "voided" };
    return current === "summary" ? { type: "none" } : { type: "exit", reason: "cancelled" };
  }
  if (idx(target) > idx(current)) return { type: "goto", step: target };
  if (
    initial &&
    current === "summary" &&
    target === "confirm" &&
    snapshot.confirmedAthleteIds != null &&
    !snapshot.confirmedAthleteIds.includes(currentAthleteId)
  ) {
    return { type: "goto", step: "confirm" };
  }
  return { type: "none" };
}

/** Rank used to keep a stale fetch from regressing the match row in hand. */
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
};

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
