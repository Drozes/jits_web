import * as React from "react";
import { useFocusEffect } from "expo-router";
import type { MyActiveMatch } from "@jits/shared/api/queries";
import { useMatchExitCount } from "@/lib/arena/arena-store";
import { refreshMyActiveMatch, useActiveMatch } from "./active-match-store";

/**
 * The signed-in athlete's still-open match, for Home's "Resume your match"
 * card (jits-r9a). An app killed mid-match leaves the match `pending` /
 * `in_progress` with nothing on screen leading back to it.
 *
 * Reads through the app-wide store (`active-match-store.ts`, F10), which the
 * header chip's CONFIRM marker shares, so Home and the chip never disagree.
 * Re-read on every focus of the screen (cheap, and a stale card pointing at a
 * finished match is the thing to avoid) and again whenever a match screen
 * closes, since match exits pop back without refocusing a tab that was not on
 * top. Never navigates by itself: resuming is always the athlete's tap.
 *
 * A failed read keeps what was on screen and stays quiet; Home already toasts
 * its own load failure and a second toast would only repeat it.
 */
export function useMyActiveMatch(athleteId: string | undefined): {
  match: MyActiveMatch | null;
  refresh: () => void;
} {
  const match = useActiveMatch(athleteId);
  // No athlete yet (auth still loading): nothing to read, and the store is
  // left alone, since the app-wide owner may hold the real athlete's match.
  const refresh = React.useCallback(() => {
    if (athleteId) refreshMyActiveMatch(athleteId);
  }, [athleteId]);

  useFocusEffect(refresh);

  const exits = useMatchExitCount();
  const seenExits = React.useRef(exits);
  React.useEffect(() => {
    if (exits === seenExits.current) return;
    seenExits.current = exits;
    refresh();
  }, [exits, refresh]);

  return { match, refresh };
}
