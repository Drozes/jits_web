import { useEffect, useRef, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSessionMatchChannel,
  SESSION_MATCH_EVENTS as E,
  type BroadcastResult,
  type SessionMatchChannel,
  type SessionMatchHandlers,
} from "./session-match-channel";

// Re-exported so existing `@jits/shared/hooks/use-session-match-sync` imports
// keep resolving. The protocol itself lives in `session-match-channel.ts`.
export {
  createSessionMatchChannel,
  settleWithin,
  SESSION_MATCH_EVENTS,
  sessionMatchTopic,
  type BroadcastResult,
  type SessionMatchChannel,
  type SessionMatchEvent,
  type SessionMatchHandlers,
} from "./session-match-channel";

interface UseSessionMatchSyncParams extends SessionMatchHandlers {
  supabase: SupabaseClient;
  matchId: string;
  /**
   * Every subscribe status transition of the underlying channel
   * ("SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"). Optional and
   * read through a ref, so changing it never re-subscribes. Mobile uses it
   * to re-sync from the DB whenever the channel (re)joins, which is exactly
   * when broadcasts may have been missed.
   */
  onStatus?: (status: string, err?: Error) => void;
}

/**
 * Per-step in-match realtime channel. Mounts `session-match:<matchId>` for
 * the component's lifetime and removes it on unmount; a thin React wrapper
 * over `createSessionMatchChannel`.
 *
 * Every `broadcast*` returns the send's settle promise (it never rejects).
 * Callers that are about to unmount the step that owns this channel should
 * await it, bounded with `settleWithin`, so the event actually leaves the
 * device first; everyone else can keep ignoring it.
 */
export function useSessionMatchSync(params: UseSessionMatchSyncParams) {
  const handleRef = useRef<SessionMatchChannel | null>(null);
  const cbRefs = useRef(params);
  cbRefs.current = params;

  const { supabase, matchId } = params;

  useEffect(() => {
    const handle = createSessionMatchChannel(supabase, matchId, () => cbRefs.current, {
      onStatus: (status, err) => cbRefs.current.onStatus?.(status, err),
    });
    handleRef.current = handle;
    return () => {
      handle.remove();
    };
  }, [supabase, matchId]);

  const send = useCallback((event: string, payload: Record<string, unknown>): Promise<unknown> => {
    const handle = handleRef.current;
    if (!handle) return Promise.resolve(undefined);
    try {
      // Normalise: a synchronous return (or throw) from the transport still
      // yields a promise that never rejects.
      return Promise.resolve(handle.send(event, payload)).catch((error: unknown) => ({ error }));
    } catch (error) {
      return Promise.resolve({ error });
    }
  }, []);

  return {
    broadcastTimerStarted: useCallback((startedAt: string) => send(E.TIMER_STARTED, { started_at: startedAt }), [send]),
    broadcastTimerPaused: useCallback((pausedAt: string) => send(E.TIMER_PAUSED, { paused_at: pausedAt }), [send]),
    broadcastTimerResumed: useCallback((d: number) => send(E.TIMER_RESUMED, { total_paused_duration: d }), [send]),
    broadcastMatchEnded: useCallback(() => send(E.MATCH_ENDED, {}), [send]),
    broadcastReady: useCallback((athleteId: string) => send(E.READY_SIGNAL, { athlete_id: athleteId }), [send]),
    broadcastResultSubmitted: useCallback((r: BroadcastResult) => send(E.RESULT_SUBMITTED, r as unknown as Record<string, unknown>), [send]),
    broadcastResultConfirmed: useCallback((athleteId: string) => send(E.RESULT_CONFIRMED, { athlete_id: athleteId }), [send]),
    broadcastMatchCancelled: useCallback(() => send(E.MATCH_CANCELLED, {}), [send]),
    broadcastMatchDisputed: useCallback((athleteId: string) => send(E.MATCH_DISPUTED, { athlete_id: athleteId }), [send]),
  };
}
