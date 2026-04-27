/**
 * Pure mapping from a match's persisted DB status to the initial wizard step
 * the mobile UI should render. Mirrors the web's `computeInitialStep` but
 * collapses the timekeeper variants since the mobile app does not currently
 * surface timekeeper functionality (Phase 5 polish).
 *
 * Steps (8 total), keyed by short slugs that match the spec's vocabulary:
 *   - `wait`    : transient hold while waiting for opponent (currently unused
 *                 by the orchestrator; kept for future timekeeper support).
 *   - `weight`  : both athletes confirm scale weight before going live.
 *   - `ready`   : ready-check; both athletes tap Ready, then `start_match`
 *                 fires and transitions everyone to `live`.
 *   - `live`    : timer running; pause/resume + end-match.
 *   - `end`     : transient — the moment after End Match before result entry.
 *                 Currently advances straight to `result` (see wizard).
 *   - `result`  : record submission/draw + winner + finish time.
 *   - `confirm` : both athletes confirm or one disputes the recorded result.
 *   - `summary` : final outcome card + ELO delta + nav back to lobby.
 */
export type MatchStep =
  | "wait"
  | "weight"
  | "ready"
  | "live"
  | "end"
  | "result"
  | "confirm"
  | "summary";

export const MATCH_STEPS: readonly MatchStep[] = [
  "wait",
  "weight",
  "ready",
  "live",
  "end",
  "result",
  "confirm",
  "summary",
] as const;

export interface MatchLike {
  status: string;
}

/**
 * Returns the step the wizard should mount in based on persisted match
 * status. Pure / side-effect free so it can be reused in tests.
 *
 * Optional `localSubstate` overrides the inferred step when the local
 * client has progressed past what the DB reflects (e.g. timer ended,
 * waiting for the user to tap submit on result). It must be one of the
 * `MatchStep` values; an unknown value is ignored.
 */
export function getCurrentStep(
  match: MatchLike,
  localSubstate?: MatchStep,
): MatchStep {
  if (localSubstate && MATCH_STEPS.includes(localSubstate)) {
    return localSubstate;
  }
  switch (match.status) {
    case "pending":
      return "weight";
    case "in_progress":
      return "live";
    case "completed":
      return "summary";
    case "disputed":
      // Disputed matches surface in the summary state so users can see
      // what happened and exit; the wizard does not let them re-record.
      return "summary";
    default:
      return "weight";
  }
}
