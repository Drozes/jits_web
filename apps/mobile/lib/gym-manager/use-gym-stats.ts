import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymStats, type GymStatsRange } from "@jits/shared/api/queries";
import type { GymStats } from "@jits/shared/types/gym-portal";
import { toast } from "@/components/ui";

interface UseGymStatsResult {
  data: GymStats | null;
  /** True if the caller manages this gym (drives the not-authorized fallback). */
  isManager: boolean;
  isLoading: boolean;
}

/**
 * H8 · Loads the gym-wide aggregate dashboard (avg ELO + momentum, submission/
 * draw rates, winning/losing submission breakdown, avg win/loss time, ELO trend)
 * over a 30d/90d/all window via getGymStats. The RPC is manager-gated, so the
 * NOT_GYM_MANAGER code flips a flag the screen renders against. Re-fetches when
 * the range filter changes. Cancellation flag gates state writes (W3-4 standard).
 */
export function useGymStats(
  gymId: string | undefined,
  range: GymStatsRange,
): UseGymStatsResult {
  const [data, setData] = React.useState<GymStats | null>(null);
  const [isManager, setIsManager] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!gymId) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const result = await getGymStats(supabase, gymId, range);
        if (cancelled) return;

        if (!result.ok) {
          if (result.error.code === "NOT_GYM_MANAGER") {
            setIsManager(false);
          } else {
            toast.error(result.error.message);
          }
          setData(null);
          return;
        }

        setIsManager(true);
        setData(result.data);
      } catch (err) {
        console.error("[gym-stats] fetch failed", err);
        if (!cancelled) toast.error("Failed to load stats");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gymId, range]);

  return { data, isManager, isLoading };
}
