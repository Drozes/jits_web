import * as React from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Listen for the `matches` row flipping to `completed` or `disputed`
 * and call `onCompleted` exactly once. Also fires after a short delay
 * if the row is *already* in a terminal state when the hook mounts
 * (e.g. after a refresh) since the realtime UPDATE event won't trigger.
 *
 * Used by the confirm step so the user is auto-advanced to summary the
 * moment both athletes have confirmed (or one has disputed).
 */
export function useMatchCompletion({
  matchId,
  matchStatus,
  onCompleted,
}: {
  matchId: string;
  matchStatus: string;
  onCompleted: () => void;
}) {
  const advancedRef = React.useRef(false);
  const onCompletedRef = React.useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const fire = React.useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onCompletedRef.current();
  }, []);

  React.useEffect(() => {
    const channel = supabase
      .channel(`match-complete:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        ({ new: row }) => {
          const r = row as { status?: string };
          if (r.status === "completed" || r.status === "disputed") fire();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, fire]);

  React.useEffect(() => {
    if (matchStatus === "completed" || matchStatus === "disputed") {
      const t = setTimeout(fire, 1000);
      return () => clearTimeout(t);
    }
  }, [matchStatus, fire]);

  return { fire };
}
