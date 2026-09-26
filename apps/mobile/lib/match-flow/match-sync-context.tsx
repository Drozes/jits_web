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
  subscribeSnapshot: (listener: SnapshotListener) => () => void;
}

/** What a snapshot listener learns about the read besides the row. */
export interface SnapshotMeta {
  /** `Date.now()` when the read was issued (see `ReconcileSnapshot.sentAt`). */
  sentAt: number;
}

export type SnapshotListener = (match: MatchDetails, meta: SnapshotMeta) => void;

const MatchSyncContext = React.createContext<MatchSyncContextValue | null>(null);

export const MatchSyncProvider = MatchSyncContext.Provider;

/** The wizard's reconciler hooks, or no-ops outside a wizard (unit tests
 * render single steps without one). */
export function useMatchSyncContext(): MatchSyncContextValue {
  const ctx = React.useContext(MatchSyncContext);
  return ctx ?? NOOP;
}

const NOOP: MatchSyncContextValue = {
  onChannelStatus: () => {},
  reconcileNow: () => {},
  markExiting: () => {},
  subscribeSnapshot: () => () => {},
};

type StepSyncParams = Omit<Parameters<typeof useSessionMatchSync>[0], "supabase" | "onStatus">;

/**
 * `useSessionMatchSync` for a wizard step: the same per-step channel, with
 * its status transitions reported to the wizard's reconciler so a (re)join,
 * which is exactly when broadcasts may have been missed, re-syncs the step
 * from the DB (jits-bmei).
 */
export function useStepMatchSync(params: StepSyncParams) {
  const { onChannelStatus } = useMatchSyncContext();
  return useSessionMatchSync({ supabase, ...params, onStatus: onChannelStatus });
}
