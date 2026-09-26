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
}

/**
 * Per-step in-match realtime channel. Mounts `session-match:<matchId>` for
 * the component's lifetime and removes it on unmount; a thin React wrapper
 * over `createSessionMatchChannel`.
 */
export function useSessionMatchSync(params: UseSessionMatchSyncParams) {
  const handleRef = useRef<SessionMatchChannel | null>(null);
  const cbRefs = useRef(params);
  cbRefs.current = params;

  const { supabase, matchId } = params;

  useEffect(() => {
    const handle = createSessionMatchChannel(supabase, matchId, () => cbRefs.current);
    handleRef.current = handle;
    return () => {
      handle.remove();
    };
  }, [supabase, matchId]);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    // Fire and forget, as before the extraction.
    void handleRef.current?.send(event, payload);
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
  };
}
