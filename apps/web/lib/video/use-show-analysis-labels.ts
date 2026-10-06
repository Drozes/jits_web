"use client";

import { useEffect, useState } from "react";
import type { createClient } from "@/lib/supabase/client";
import { getCurrentAthlete } from "@jits/shared/api/queries";
import { canSeeAnalysisLabels } from "@jits/shared/utils";

/**
 * The web gate for AI analysis labels (move, position and technique names,
 * jits-xfvd.18): true only once the signed-in athlete reads as a platform
 * admin (`admin` or `founder`). Default hidden: false while loading, signed
 * out, on any read failure, or for any other role. Same rule as mobile's
 * `useShowAnalysisLabels` (`canSeeAnalysisLabels`).
 */
export function useShowAnalysisLabels(supabase: ReturnType<typeof createClient>): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const athlete = await getCurrentAthlete(supabase, user.id);
        if (!cancelled) setShow(canSeeAnalysisLabels(athlete?.platform_role));
      } catch {
        // Fail closed: labels stay hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  return show;
}
