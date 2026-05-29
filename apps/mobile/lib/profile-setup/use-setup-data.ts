import * as React from "react";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { supabase } from "@/lib/supabase/client";

export interface SetupAthleteRow {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  current_weight: number | null;
  primary_gym_id: string | null;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  city: string | null;
  free_agent: boolean;
}

export interface GymOption {
  id: string;
  name: string;
  city: string | null;
}

export interface SetupBootstrap {
  athlete: SetupAthleteRow | null;
  gyms: GymOption[];
  waiverId: string | null;
  hasAcceptedTos: boolean;
  isEditing: boolean;
}

/**
 * Loads the data the wizard needs at mount time. Mirrors the queries in
 * `apps/web/app/profile/setup/page.tsx`:
 *   - Existing athlete row keyed by `auth_user_id`.
 *   - Active gym list (id, name, city) for the gym picker.
 *   - Active app waiver (`slug = "app-liability-v1"`).
 *   - Whether this athlete already has a waiver acknowledgement.
 *
 * The web equivalent runs server-side; on mobile we fetch in a hook so the
 * screen can show a spinner while loading. RLS on these tables is permissive
 * for authenticated users.
 */
export function useSetupData(authUserId: string | null) {
  const [data, setData] = React.useState<SetupBootstrap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!authUserId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: athlete }, { data: gyms }, { data: waiver }] =
        await Promise.all([
          supabase
            .from("athletes")
            .select(
              "id, display_name, first_name, last_name, current_weight, primary_gym_id, status, gender, date_of_birth, city, free_agent",
            )
            .eq("auth_user_id", authUserId)
            .maybeSingle(),
          supabase
            .from("gyms")
            .select("id, name, city")
            .eq("status", "active")
            .order("name"),
          supabase
            .from("waivers")
            .select("id")
            .eq("slug", "app-liability-v1")
            .eq("is_active", true)
            .maybeSingle(),
        ]);

      let hasAcceptedTos = false;
      if (waiver && athlete) {
        const { data: ack } = await supabase
          .from("waiver_acknowledgements")
          .select("id")
          .eq("athlete_id", athlete.id)
          .eq("waiver_id", waiver.id)
          .limit(1)
          .maybeSingle();
        hasAcceptedTos = !!ack;
      }

      setData({
        athlete: (athlete as SetupAthleteRow | null) ?? null,
        gyms: (gyms as GymOption[] | null) ?? [],
        waiverId: waiver?.id ?? null,
        hasAcceptedTos,
        isEditing: !!athlete && athlete.status !== ATHLETE_STATUS.PENDING,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load setup.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
