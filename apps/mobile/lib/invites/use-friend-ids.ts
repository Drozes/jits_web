/**
 * The viewer's friend ids for Arena badges and sorting (jr_be spec 016, AC6.2).
 * Read on mount and again on any INSERT or DELETE on `athlete_friendships`
 * (RLS limits the stream to the viewer's own rows).
 */
import * as React from "react";
import { getMyFriendIds } from "@jits/shared/api/friends";
import { supabase } from "@/lib/supabase/client";

export function useFriendIds(athleteId: string | null): ReadonlySet<string> {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    const load = () =>
      void getMyFriendIds(supabase).then((next) => {
        if (!cancelled) setIds(next);
      });
    load();
    const channel = supabase
      .channel(`friendships:${athleteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "athlete_friendships" }, load)
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [athleteId]);
  return ids;
}
