import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getGymAthleteDetail } from "@jits/shared/api/queries";
import type { GymAthleteDetail } from "@jits/shared/types/gym-portal";
import { toast } from "@/components/ui";

interface UseGymAthleteDetailResult {
  data: GymAthleteDetail | null;
  /** True if the caller manages this gym (drives the not-authorized fallback). */
  isManager: boolean;
  /** True when the member is not part of this gym (NOT_GYM_MEMBER hint). */
  notMember: boolean;
  isLoading: boolean;
}

/**
 * H7 · Loads a single member's manager-scoped detail (current/peak ELO, W/L/D,
 * win rate, last-10 ELO trend, last-5 matches) via getGymAthleteDetail. The RPC
 * is manager-gated and member-scoped, so the two auth-failure codes flip flags
 * the screen renders against. Cancellation flag gates state writes (W3-4).
 */
export function useGymAthleteDetail(
  gymId: string | undefined,
  athleteId: string | undefined,
): UseGymAthleteDetailResult {
  const [data, setData] = React.useState<GymAthleteDetail | null>(null);
  const [isManager, setIsManager] = React.useState(true);
  const [notMember, setNotMember] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!gymId || !athleteId) return;
    let cancelled = false;
    setIsLoading(true);
    setNotMember(false);
    (async () => {
      try {
        const result = await getGymAthleteDetail(supabase, gymId, athleteId);
        if (cancelled) return;

        if (!result.ok) {
          if (result.error.code === "NOT_GYM_MANAGER") {
            setIsManager(false);
          } else if (result.error.code === "NOT_GYM_MEMBER") {
            setNotMember(true);
          } else {
            toast.error(result.error.message);
          }
          setData(null);
          return;
        }

        setIsManager(true);
        setData(result.data);
      } catch (err) {
        console.error("[gym-athlete-detail] fetch failed", err);
        if (!cancelled) toast.error("Failed to load athlete");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gymId, athleteId]);

  return { data, isManager, notMember, isLoading };
}
