import * as React from "react";
import type {
  TimerSyncEvent,
  useSessionMatchTimer,
} from "@jits/shared/hooks/use-session-match-timer";

type Timer = ReturnType<typeof useSessionMatchTimer>;

/** The pause state this device has already applied to its timer. */
export interface KnownPauseState {
  pausedAt: string | null;
  totalPausedDuration: number;
  /** `paused_at` values (epoch ms) this device has already seen resumed. */
  resumed: readonly number[];
}

/** The pause state a reconciler read of the `matches` row carries. */
export interface DbPauseState {
  pausedAt: string | null;
  totalPausedDuration: number;
}

/**
 * True when a DB read must NOT replace the pause state in hand, because it
 * was read before a pause or resume this device already applied (its own
 * tap, or the opponent's broadcast). A reconciler fetch can straddle such a
 * change: without this, a read taken while paused that lands just after a
 * resume re-paused the timer (and one taken while running re-started a
 * paused one) until the next poll, up to 10 s later.
 *
 * `total_paused_duration` only grows (resume_match adds each pause to it),
 * so it orders reads against resumes. Same total means the same running
 * stretch: a paused read is stale only if that very pause was already seen
 * resumed (a resume under 0.5 s adds 0, since the RPC rounds to seconds), and
 * a running read is stale while this device is paused (it predates the
 * pause). Timestamps compare as instants: the row and the RPC may format
 * the same `paused_at` differently.
 */
export function isStalePauseRead(known: KnownPauseState, db: DbPauseState): boolean {
  if (db.totalPausedDuration < known.totalPausedDuration) return true;
  if (db.totalPausedDuration > known.totalPausedDuration) return false;
  if (db.pausedAt) return known.resumed.includes(Date.parse(db.pausedAt));
  return known.pausedAt != null;
}

/**
 * The live step's timer, kept in step with the DB pause state the wizard
 * re-reads (foreground, channel rejoin, poll) after a pause/resume broadcast
 * was missed. Returns the timer with a `syncFromBroadcast` that records
 * every applied change, so a DB read older than one of them is ignored
 * (`isStalePauseRead`). Every pause/resume source (local tap, broadcast, DB)
 * must go through the returned timer for that record to be complete.
 */
export function usePauseResync(
  timer: Timer,
  pausedAt: string | null,
  totalPausedDuration: number,
): Timer {
  const knownRef = React.useRef<KnownPauseState>({ pausedAt, totalPausedDuration, resumed: [] });
  const { syncFromBroadcast } = timer;

  const track = React.useCallback(
    (event: TimerSyncEvent) => {
      const k = knownRef.current;
      if (event.type === "paused") {
        knownRef.current = { ...k, pausedAt: event.pausedAt };
      } else if (event.type === "resumed") {
        knownRef.current = {
          pausedAt: null,
          totalPausedDuration: event.totalPausedDuration,
          resumed: k.pausedAt ? [...k.resumed, Date.parse(k.pausedAt)] : k.resumed,
        };
      }
      syncFromBroadcast(event);
    },
    [syncFromBroadcast],
  );

  // The timer only takes its pause state from props at mount, so apply a
  // newer DB state when the wizard's re-read changes it, unless the read
  // predates a change already applied here.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isStalePauseRead(knownRef.current, { pausedAt, totalPausedDuration })) return;
    if (pausedAt) track({ type: "paused", pausedAt });
    else track({ type: "resumed", totalPausedDuration });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to DB changes
  }, [pausedAt, totalPausedDuration]);

  return { ...timer, syncFromBroadcast: track };
}
