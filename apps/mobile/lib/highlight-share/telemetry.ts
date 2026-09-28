import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase/client";
import {
  logHighlightShareEvent,
  type HighlightShareStep,
} from "@jits/shared/api/highlight-share";
import type { HighlightShareEventDetail } from "@jits/shared/constants/highlights";

function runtimeVersion(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updates = require("expo-updates") as { runtimeVersion?: string | null };
    if (typeof updates.runtimeVersion === "string" && updates.runtimeVersion) return updates.runtimeVersion;
  } catch {
    // Not available (Jest, Expo Go): fall through to the config value.
  }
  const fromConfig = Constants.expoConfig?.runtimeVersion;
  return typeof fromConfig === "string" ? fromConfig : null;
}

/** The device keys every share event carries (spec 16.3.6). */
export function deviceDetail(): HighlightShareEventDetail {
  return {
    platform: Platform.OS,
    os_version: String(Platform.Version),
    app_version: Constants.expoConfig?.version ?? null,
    runtime_version: runtimeVersion(),
  };
}

/**
 * Fire-and-forget share-funnel event. Never throws, never awaited: the
 * shared wrapper swallows every error. Caller keys win over device keys.
 */
export function track(
  highlightId: string,
  step: HighlightShareStep,
  detail: HighlightShareEventDetail = {},
): void {
  try {
    void logHighlightShareEvent(supabase, highlightId, step, { ...deviceDetail(), ...detail });
  } catch {
    // Telemetry never breaks the flow it measures.
  }
}
