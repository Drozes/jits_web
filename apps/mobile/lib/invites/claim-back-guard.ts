import * as React from "react";
import { BackHandler } from "react-native";
import type { RunnerState } from "./use-claim-runner";

/**
 * Claim phases with work in flight: reading the invite, the location fix, the
 * claim write, the date-of-birth save. Leaving mid-way would strand a claim
 * the server may already have booked, so the Android back is held until the
 * runner settles (jits-mafl.2 M7). Idle (the "Open this invite?" confirm) and
 * every settled step let the back through.
 */
export function isClaimInFlight(phase: RunnerState["phase"]): boolean {
  return phase === "checking" || phase === "locating" || phase === "claiming" || phase === "saving_dob";
}

/** The longest the back is held in one in-flight phase (review N4). */
export const CLAIM_BACK_HOLD_MAX_MS = 30_000;

/**
 * The route's `gestureEnabled: false` (`app/(app)/_layout.tsx`) stops only the
 * iOS swipe; Android's hardware back still popped the claim mid-flight. This
 * consumes it while `isClaimInFlight(phase)`. The face-off and the match flow
 * keep their own back handling.
 */
export function useClaimBackGuard(phase: RunnerState["phase"]): void {
  const inFlight = isClaimInFlight(phase);
  React.useEffect(() => {
    if (!inFlight) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    // Watchdog: a phase that never settles must not trap the athlete on this
    // screen. Each new in-flight phase restarts it.
    const watchdog = setTimeout(() => sub.remove(), CLAIM_BACK_HOLD_MAX_MS);
    return () => {
      clearTimeout(watchdog);
      sub.remove();
    };
  }, [inFlight, phase]);
}
