import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymDetail } from "@jits/shared/api/queries";
import type { SessionListItem } from "@jits/shared/types/session";
import { toast } from "@/components/ui";

interface GymSessionsData {
  gymName: string;
  /** True if the caller manages this gym (drives the manager-only CTAs). */
  isManager: boolean;
  /** Scheduled + active sessions for the gym, ascending by start. */
  sessions: SessionListItem[];
}

interface UseGymSessionsResult {
  data: GymSessionsData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Loads the gym-owner sessions screen (H2): gym name + manager flag + the
 * gym's scheduled/active session list. Reuses getGymDetail (which already
 * returns only `scheduled`/`active` sessions ending in the future, ascending)
 * — no new RPC. Cancellation flag gates state writes per the W3-4 standard.
 */
export function useGymSessions(
  gymId: string | undefined,
  athleteId: string | undefined,
): UseGymSessionsResult {
  const [data, setData] = React.useState<GymSessionsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh", isCancelled: () => boolean = () => false) => {
      if (!gymId || !athleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const detail = await getGymDetail(supabase, gymId, athleteId);
        if (isCancelled()) return;
        if (!detail) {
          setData(null);
          return;
        }
        setData({
          gymName: detail.name,
          isManager: detail.isGymManager,
          sessions: detail.sessions,
        });
      } catch (err) {
        console.error("[gym-sessions] fetch failed", err);
        if (!isCancelled()) toast.error("Failed to load sessions");
      } finally {
        if (!isCancelled()) {
          if (mode === "initial") setIsLoading(false);
          else setIsRefreshing(false);
        }
      }
    },
    [gymId, athleteId],
  );

  React.useEffect(() => {
    let cancelled = false;
    void fetchAll("initial", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return { data, isLoading, isRefreshing, refresh: () => fetchAll("refresh") };
}
