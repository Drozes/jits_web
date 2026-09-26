import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * The in-match realtime protocol, framework-free.
 *
 * `useSessionMatchSync` (the React hook both apps mount per wizard step) is a
 * thin wrapper around `createSessionMatchChannel`. Keeping the channel wiring
 * here, with no React import, is what lets a non-React client (the headless
 * match-loop opponent bot under `tools/match-loop/`) speak exactly the same
 * protocol as the apps instead of re-spelling topic and event names that
 * would then drift.
 */

/** Every broadcast event on the `session-match:<matchId>` channel. */
export const SESSION_MATCH_EVENTS = {
  TIMER_STARTED: "timer_started",
  TIMER_PAUSED: "timer_paused",
  TIMER_RESUMED: "timer_resumed",
  MATCH_ENDED: "match_ended",
  READY_SIGNAL: "ready_signal",
  RESULT_SUBMITTED: "result_submitted",
  RESULT_CONFIRMED: "result_confirmed",
  MATCH_CANCELLED: "match_cancelled",
} as const;

export type SessionMatchEvent =
  (typeof SESSION_MATCH_EVENTS)[keyof typeof SESSION_MATCH_EVENTS];

/** The per-match broadcast topic. */
export const sessionMatchTopic = (matchId: string) => `session-match:${matchId}`;

export interface BroadcastResult {
  result: "submission" | "draw";
  winnerId?: string;
  submissionCode?: string;
  finishTimeSeconds?: number;
}

export interface SessionMatchHandlers {
  onTimerStarted?: (startedAt: string) => void;
  onTimerPaused?: (pausedAt: string) => void;
  onTimerResumed?: (totalPausedDuration: number) => void;
  onMatchEnded?: () => void;
  onReadySignal?: (athleteId: string) => void;
  onResultSubmitted?: (result: BroadcastResult) => void;
  onResultConfirmed?: (athleteId: string) => void;
  onMatchCancelled?: () => void;
}

export interface SessionMatchChannel {
  /** The underlying realtime channel (registered on `supabase`). */
  readonly channel: RealtimeChannel;
  /** True once the websocket JOIN has completed and until `remove()`. */
  isSubscribed: () => boolean;
  /**
   * Broadcast an event. Websocket push once joined; before that, the
   * explicit httpSend REST path (see `send` below for why). Resolves with
   * realtime-js's own status: "ok" | "error" | "timed out" for the websocket
   * path, `{ success }` for httpSend. The hook ignores it (fire and forget);
   * non-React callers can await it.
   */
  send: (event: string, payload: Record<string, unknown>) => Promise<unknown>;
  /** Mark unsubscribed and remove the channel from the client. */
  remove: () => void;
}

export interface CreateSessionMatchChannelOptions {
  /** Every subscribe status transition, for callers that trace them. */
  onStatus?: (status: string, err?: Error) => void;
}

/**
 * Open the `session-match:<matchId>` channel and bind every protocol event.
 *
 * `handlers` may be an object or a getter. The hook passes a getter over a
 * ref so it always calls the latest callbacks without re-subscribing.
 */
export function createSessionMatchChannel(
  supabase: SupabaseClient,
  matchId: string,
  handlers: SessionMatchHandlers | (() => SessionMatchHandlers),
  options: CreateSessionMatchChannelOptions = {},
): SessionMatchChannel {
  const h = typeof handlers === "function" ? handlers : () => handlers;
  // Tracks whether the websocket JOIN has completed. Broadcasts fired before
  // this is true would otherwise trip realtime-js's REST fallback warning, so
  // they are routed through the explicit httpSend REST path instead.
  let subscribed = false;

  const E = SESSION_MATCH_EVENTS;
  const channel = supabase
    .channel(sessionMatchTopic(matchId))
    .on("broadcast", { event: E.TIMER_STARTED }, ({ payload }) => {
      h().onTimerStarted?.(payload.started_at as string);
    })
    .on("broadcast", { event: E.TIMER_PAUSED }, ({ payload }) => {
      h().onTimerPaused?.(payload.paused_at as string);
    })
    .on("broadcast", { event: E.TIMER_RESUMED }, ({ payload }) => {
      h().onTimerResumed?.(payload.total_paused_duration as number);
    })
    .on("broadcast", { event: E.MATCH_ENDED }, () => {
      h().onMatchEnded?.();
    })
    .on("broadcast", { event: E.READY_SIGNAL }, ({ payload }) => {
      h().onReadySignal?.(payload.athlete_id as string);
    })
    .on("broadcast", { event: E.RESULT_SUBMITTED }, ({ payload }) => {
      h().onResultSubmitted?.(payload as BroadcastResult);
    })
    .on("broadcast", { event: E.RESULT_CONFIRMED }, ({ payload }) => {
      h().onResultConfirmed?.(payload.athlete_id as string);
    })
    .on("broadcast", { event: E.MATCH_CANCELLED }, () => {
      h().onMatchCancelled?.();
    })
    .subscribe((status, err) => {
      subscribed = status === "SUBSCRIBED";
      options.onStatus?.(status, err);
    });

  return {
    channel,
    isSubscribed: () => subscribed,
    // Use the websocket push once joined; otherwise use the explicit httpSend
    // REST path. Both deliver to subscribers; httpSend avoids the realtime-js
    // "send() falling back to REST" warning that fires when send() is called
    // before JOIN completes.
    send: (event, payload) => {
      if (subscribed) {
        return channel.send({ type: "broadcast", event, payload });
      }
      return channel.httpSend(event, payload);
    },
    remove: () => {
      subscribed = false;
      void supabase.removeChannel(channel);
    },
  };
}
