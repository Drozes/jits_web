import * as React from "react";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "./live-view-state";
import type { MatchStep } from "./step-router";

/**
 * The step the wizard shows (spec 4.2 End, PM1; board P-TK-B7 frame 5). On a
 * phone that never ends the clock (`holdsEnd`: a timekeeper-mode athlete,
 * `caps.endVia` null), the DB's move from `live` to the result waiting view
 * keeps the live step on screen for OPPONENT_ENDED_INTERSTITIAL_MS, frozen on
 * the ended plate (`{NAME} ENDED THE MATCH`, `FINAL CLOCK`; the live step
 * froze it on the read that made the move, `useLiveReceivePolicy`), as a
 * two-athlete match holds that plate after the opponent's end. Without the
 * hold the plate would flash for one re-read, or never show when the read
 * came before the broadcast.
 *
 * Only the screen waits: the wizard's own step (its reconciler, its poll,
 * the recorder it stopped on leaving live) is already `result`, and any
 * further move (a result recorded meanwhile) shows at once. The hold starts
 * on the step move, which on such a phone only a DB read makes (M-R8: a
 * broadcast never moves it). Every other phone, move and mount gets `step`
 * unchanged, so a two-athlete match and the timekeeper see no difference.
 */
export function useLiveEndHold(step: MatchStep | null, holdsEnd: boolean): MatchStep | null {
  // The step at the last render, to see the move during the render that
  // brings it (React's "information from previous renders" pattern), so the
  // result never paints for a frame before the hold.
  const [prevStep, setPrevStep] = React.useState(step);
  const [holding, setHolding] = React.useState(false);
  if (step !== prevStep) {
    setPrevStep(step);
    setHolding(holdsEnd && prevStep === "live" && step === "result");
  }
  React.useEffect(() => {
    if (!holding) return;
    const t = setTimeout(() => setHolding(false), OPPONENT_ENDED_INTERSTITIAL_MS);
    return () => clearTimeout(t);
  }, [holding]);
  return holding && step === "result" ? "live" : step;
}
