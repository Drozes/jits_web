import type { MatchDetails } from "@jits/shared/api/queries";

/**
 * Fields `get_match_details` gained for the match-flow redesign (jr_be B3,
 * B4), read defensively from the match in hand. `getMatchDetails` spreads
 * the RPC's `match` object, so they are present at runtime on a new backend
 * even though `MatchDetails` does not declare them yet; on an older backend
 * every one is null and the UI leaves its piece out.
 */
export interface MatchExtras {
  winnerId: string | null;
  submissionName: string | null;
  finishTimeSeconds: number | null;
  /** When an undisputed result locks (completed_at + 24 h). */
  disputeLocksAt: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readMatchExtras(match: MatchDetails | null | undefined): MatchExtras {
  const m = (match ?? {}) as unknown as Record<string, unknown>;
  return {
    winnerId: str(m.winner_id),
    submissionName: str(m.submission_name),
    finishTimeSeconds: num(m.finish_time_seconds),
    disputeLocksAt: str(m.dispute_locks_at),
  };
}

/**
 * "Locks automatically in 23 h if nobody disputes." Null when there is no
 * lock time (older backend) or it has already passed.
 */
export function disputeLockNote(locksAt: string | null, now = Date.now()): string | null {
  if (!locksAt) return null;
  const ms = Date.parse(locksAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const when = hours >= 1 ? `${hours} h` : `${Math.max(1, Math.ceil(ms / 60_000))} min`;
  return `Locks automatically in ${when} if nobody disputes.`;
}

/** True once an undisputed result can no longer be disputed. */
export function isDisputeWindowClosed(locksAt: string | null, now = Date.now()): boolean {
  if (!locksAt) return false;
  const t = Date.parse(locksAt);
  return Number.isFinite(t) && now >= t;
}
