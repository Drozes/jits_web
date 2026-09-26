import * as React from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { getMyActiveMatch, type MyActiveMatch } from "@jits/shared/api/queries";
import { getLeftMatchIds, useMatchExitCount } from "@/lib/arena/arena-store";

/**
 * The signed-in athlete's still-open match, for Home's "Resume your match"
 * card (jits-r9a). An app killed mid-match leaves the match `pending` /
 * `in_progress` with nothing on screen leading back to it.
 *
 * Read on every focus of the screen (cheap, and a stale card pointing at a
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
  const [match, setMatchState] = React.useState<MyActiveMatch | null>(null);
  // Every focus re-reads, and nearly every read is unchanged (usually null),
  // so only a real change re-renders Home.
  const current = React.useRef<MyActiveMatch | null>(null);
  const setMatch = React.useCallback((next: MyActiveMatch | null) => {
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next;
    setMatchState(next);
  }, []);
  // Only the newest read may write, and none after unmount.
  const seq = React.useRef(0);
  React.useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const refresh = React.useCallback(() => {
    const id = ++seq.current;
    if (!athleteId) {
      setMatch(null);
      return;
    }
    // Never offer a match the athlete left in this app process (backed out
    // of on purpose); a kill clears the set, which is the case to recover.
    const left = [...getLeftMatchIds()];
    void getMyActiveMatch(supabase, athleteId, Date.now(), left).then((res) => {
      if (id !== seq.current || !res.ok) return;
      setMatch(res.data);
    });
  }, [athleteId, setMatch]);

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
