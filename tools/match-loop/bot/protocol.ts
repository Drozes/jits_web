/**
 * The realtime protocol, imported from the app rather than re-spelled, so the
 * bot cannot drift from what the app actually listens to.
 */
export {
  LOBBY_TOPIC,
  challengeTopic,
} from "../../../apps/mobile/lib/arena/constants";
export {
  SESSION_MATCH_EVENTS,
  sessionMatchTopic,
  createSessionMatchChannel,
  actorPayload,
  BROADCAST_ACTOR_KEY,
  type BroadcastResult,
  type SessionMatchChannel,
  type SessionMatchEvent,
  settleWithin,
} from "@jits/shared/hooks/session-match-channel";

/**
 * The mobile wizard's DB reconciliation, imported (it is pure) so the bot
 * advances on exactly the snapshots the app advances on. In particular a
 * `completed` row alone maps to `confirm`, never `summary`: only a
 * `disputed` row or a confirmation from BOTH athletes finishes confirm.
 */
export { matchSnapshot, pollIntervalFor, targetFor, type ReconcileRoles } from "../../../apps/mobile/lib/match-flow/reconcile";
export { MATCH_STEPS, type MatchStep } from "../../../apps/mobile/lib/match-flow/step-router";

import { BROADCAST_ACTOR_KEY, SESSION_MATCH_EVENTS } from "@jits/shared/hooks/session-match-channel";

/**
 * App timing constants that live in modules the bot cannot import (they pull
 * in React Native). `tests/protocol.test.ts` reads the app sources and fails
 * when these drift.
 */
export const APP_TIMING = {
  /** `SEND_GRACE_MS` (apps/mobile/lib/match-flow/match-sync-context.tsx): how
   * long a step waits for an awaited send before it unmounts the channel. */
  SEND_GRACE_MS: 1_500,
  /** `FACEOFF_REPEAT_MS` (apps/mobile/lib/match-flow/use-faceoff.ts, the ready check):
   * a ready athlete repeats ready_signal until the opponent's arrives. */
  READY_REPEAT_MS: 3_000,
  /** `ADVANCE_AFTER_CONFIRM_MS` (apps/mobile/components/match-flow/steps/confirm-step.tsx):
   * how long the confirm step shows CONFIRMED before it moves on to the
   * summary. Since jits-02vo.7 the app starts it on this athlete's own
   * confirm; the bot still starts it once both have confirmed
   * (`confirmDecision`). ACCEPTED DRIFT (jits-c3vd, recorded by M7,
   * jits-o47s.9): the bot is never the app under test, and keeping its
   * confirm step (and its confirm channel) mounted until both confirmed is
   * what lets the hard oracle `bot:confirm-channel-received-blue-result_confirmed`
   * observe Blue's broadcast. Moving it earlier would change no DB outcome
   * and nothing Blue sees (the bot sends result_confirmed on its own
   * confirm either way); it would only remove that delivery check. */
  CONFIRM_ADVANCE_MS: 1_500,
  /** `COUNTDOWN_MS` (apps/mobile/components/match-flow/countdown/countdown.tsx):
   * the 3-2-1 in front of the live step. GO is the server's `started_at`
   * plus this (never more than this after the stage mounted), the clock runs
   * from GO, and until GO the live step (End, Pause, its channel) is not
   * mounted at all (`LiveStage`). */
  COUNTDOWN_MS: 3_000,
  /** `ACCEPTED_FALLBACK_MS` (apps/mobile/lib/arena/use-arena-challenge.ts): how
   * long a challenger lets its challenge sit at `accepted` before it starts
   * the match itself (the accepter's start failed or its app died). */
  ACCEPTED_FALLBACK_MS: 12_000,
} as const;

/** App-wide presence tier (apps/mobile/lib/presence/use-online-presence.ts). */
export const APP_ONLINE_TOPIC = "app:online";

/** Events on `arena-challenge:<id>` (apps/mobile/lib/arena/use-arena-challenge.ts). */
export const CHALLENGE_EVENTS = {
  MATCH_STARTED: "match_started",
  DECLINED: "declined",
} as const;

type Validator = (p: Record<string, unknown>) => string | null;

const isStr = (v: unknown) => typeof v === "string" && v.length > 0;
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/**
 * Payload shape per event. Returns an error string for a malformed payload.
 * Unknown events are reported by the protocol oracle separately.
 */
