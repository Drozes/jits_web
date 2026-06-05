import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  getGymStatsByEloRange,
  type GymStatsRange,
} from "@jits/shared/api/queries";
import type { GymEloBracketStats } from "@jits/shared/types/gym-portal";
import { toast } from "@/components/ui";

interface UseGymBracketStatsResult {
  brackets: GymEloBracketStats[];
  /** True if the caller manages this gym (drives the not-authorized fallback). */
  isManager: boolean;
  isLoading: boolean;
}

/**
 * H10 · Loads the per-ELO-bracket breakdown (1900+ / 1700-1900 / 1500-1700 /
 * 1300-1500) of counts, rates, momentum, finish times, and top winning/losing
 * submissions via getGymStatsByEloRange. The RPC is manager-gated, so the
 * NOT_GYM_MANAGER code flips a flag the screen renders against. Re-fetches when
 * the range filter changes. Cancellation flag gates state writes (W3-4 standard).
 */
export function useGymBracketStats(
  gymId: string | undefined,
  range: GymStatsRange,
): UseGymBracketStatsResult {
  const [brackets, setBrackets] = React.useState<GymEloBracketStats[]>([]);
  const [isManager, setIsManager] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!gymId) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const result = await getGymStatsByEloRange(supabase, gymId, range);
        if (cancelled) return;

        if (!result.ok) {
          if (result.error.code === "NOT_GYM_MANAGER") {
            setIsManager(false);
          } else {
            toast.error(result.error.message);
          }
          setBrackets([]);
          return;
        }

        setIsManager(true);
        setBrackets(result.data);
      } catch (err) {
        console.error("[gym-bracket-stats] fetch failed", err);
        if (!cancelled) toast.error("Failed to load stats");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gymId, range]);

  return { brackets, isManager, isLoading };
}
