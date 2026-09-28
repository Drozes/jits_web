import * as React from "react";
import type { HighlightPhase } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { VIEWER_COPY } from "./viewer-copy";
import { ViewerMessage } from "./viewer-states";

/** The viewer's copy for a reel with NO playable live version, by phase. */
const PHASE_STATE: Record<Exclude<HighlightPhase, "ready" | "regenerating">, { testID: string; message: string }> = {
  disabled: { testID: "viewer-paused", message: VIEWER_COPY.paused },
  unavailable: { testID: "viewer-invalidated", message: HIGHLIGHT_COPY.invalidated },
  invalidated: { testID: "viewer-invalidated", message: HIGHLIGHT_COPY.invalidated },
  waiting_for_analysis: { testID: "viewer-making", message: VIEWER_COPY.making },
  planning: { testID: "viewer-making", message: VIEWER_COPY.making },
  rendering: { testID: "viewer-making", message: VIEWER_COPY.making },
  failed: { testID: "viewer-failed", message: HIGHLIGHT_COPY.failed },
  none: { testID: "viewer-none", message: HIGHLIGHT_COPY.none },
};

/**
 * A calm message while the reel has no live version. The screen keeps
 * following progress (realtime + 15 s polling while the reel is moving), so
 * the moment a live version lands the player replaces this in place.
 */
export function ViewerProgressState({ phase }: { phase: HighlightPhase }) {
  const state =
    phase === "ready" || phase === "regenerating" ? PHASE_STATE.invalidated : PHASE_STATE[phase];
  return <ViewerMessage testID={state.testID} message={state.message} />;
}
