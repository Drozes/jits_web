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
  type BroadcastResult,
  type SessionMatchChannel,
  type SessionMatchEvent,
} from "@jits/shared/hooks/session-match-channel";

import { SESSION_MATCH_EVENTS } from "@jits/shared/hooks/session-match-channel";

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
  [CHALLENGE_EVENTS.MATCH_STARTED]: (p) => (isStr(p.matchId) ? null : "matchId missing"),
  [CHALLENGE_EVENTS.DECLINED]: () => null,
};

export function validatePayload(event: string, payload: unknown): string | null {
  const v = PAYLOAD_VALIDATORS[event];
  if (!v) return `unknown event ${event}`;
  return v((payload ?? {}) as Record<string, unknown>);
}
