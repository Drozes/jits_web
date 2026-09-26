import * as React from "react";
import type {
  TimerSyncEvent,
  useSessionMatchTimer,
} from "@jits/shared/hooks/use-session-match-timer";
import type { MatchDetails } from "@jits/shared/api/queries";
import { useMatchSyncContext } from "./match-sync-context";

type Timer = ReturnType<typeof useSessionMatchTimer>;

/** The pause state this device has already applied to its timer. */
export interface KnownPauseState {
  pausedAt: string | null;
  totalPausedDuration: number;
  /** `paused_at` instants (epoch ms) this device has already seen resumed. */
  resumed: readonly number[];
  /** `Date.now()` when a pause/resume was last applied here; null before any. */
  lastChangeAt: number | null;
}

/** The pause state a reconciler read of the `matches` row carries. */
export interface DbPauseState {
  pausedAt: string | null;
  totalPausedDuration: number;
}

/** Epoch ms of a timestamp, or null when it does not parse. */
function instant(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** True when the read says exactly what this device already shows. Row and
 * RPC may format the same `paused_at` differently, so compare instants. */
export function isSamePauseState(known: KnownPauseState, db: DbPauseState): boolean {
  if (db.totalPausedDuration !== known.totalPausedDuration) return false;
  if (db.pausedAt == null || known.pausedAt == null) return db.pausedAt == known.pausedAt;
  const a = instant(db.pausedAt);
  const b = instant(known.pausedAt);
  return a != null && b != null ? a === b : db.pausedAt === known.pausedAt;
}

/**
 * True when a DB read must NOT replace the pause state in hand, because it
 * may have been read before a pause or resume this device already applied
 * (its own tap, or the opponent's broadcast). Without this, a read taken
 * while paused that landed just after a resume re-paused the timer (and one
 * taken while running re-started a paused one) until the next poll.
 *
 * `total_paused_duration` only grows (resume_match adds each pause), so a
 * smaller total is always older. An equal total is ambiguous: a running read
 * while paused here is either from before our pause or a real resume that
 * added 0 s (the RPC rounds, so a pause under 0.5 s) whose broadcast was
 * missed; a paused read of a pause already seen resumed is either stale or
 * that resume was itself misread. Those are held back only when the read was
 * ISSUED at or before the last applied change (`sentAt`, not arrival: a slow
 * read on poor cellular can land long after a change it predates, jits-igku).
 * Every change is applied here only after its RPC committed (own tap) or
 * after the opponent's RPC committed (their broadcast), so a read issued
 * later already reflects it: the next poll is trusted and the timer can never
 * stick. A read issued in the same millisecond is held back, which costs at
 * most one poll.
 */
export function isStalePauseRead(known: KnownPauseState, db: DbPauseState, sentAt: number): boolean {
  if (db.totalPausedDuration < known.totalPausedDuration) return true;
  if (db.totalPausedDuration > known.totalPausedDuration) return false;
  const predatesChange = known.lastChangeAt != null && sentAt <= known.lastChangeAt;
  if (!predatesChange) return false;
  if (db.pausedAt) {
    const t = instant(db.pausedAt);
    return t != null && known.resumed.includes(t);
  }
  return known.pausedAt != null;
}

/**
 * The live step's timer, kept in step with the DB pause state after a
 * pause/resume broadcast was missed. Returns the timer with a
 * `syncFromBroadcast` that records every applied change; every pause/resume
 * source (local tap, broadcast, DB) must go through it. The DB side listens
 * to every reconciler snapshot (foreground, rejoin, poll), including one
 * identical to the last, so a read held back as possibly stale is applied
 * by a later poll even though no prop changed.
 */
export function usePauseResync(
  timer: Timer,
  pausedAt: string | null,
  totalPausedDuration: number,
): Timer {
  const knownRef = React.useRef<KnownPauseState>({
    pausedAt,
    totalPausedDuration,
    resumed: [],
    lastChangeAt: null,
  });
  const { syncFromBroadcast } = timer;
  const { subscribeSnapshot } = useMatchSyncContext();

  const track = React.useCallback(
    (event: TimerSyncEvent) => {
      const k = knownRef.current;
      if (event.type === "paused") {
        knownRef.current = { ...k, pausedAt: event.pausedAt, lastChangeAt: Date.now() };
      } else if (event.type === "resumed") {
        const was = k.pausedAt ? instant(k.pausedAt) : null;
        knownRef.current = {
          pausedAt: null,
          totalPausedDuration: event.totalPausedDuration,
          resumed: was != null ? [...k.resumed, was] : k.resumed,
          lastChangeAt: Date.now(),
        };
      }
      syncFromBroadcast(event);
    },
    [syncFromBroadcast],
  );

  React.useEffect(
    () =>
      subscribeSnapshot((m: MatchDetails, { sentAt }) => {
        if (m.status !== "in_progress") return;
        const db = { pausedAt: m.paused_at, totalPausedDuration: m.total_paused_duration };
        const known = knownRef.current;
        if (isSamePauseState(known, db) || isStalePauseRead(known, db, sentAt)) return;
        if (db.pausedAt) track({ type: "paused", pausedAt: db.pausedAt });
        else track({ type: "resumed", totalPausedDuration: db.totalPausedDuration });
      }),
    [subscribeSnapshot, track],
  );

  return { ...timer, syncFromBroadcast: track };
}
