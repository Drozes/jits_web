import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { getManagedGyms, type ManagedGym } from "@jits/shared/api/queries";

interface UseManagedGymsResult {
  /** Gyms the signed-in athlete manages (empty for non-managers). */
  gyms: ManagedGym[];
  /** True once the lookup has resolved at least once. */
  isReady: boolean;
}

/**
 * Resolves which gym(s) the current athlete manages, driving the gym-owner
 * portal entry: a non-empty list gates the Gym Manager tab, and the hub uses
 * the first managed gym. Cancellation flag gates state writes (W3-4 standard).
 *
 * Keyed on the athlete id so it refetches on account switch and stays empty
 * while the athlete row is still loading.
 */
export function useManagedGyms(): UseManagedGymsResult {
  const { athlete } = useAuth();
  const athleteId = athlete?.id;
  const [gyms, setGyms] = React.useState<ManagedGym[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (!athleteId) {
      setGyms([]);
      setIsReady(false);
      return;
    }
    let cancelled = false;
    setIsReady(false);
    void (async () => {
      const rows = await getManagedGyms(supabase, athleteId);
      if (cancelled) return;
      setGyms(rows);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return { gyms, isReady };
}