export const PAYLOAD_VALIDATORS: Record<string, Validator> = {
  [SESSION_MATCH_EVENTS.TIMER_STARTED]: (p) =>
    isStr(p.started_at) && !Number.isNaN(Date.parse(String(p.started_at))) ? null : "started_at not an ISO string",
  [SESSION_MATCH_EVENTS.TIMER_PAUSED]: (p) => (isStr(p.paused_at) ? null : "paused_at missing"),
  [SESSION_MATCH_EVENTS.TIMER_RESUMED]: (p) =>
    isNum(p.total_paused_duration) ? null : "total_paused_duration not a number",
  [SESSION_MATCH_EVENTS.MATCH_ENDED]: () => null,
  [SESSION_MATCH_EVENTS.READY_SIGNAL]: (p) => (isStr(p.athlete_id) ? null : "athlete_id missing"),
  [SESSION_MATCH_EVENTS.RESULT_SUBMITTED]: (p) => {
    if (p.result !== "submission" && p.result !== "draw") return `bad result ${String(p.result)}`;
    if (p.result === "submission") {
      if (!isStr(p.winnerId)) return "submission without winnerId";
      if (!isStr(p.submissionCode)) return "submission without submissionCode";
      if (!isNum(p.finishTimeSeconds)) return "submission without finishTimeSeconds";
    }
    return null;
  },
  [SESSION_MATCH_EVENTS.RESULT_CONFIRMED]: (p) => (isStr(p.athlete_id) ? null : "athlete_id missing"),
  [SESSION_MATCH_EVENTS.MATCH_CANCELLED]: () => null,
  [SESSION_MATCH_EVENTS.MATCH_DISPUTED]: (p) => (isStr(p.athlete_id) ? null : "athlete_id missing"),
  // Match-flow redesign. Presentational and repeated; weight may be null.
  [SESSION_MATCH_EVENTS.WEIGHED_IN]: (p) =>
    !isStr(p.athlete_id) ? "athlete_id missing" : p.weight === null || isNum(p.weight) ? null : "weight not a number",
  [SESSION_MATCH_EVENTS.RECORDING_OPTIN]: (p) =>
    !isStr(p.athlete_id) ? "athlete_id missing" : typeof p.recording === "boolean" ? null : "recording not a boolean",
  [SESSION_MATCH_EVENTS.RESULT_CLAIMED]: (p) =>
    !isStr(p.athlete_id)
      ? "athlete_id missing"
      : !isNum(p.claimed_at)
        ? "claimed_at not a number"
        : p.supersedes === undefined || isNum(p.supersedes)
          ? null
          : "supersedes not a number",
  [CHALLENGE_EVENTS.MATCH_STARTED]: (p) => (isStr(p.matchId) ? null : "matchId missing"),
  [CHALLENGE_EVENTS.DECLINED]: () => null,
};

/**
 * Timekeeper mode (spec 10, PM1): the clock events, the cancel and the result
 * may carry `actor_id` (who acted). Additive, so a payload without one is
 * valid as before; one that carries it must name somebody.
 */
const ACTOR_EVENTS: ReadonlySet<string> = new Set([
  SESSION_MATCH_EVENTS.TIMER_STARTED,
  SESSION_MATCH_EVENTS.TIMER_PAUSED,
  SESSION_MATCH_EVENTS.TIMER_RESUMED,
  SESSION_MATCH_EVENTS.MATCH_ENDED,
  SESSION_MATCH_EVENTS.RESULT_SUBMITTED,
  SESSION_MATCH_EVENTS.MATCH_CANCELLED,
]);

export function validatePayload(event: string, payload: unknown): string | null {
  const v = PAYLOAD_VALIDATORS[event];
  if (!v) return `unknown event ${event}`;
  const p = (payload ?? {}) as Record<string, unknown>;
  if (BROADCAST_ACTOR_KEY in p) {
    if (!ACTOR_EVENTS.has(event)) return `${BROADCAST_ACTOR_KEY} on ${event}, which never carries one`;
    if (!isStr(p[BROADCAST_ACTOR_KEY])) return `${BROADCAST_ACTOR_KEY} not a non-empty string`;
  }
  return v(p);
}

/**
 * Timekeeper-mode timing the bot mirrors. The heartbeat is fixed by the spec
 * (R23: every 15 s while seated and foregrounded); `tests/timekeeper.test.ts`
 * pins it to the app's presence hook once slice M4 adds it
 * (`apps/mobile/lib/match-flow/use-timekeeper-presence.ts`). The send
 * ceiling is PM29's, pinned the same way to `lib/match-flow/send-timing.ts`
 * once the PM29 change adds it.
 */
export const TK_TIMING = {
  /** `touch_match_timekeeper` cadence while seated (R23). */
  HEARTBEAT_MS: 15_000,
  /**
   * `SEND_CEILING_MS` (PM29 (1)): how long a timekeeper-mode server press
   * (the athlete's Confirm among them) stays busy with no reply before it
   * ends as failed and its buttons come back.
   */
  SEND_CEILING_MS: 20_000,
} as const;
