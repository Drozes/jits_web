import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymLadder, type GymStatsRange } from "@jits/shared/api/queries";
import type { GymLadderRow } from "@jits/shared/types/gym-portal";
import { toast } from "@/components/ui";

interface UseGymLadderResult {
  /** All gyms on the ladder for the active range, avg ELO DESC (BE order). */
  rows: GymLadderRow[];
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * H9 · Loads the cross-gym ladder (gyms ranked by avg member ELO) over a
 * 30d/90d/all window via getGymLadder. The ladder is aggregate-only and NOT
 * manager-gated, so it follows the plain read style (rows returned directly, []
 * on error) rather than the Result gate the roster/stats hooks use. City
 * filtering is done client-side by the screen off the full row set, so this
 * fetches every gym and only re-fetches when the range changes. Cancellation
 * flag gates state writes (W3-4 standard).
 */
export function useGymLadder(range: GymStatsRange): UseGymLadderResult {
  const [rows, setRows] = React.useState<GymLadderRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh", isCancelled: () => boolean = () => false) => {
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const data = await getGymLadder(supabase, { range });
        if (isCancelled()) return;
        setRows(data);
      } catch (err) {
        console.error("[gym-ladder] fetch failed", err);
        if (!isCancelled()) toast.error("Failed to load ladder");
      } finally {
        if (!isCancelled()) {
          if (mode === "initial") setIsLoading(false);
          else setIsRefreshing(false);
        }
      }
    },
    [range],
  );

  React.useEffect(() => {
    let cancelled = false;
    void fetchAll("initial", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return {
    rows,
    isLoading,
    isRefreshing,
    refresh: () => fetchAll("refresh"),
  };
}
