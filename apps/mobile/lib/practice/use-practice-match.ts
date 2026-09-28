import * as React from "react";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import {
  BOT_ACCEPT_MS,
  BOT_CONFIRM_MS,
  BOT_READY_MS,
  type PracticePhase,
} from "./constants";

export interface PracticeState {
  phase: PracticePhase;
  userReady: boolean;
  botReady: boolean;
  /** Same shape the real confirm step reads, so its leaves reuse as-is. */
  result: BroadcastResult | null;
  botConfirmed: boolean;
  /** Practice clock at End Match; prefills the result's finish time. */
  finishSeconds: number | null;
}

export type PracticeAction =
  | { type: "GO_LIVE" }
  | { type: "GO_OFFLINE" }
  | { type: "CHALLENGE" }
  | { type: "CANCEL" }
  | { type: "BOT_ACCEPTED" }
  | { type: "CONFIRM_WEIGHTS" }
  | { type: "USER_READY" }
  | { type: "BOT_READY" }
  | { type: "END_MATCH"; finishSeconds?: number }
  | { type: "ENDED" }
  | { type: "SUBMIT_RESULT"; result: BroadcastResult }
  | { type: "BOT_CONFIRMED" }
  | { type: "USER_CONFIRM" }
  | { type: "RESET" };

export const INITIAL_PRACTICE_STATE: PracticeState = {
  phase: "offline",
  userReady: false,
  botReady: false,
  result: null,
  botConfirmed: false,
  finishSeconds: null,
};

/**
 * The whole practice flow. Each action is honored only from the phase it
 * belongs to, so a late bot timer or a double tap can never skip a step.
 * Both athletes ready moves straight to live, like the real ready check.
 */
export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  const { phase } = state;
  switch (action.type) {
    case "GO_LIVE":
      return phase === "offline" ? { ...state, phase: "lobby" } : state;
    case "GO_OFFLINE":
      return phase === "lobby" ? { ...state, phase: "offline" } : state;
    case "CHALLENGE":
      return phase === "lobby" ? { ...state, phase: "waiting" } : state;
    case "CANCEL":
      return phase === "waiting" || phase === "ready"
        ? { ...state, phase: "lobby", userReady: false, botReady: false }
        : state;
    case "BOT_ACCEPTED":
      return phase === "waiting" ? { ...state, phase: "weight" } : state;
    case "CONFIRM_WEIGHTS":
      return phase === "weight" ? { ...state, phase: "ready" } : state;
    case "USER_READY":
      if (phase !== "ready") return state;
      return { ...state, userReady: true, phase: state.botReady ? "live" : "ready" };
    case "BOT_READY":
      if (phase !== "ready") return state;
      return { ...state, botReady: true, phase: state.userReady ? "live" : "ready" };
    case "END_MATCH":
      return phase === "live"
        ? { ...state, phase: "end", finishSeconds: action.finishSeconds ?? null }
        : state;
    case "ENDED":
      return phase === "end" ? { ...state, phase: "result" } : state;
    case "SUBMIT_RESULT":
      return phase === "result" ? { ...state, phase: "confirm", result: action.result } : state;
    case "BOT_CONFIRMED":
      return phase === "confirm" ? { ...state, botConfirmed: true } : state;
    case "USER_CONFIRM":
      return phase === "confirm" ? { ...state, phase: "summary" } : state;
    case "RESET":
      return INITIAL_PRACTICE_STATE;
  }
}

/** Which bot move each phase schedules on entry. This is the entire bot. */
const BOT_MOVES: Partial<Record<PracticePhase, { ms: number; action: PracticeAction }>> = {
  waiting: { ms: BOT_ACCEPT_MS, action: { type: "BOT_ACCEPTED" } },
  ready: { ms: BOT_READY_MS, action: { type: "BOT_READY" } },
  confirm: { ms: BOT_CONFIRM_MS, action: { type: "BOT_CONFIRMED" } },
};

/**
 * Practice state plus the scripted bot. The bot's timer is cleared on every
 * phase change and on unmount, so a cancel or an exit never lets it fire.
 */
export function usePracticeMatch() {
  const [state, dispatch] = React.useReducer(practiceReducer, INITIAL_PRACTICE_STATE);
  const { phase } = state;

  React.useEffect(() => {
    const move = BOT_MOVES[phase];
    if (!move) return;
    const t = setTimeout(() => dispatch(move.action), move.ms);
    return () => clearTimeout(t);
  }, [phase]);

  return { state, dispatch };
}
