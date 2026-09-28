import { Platform } from "react-native";
import { supabase } from "@/lib/supabase/client";
import {
  logHighlightShareEvent,
  type HighlightShareStep,
} from "@jits/shared/api/highlight-share";

/**
 * Fire-and-forget funnel telemetry for the discovery and viewer surfaces that
 * sit outside the share module (the Profile row, the viewer's open and
 * improve steps). Adds `platform`; the wrapper swallows every error, so this
 * never throws and never blocks the UI.
 */
export function logHighlightEvent(
  highlightId: string,
  step: HighlightShareStep,
  detail: Record<string, string | number | boolean | null> = {},
): void {
  void logHighlightShareEvent(supabase, highlightId, step, { ...detail, platform: Platform.OS });
}
