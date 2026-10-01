/**
 * The viewer's friend ids for Arena badges and sorting (jr_be spec 016, AC6.2).
 *
 * `athlete_friendships` is NOT in the realtime publication (jr_be amendment
 * A3: DELETE events bypass RLS), so this hook re-reads instead of listening:
 * whenever the screen gains focus (which covers the mount), when the app
 * returns to the foreground, and whenever `notifyFriendsChanged()` is called
 * (after an accepted join invite, a claim, or a remove). A failed read keeps
 * the last known set rather than wiping the badges.
 */
import * as React from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { getMyFriends } from "@jits/shared/api/friends";
import { supabase } from "@/lib/supabase/client";

const listeners = new Set<() => void>();

/** Tell every mounted `useFriendIds` that the friend list may have changed. */
export function notifyFriendsChanged(): void {
  for (const fn of listeners) fn();
}

export function useFriendIds(athleteId: string | null): ReadonlySet<string> {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const aliveRef = React.useRef(true);

  const load = React.useCallback(() => {
    if (!athleteId) return;
    void getMyFriends(supabase).then((res) => {
      if (aliveRef.current && res.ok) setIds(new Set(res.data.map((f) => f.athlete_id)));
    });
  }, [athleteId]);

  React.useEffect(() => {
    aliveRef.current = true;
    listeners.add(load);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    return () => {
      aliveRef.current = false;
      listeners.delete(load);
      sub.remove();
    };
  }, [load]);

  useFocusEffect(load);

  return ids;
}
