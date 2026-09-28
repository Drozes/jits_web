import type { HighlightShareStep } from "@jits/shared/api/highlight-share";
import type { HighlightShareEventDetail } from "@jits/shared/constants/highlights";
import { logHighlightEvent } from "@/lib/highlight/highlight-event";

export { deviceDetail } from "@/lib/highlight/highlight-event";

/**
 * Fire-and-forget share-funnel event (device keys added by
 * `logHighlightEvent`). Never throws, never awaited. Caller keys win.
 */
export function track(
  highlightId: string,
  step: HighlightShareStep,
  detail: HighlightShareEventDetail = {},
): void {
  logHighlightEvent(highlightId, step, detail);
}
