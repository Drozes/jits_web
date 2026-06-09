import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  adminListAthletes,
  getAllGyms,
  type AdminAthlete,
  type GymOption,
} from "@jits/shared/api/queries";

interface UseAdminMembers {
  members: AdminAthlete[];
  gyms: GymOption[];
  isLoading: boolean;
  reload: () => void;
  /** Patch a member's platform_role in-place after a successful role change. */
  patchRole: (athleteId: string, role: AdminAthlete["platform_role"]) => void;
}

/**
 * Loads the full member roster + all gyms once for the admin Members screen.
 * The roster feeds the local-filtered member picker (mirrors the gym/city
 * autocomplete) and the gyms feed the gym-owner picker. Cancellation-guarded
 * per the mobile async pattern; `reload()` bumps a nonce to refetch.
 */
export function useAdminMembers(): UseAdminMembers {
  const [members, setMembers] = React.useState<AdminAthlete[]>([]);
  const [gyms, setGyms] = React.useState<GymOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const [m, g] = await Promise.all([
        adminListAthletes(supabase),
        getAllGyms(supabase),
      ]);
      if (cancelled) return;
      setMembers(m);
      setGyms(g);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  const patchRole = React.useCallback(
    (athleteId: string, role: AdminAthlete["platform_role"]) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === athleteId ? { ...m, platform_role: role } : m,
        ),
      );
    },
    [],
  );

  return { members, gyms, isLoading, reload, patchRole };
}
