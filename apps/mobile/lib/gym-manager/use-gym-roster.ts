import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymRoster } from "@jits/shared/api/queries";
import type { GymRosterRow } from "@jits/shared/types/gym-portal";
import { toast } from "@/components/ui";

interface UseGymRosterResult {
  /** Active members ordered by current ELO DESC (BE order preserved). */
  roster: GymRosterRow[];
  /** True if the caller manages this gym (drives the not-authorized fallback). */
  isManager: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * H6 · Loads the gym roster (active members, ELO DESC) via getGymRoster, which
 * is manager-gated: a NOT_GYM_MANAGER result clears isManager so the screen can
 * render the not-authorized fallback. Cancellation flag gates state writes per
 * the W3-4 standard.
 */
export function useGymRoster(gymId: string | undefined): UseGymRosterResult {
  const [roster, setRoster] = React.useState<GymRosterRow[]>([]);
  const [isManager, setIsManager] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh", isCancelled: () => boolean = () => false) => {
      if (!gymId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const result = await getGymRoster(supabase, gymId);
        if (isCancelled()) return;

        if (!result.ok) {
          // Manager-gating failure path: hide the roster, show the fallback.
          if (result.error.code === "NOT_GYM_MANAGER") {
            setIsManager(false);
            setRoster([]);
          } else {
            toast.error(result.error.message);
          }
          return;
        }

        setIsManager(true);
        setRoster(result.data);
      } catch (err) {
        console.error("[gym-roster] fetch failed", err);
        if (!isCancelled()) toast.error("Failed to load roster");
      } finally {
        if (!isCancelled()) {
          if (mode === "initial") setIsLoading(false);
          else setIsRefreshing(false);
        }
      }
    },
    [gymId],
  );

  React.useEffect(() => {
    let cancelled = false;
    void fetchAll("initial", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return {
    roster,
    isManager,
    isLoading,
    isRefreshing,
    refresh: () => fetchAll("refresh"),
  };
}
