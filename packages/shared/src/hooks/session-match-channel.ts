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
  /**
   * Sent by the athlete who disputed the recorded result, so the other side
   * leaves the confirm step instead of waiting on a confirmation that will
   * never come (jits-wfpo). Additive: a client that does not bind it simply
   * ignores it, and the mobile reconciler covers a missed one from the DB.
   */
  MATCH_DISPUTED: "match_disputed",
  /**
   * Face-off (mobile match-flow redesign): this athlete confirmed their
   * scale weight. Payload `{ athlete_id, weight }` (lbs, may be null). Purely
   * presentational: nothing in the DB depends on it, and it is repeated until
   * the match starts because a broadcast sent before the other side joined
   * is simply gone.
   */
  WEIGHED_IN: "weighed_in",
  /**
   * Face-off: whether this athlete will record the match from their phone.
   * Payload `{ athlete_id, recording }`. Repeated like `weighed_in`.
   */
  RECORDING_OPTIN: "recording_optin",
  /**
   * Result step: this athlete started entering the result, so the other side
   * shows a waiting view instead of a second form. Payload
   * `{ athlete_id, claimed_at }` (epoch ms). Repeated as a heartbeat while
   * the claimer is on the form; a claim that goes quiet unlocks the other
   * side. Advisory only: `record_match_result` still accepts one result.
   */
  RESULT_CLAIMED: "result_claimed",
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
  /** `athleteId` is the athlete who raised the dispute. */
  onMatchDisputed?: (athleteId: string) => void;
  /** Face-off: `weight` is lbs, or null when the athlete has none on file. */
  onWeighedIn?: (athleteId: string, weight: number | null) => void;
  onRecordingOptIn?: (athleteId: string, recording: boolean) => void;
  /** `claimedAt` is the claimer's epoch ms, used only to break a tie. */
  onResultClaimed?: (athleteId: string, claimedAt: number) => void;
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
   * path, `{ success }` for httpSend. The channel is opened with broadcast
   * `ack: true`, so the websocket "ok" means the server actually received
   * the message, which is what makes awaiting it before tearing the channel
   * down meaningful (jits-mzfu).
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
  // `ack: true` makes a websocket send resolve only once the server has
  // acknowledged the broadcast (instead of the moment it is queued locally),
  // so a caller that awaits it knows the event left the device before it
  // unmounts the step that owns the channel. Receivers are unaffected.
  const channel = supabase
    .channel(sessionMatchTopic(matchId), { config: { broadcast: { ack: true } } })
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
    .on("broadcast", { event: E.MATCH_DISPUTED }, ({ payload }) => {
      h().onMatchDisputed?.(payload.athlete_id as string);
    })
    .on("broadcast", { event: E.WEIGHED_IN }, ({ payload }) => {
      const w = payload.weight;
      h().onWeighedIn?.(payload.athlete_id as string, typeof w === "number" && Number.isFinite(w) ? w : null);
    })
    .on("broadcast", { event: E.RECORDING_OPTIN }, ({ payload }) => {
      h().onRecordingOptIn?.(payload.athlete_id as string, payload.recording === true);
    })
    .on("broadcast", { event: E.RESULT_CLAIMED }, ({ payload }) => {
      const at = payload.claimed_at;
      h().onResultClaimed?.(payload.athlete_id as string, typeof at === "number" && Number.isFinite(at) ? at : 0);
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

/**
 * Resolve with `promise`'s value, or with "timed out" once `ms` elapses,
 * whichever comes first. Never rejects: a rejected send resolves to
 * `{ error }`. Used to give a broadcast a bounded chance to leave the device
 * before the step that owns its channel unmounts, without ever letting a
 * slow or dead socket block the wizard (jits-mzfu).
 */
export function settleWithin<T>(
  promise: PromiseLike<T> | T | undefined,
  ms: number,
): Promise<T | "timed out" | { error: unknown } | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve("timed out"), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (error: unknown) => {
        clearTimeout(t);
        resolve({ error });
      },
    );
  });
}
