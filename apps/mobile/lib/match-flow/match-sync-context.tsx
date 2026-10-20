import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import type { MatchDetails } from "@jits/shared/api/queries";

/** How long a step waits for a broadcast to leave the device before it
 * unmounts the channel that carries it (jits-mzfu). A normal ack is tens of
 * milliseconds; this only bounds a slow or dead socket, and the reconciler
 * is the backstop for anything that still does not arrive. */
export const SEND_GRACE_MS = 1_500;

interface MatchSyncContextValue {
  /** Forwarded every per-step channel status; SUBSCRIBED triggers a re-sync. */
  onChannelStatus: (status: string) => void;
  /** Re-sync from the DB now (e.g. after a mutation failed on a stale step). */
  reconcileNow: () => void;
  /** This athlete is leaving on purpose (they cancelled): suppress the
   * reconciler's own "match cancelled" exit so it does not double-navigate. */
  markExiting: () => void;
  /** Called with every reconciler snapshot, including one identical to the
   * last (which leaves the match object, and so every prop, unchanged).
   * Returns the unsubscribe. */
  subscribeSnapshot: (listener: (match: MatchDetails) => void) => () => void;
  /**
   * Timekeeper mode: a `match_cancelled` broadcast named who cancelled
   * (`actor_id`). Recorded only, never acted on (M-R8): the handler then
   * calls `reconcileNow`, and the cancelled snapshot's exit toast names that
   * athlete (TK-E1, `noContestExit`). `useStepMatchSync` is that handler.
   */
  noteCancelActor: (actorId: string) => void;
  /**
   * Timekeeper mode only, absent in a two-athlete match: this phone's
   * athlete id. Its presence switches every step channel to the
   * timekeeper-mode cancel (`useStepMatchSync`): the `match_cancelled` this
   * phone sends carries it as `actor_id`, and one it receives is recorded and
   * re-read instead of reaching the step's own handler.
   */
  timekeeperModeSelfId?: string;
}

/** What a provider passes: the timekeeper-mode `noteCancelActor` may be left out (a no-op then). */
type MatchSyncProviderValue = Omit<MatchSyncContextValue, "noteCancelActor"> &
  Partial<Pick<MatchSyncContextValue, "noteCancelActor">>;

const MatchSyncContext = React.createContext<MatchSyncProviderValue | null>(null);

export const MatchSyncProvider = MatchSyncContext.Provider;

/** The wizard's reconciler hooks, or no-ops outside a wizard (unit tests
 * render single steps without one). Stable for as long as the provided value is. */
export function useMatchSyncContext(): MatchSyncContextValue {
  const ctx = React.useContext(MatchSyncContext);
  return React.useMemo(() => {
    if (!ctx) return NOOP;
    const { noteCancelActor = NOOP.noteCancelActor } = ctx;
    return { ...ctx, noteCancelActor };
  }, [ctx]);
}

const NOOP: MatchSyncContextValue = {
  onChannelStatus: () => {},
  reconcileNow: () => {},
  markExiting: () => {},
  subscribeSnapshot: () => () => {},
  noteCancelActor: () => {},
};

type StepSyncParams = Omit<Parameters<typeof useSessionMatchSync>[0], "supabase" | "onStatus">;

/**
 * `useSessionMatchSync` for a wizard step: the same per-step channel, with
 * its status transitions reported to the wizard's reconciler so a (re)join,
 * which is exactly when broadcasts may have been missed, re-syncs the step
 * from the DB (jits-bmei).
 *
 * Timekeeper mode (`timekeeperModeSelfId` provided), for the cancel only:
 * a received `match_cancelled` never reaches the step's own handler (which
 * would exit with the shipped toast); it records its `actor_id` and re-reads
 * (M-R8), so the cancelled snapshot exits with its reason and, for an
 * athlete's Leave, that athlete's name (TK-E1). The `match_cancelled` this
 * phone sends names this phone's athlete unless the caller names someone.
 * A two-athlete match gets exactly the hook as it was: the step's handlers
 * and the payload without `actor_id`.
 */
export function useStepMatchSync(params: StepSyncParams) {
  const { onChannelStatus, reconcileNow, noteCancelActor, timekeeperModeSelfId } = useMatchSyncContext();
  const timekeeperMode = timekeeperModeSelfId != null;
  const observeCancel = React.useCallback(
    (actorId?: string) => {
      if (actorId) noteCancelActor(actorId);
      reconcileNow();
    },
    [noteCancelActor, reconcileNow],
  );
  const sync = useSessionMatchSync({
    supabase,
    ...params,
    onStatus: onChannelStatus,
    ...(timekeeperMode ? { onMatchCancelled: observeCancel } : {}),
  });
  const sendCancel = sync.broadcastMatchCancelled;
  const broadcastMatchCancelled = React.useCallback(
    (actorId?: string | null) => sendCancel(actorId ?? timekeeperModeSelfId),
    [sendCancel, timekeeperModeSelfId],
  );
  return timekeeperMode ? { ...sync, broadcastMatchCancelled } : sync;
}
