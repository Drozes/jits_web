import * as React from "react";
import { BackHandler } from "react-native";
import { useFaceoffLeave } from "./use-faceoff-leave";

interface CrewLeaveParams {
  matchId: string;
  /** Where the wizard's exits go. */
  exitHref: string;
}

/** Nothing to tell the other phone: it has no match channel on `crew`, and its reconciler sees the cancel (the `matches` row event and the crew poll). */
const NO_BROADCAST = () => Promise.resolve(undefined);

/**
 * The `crew` step's Leave (timekeeper mode spec 4.3, "Picking"): while
 * nobody is seated an athlete's Leave cancels the match for both, as today
 * (`cancel_session_match`, `cancel_reason = 'athlete_left'`), after the
 * shipped confirmation (`Cancel match?` / `Your opponent will be returned to
 * the lobby.`; TK-E4 replaces the body only once a timekeeper is seated, on
 * the face-off). It is the face-off's Leave (`useFaceoffLeave`): the same
 * alert, failure toast and exit through `exitMatchTo`.
 *
 * Android back is the same control while the step is up: it confirms and
 * cancels, and never pops the route on its own (leaving without cancelling
 * left the match pending with nobody in it, jits-bh2v). iOS has no swipe back
 * on `crew` (the route's `NO_SWIPE_STEPS`).
 */
export function useCrewLeave({ matchId, exitHref }: CrewLeaveParams): { cancelling: boolean; leave: () => void } {
  // The match cannot start while the athletes pick: Start needs a seated timekeeper.
  const startedRef = React.useRef(false);
  const cancelledRef = React.useRef(false);
  const { cancelling, leave } = useFaceoffLeave({
    matchId,
    exitHref,
    startedRef,
    cancelledRef,
    broadcastMatchCancelled: NO_BROADCAST,
  });

  React.useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  return { cancelling, leave };
}
