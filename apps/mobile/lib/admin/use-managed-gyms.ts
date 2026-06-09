import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  adminListManagedGyms,
  type AdminManagedGym,
} from "@jits/shared/api/queries";

interface UseManagedGyms {
  gyms: AdminManagedGym[];
  isLoading: boolean;
  reload: () => void;
}

/**
 * Loads the gyms a given athlete manages (is a gym owner of) for the admin
 * member-detail view. Refetches when `athleteId` changes or `reload()` is
 * called; a null athleteId clears the list. Cancellation-guarded per the
 * mobile async pattern.
 */
export function useManagedGyms(athleteId: string | null): UseManagedGyms {
  const [gyms, setGyms] = React.useState<AdminManagedGym[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!athleteId) {
      setGyms([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const rows = await adminListManagedGyms(supabase, athleteId);
      if (cancelled) return;
      setGyms(rows);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { gyms, isLoading, reload };
}
