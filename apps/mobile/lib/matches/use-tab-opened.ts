import * as React from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { logTabOpened, type TabOpenedEntry } from "./telemetry";

/** The route param Home's See all tile sets (`/(app)/(tabs)/matches?entry=see_all`). */
export const SEE_ALL_ENTRY = "see_all";

/**
 * Logs `matches.tab_opened` on every focus of the Matches tab with how it
 * was reached, then consumes the `entry` param (spec 13): Home's See all
 * tags the open once, and the param is cleared so a later tab-bar open is
 * counted as `tab`, not as another See all.
 */
export function useMatchesTabOpened(): void {
  const router = useRouter();
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  // Read at focus time through a ref, so clearing the param (a re-render)
  // never re-runs the focus effect and logs a second open.
  const entryRef = React.useRef(entry);
  entryRef.current = entry;
  useFocusEffect(
    React.useCallback(() => {
      const raw = entryRef.current;
      const tag: TabOpenedEntry = raw === SEE_ALL_ENTRY ? "see_all" : "tab";
      logTabOpened(tag);
      if (raw != null) router.setParams({ entry: undefined });
    }, [router]),
  );
}
