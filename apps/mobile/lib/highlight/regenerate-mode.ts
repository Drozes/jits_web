import type { HighlightProgress } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY, highlightErrorCopy, versionsExhausted } from "./highlight-copy";

export type RegenerateMode = "enabled" | "exhausted" | "in_progress" | "paused";

type ModeInput = Pick<HighlightProgress, "phase" | "canRegenerate" | "rendersRemaining">;

/**
 * Which Regenerate the sheet offers (spec 014 section 10). At 0 left it is
 * shown disabled with the exhausted helper; otherwise, when the backend says
 * no (flag off, no plan, render in flight) it is hidden with a helper. While
 * a new version is already rendering the helper says so rather than
 * "paused", which would be untrue.
 */
export function regenerateMode(progress: ModeInput): RegenerateMode {
  if (progress.rendersRemaining <= 0) return "exhausted";
  if (progress.phase === "regenerating") return "in_progress";
  if (!progress.canRegenerate) return "paused";
  return "enabled";
}

export function regenerateHelper(mode: RegenerateMode, renderMax: number): string | null {
  switch (mode) {
    case "exhausted":
      return versionsExhausted(renderMax);
    case "in_progress":
      return highlightErrorCopy({ code: "HIGHLIGHT_RENDER_IN_PROGRESS" });
    case "paused":
      return HIGHLIGHT_COPY.paused;
    default:
      return null;
  }
}
