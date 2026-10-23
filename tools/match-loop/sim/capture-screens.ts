/**
 * The capture policy as the simulator can see it (T14; A21 to A23, slice
 * M9): the app staying portrait. The ready step's framing hint (TK-REC2) is
 * not read here: it shows only beside a granted camera's preview, which no
 * harness run has; slice M9 added `READY_CAPTURE_HINT` to `sim/screens.ts`
 * and pins its words in `tests/label-contract.test.ts`.
 */
import type { AXElement, Query } from "./idb";

/**
 * Whether the app's window is portrait in this screen read (pure, for
 * tests): the Application element's frame is taller than wide. A
 * portrait-locked app keeps that frame when the device rotates; an app that
 * follows the device reports it landscape (measured with Safari on the
 * iPhone 17 Pro simulator: 874x402 once turned).
 */
export function portraitIn(els: AXElement[]): boolean {
  const app = els.find((e) => e.type === "Application");
  return !!app && app.frame.height > app.frame.width;
}

/** The practice bot's name (`PRACTICE_BOT_NAME`, apps/mobile/lib/practice/constants.ts; pinned by tests/timekeeper.test.ts). */
export const PRACTICE_PARTNER = "Practice Partner";

/**
 * Practice's controls (app/(app)/practice.tsx and components/practice/*;
 * pinned by tests/timekeeper.test.ts). Practice opens offline in its own
 * local lobby: Go live there (the Arena's GoLivePlate, local only), then
 * the partner's Challenge row.
 */
export const PRACTICE_UI = {
  goLive: { label: "Go live", type: "Button", enabled: true },
  /**
   * The practice tip's kicker (practice-steps.tsx). Its plate's testID
   * (`practice-tip`) is on a View that is not an accessibility element, so
   * idb never reports it; the kicker text is what shows.
   */
  tip: { label: "Practice tip", type: "StaticText" },
  /**
   * The pushed header's title, drawn on every phase except live: the marker
   * of practice's non-live chrome. (The Practice tag cannot be: its testID
   * sits on a View idb never reports, and the live HUD shows a PRACTICE
   * label of its own.)
   */
  header: { label: "Practice Match", type: "StaticText" },
  weighIn: { id: "weight-confirm" },
  ready: { id: "ready-button" },
  /** The live HUD's End, drawn only once GO is reached. */
  liveEnd: { id: "live-end" },
  pause: { id: "live-pause-toggle" },
  /** Exit practice: the ghost button off live, the HUD's EXIT on live (one testID). */
  exit: { id: "practice-exit" },
} as const satisfies Record<string, Query>;
