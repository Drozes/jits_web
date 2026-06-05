import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymDetail, getGymManagerStats } from "@jits/shared/api/queries";
import type { GymManagerStats } from "@jits/shared/types/analytics";
import type { SessionListItem } from "@jits/shared/types/session";
import { toast } from "@/components/ui";

interface GymHubData {
  gymName: string;
  /** True if the caller manages this gym (drives the not-authorized fallback). */
  isManager: boolean;
  /** Live session if one is running, else the soonest upcoming scheduled one. */
  nextSession: SessionListItem | null;
  /** Whether `nextSession` is currently live (status === "active"). */
  nextIsLive: boolean;
  stats: GymManagerStats;
}

interface UseGymHubResult {
  data: GymHubData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

const EMPTY_STATS: GymManagerStats = {
  totalSessions: 0,
  totalParticipants: 0,
  totalMatches: 0,
  activeMemberCount: 0,
};

/**
 * Loads the gym-owner hub (H1): gym name + manager flag + the next session
 * (live first, then soonest upcoming) + manager stats for the metric tiles.
 * Reuses getGymDetail + getGymManagerStats — no new RPC. Cancellation flag
 * gates state writes per the W3-4 standard.
 */
export function useGymHub(
  gymId: string | undefined,
  athleteId: string | undefined,
): UseGymHubResult {
  const [data, setData] = React.useState<GymHubData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh", isCancelled: () => boolean = () => false) => {
      if (!gymId || !athleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const [detail, stats] = await Promise.all([
          getGymDetail(supabase, gymId, athleteId),
          // Stats are non-critical: a slow/failed fetch must not blank the hub.
          getGymManagerStats(supabase, gymId).catch((err) => {
            console.error("[gym-hub] stats fetch failed", err);
            return null;
          }),
        ]);
        if (isCancelled()) return;

        if (!detail) {
          setData(null);
          return;
        }

        const live = detail.sessions.find((s) => s.status === "active") ?? null;
        const upcoming = detail.sessions
          .filter((s) => s.status === "scheduled")
          .sort(
            (a, b) =>
              new Date(a.scheduledStart).getTime() -
              new Date(b.scheduledStart).getTime(),
          );
        const nextSession = live ?? upcoming[0] ?? null;

        setData({
          gymName: detail.name,
          isManager: detail.isGymManager,
          nextSession,
          nextIsLive: !!live,
          stats: stats ?? EMPTY_STATS,
        });
      } catch (err) {
        console.error("[gym-hub] fetch failed", err);
        if (!isCancelled()) toast.error("Failed to load gym");
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
