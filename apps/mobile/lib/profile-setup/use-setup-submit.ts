import * as React from "react";
import { useRouter } from "expo-router";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { toast } from "@/components/ui/toast";
import type { WizardValues } from "../../components/profile-setup/types";

interface UseSetupSubmitArgs {
  athleteId: string | null;
  authUserId: string | null;
  waiverId: string | null;
  isEditing: boolean;
  onAfterTos: () => void;
}

/**
 * Mirrors `apps/web/app/profile/setup/use-setup-submit.ts`:
 *   1. TOS acceptance INSERTs into `waiver_acknowledgements` with the same
 *      shape (`athlete_id`, `waiver_id`).
 *   2. Submit either UPDATEs an existing athlete row or INSERTs a new one
 *      (`auth_user_id` is required on insert because there is no row yet
 *      when the user has just signed up).
 *   3. Verifies the trigger flipped status to `active`, then calls
 *      `refreshAthlete()` so the AuthContext reflects the activated state
 *      before we navigate.
 */
export function useSetupSubmit({
  athleteId,
  authUserId,
  waiverId,
  isEditing,
  onAfterTos,
}: UseSetupSubmitArgs) {
  const router = useRouter();
  const { refreshAthlete } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const acceptTos = React.useCallback(async () => {
    if (athleteId && waiverId) {
      const { error: tosError } = await supabase
        .from("waiver_acknowledgements")
        .insert({ athlete_id: athleteId, waiver_id: waiverId });
      if (tosError) {
        setError(
          "Failed to save Terms of Service acceptance. Please try again.",
        );
        return;
      }
    }
    onAfterTos();
  }, [athleteId, waiverId, onAfterTos]);

  const submit = React.useCallback(
    async (values: WizardValues, skipOptional: boolean) => {
      setLoading(true);
      setError(null);

      const trimmedCity = values.city.trim();
      const basePayload = {
        display_name: values.displayName.trim(),
        current_weight: parseFloat(values.weight),
        gender: values.gender,
        date_of_birth: values.dateOfBirth || null,
        city: skipOptional ? null : trimmedCity || null,
        free_agent: values.freeAgent,
        primary_gym_id: values.freeAgent ? null : values.gymId || null,
      };

      let resolvedAthleteId = athleteId;
      if (athleteId) {
        const { error: saveError } = await supabase
          .from("athletes")
          .update(basePayload)
          .eq("id", athleteId);
        if (saveError) {
          setError(saveError.message);
          setLoading(false);
          return;
        }
      } else {
        if (!authUserId) {
          setError("Missing auth user. Please sign in again.");
          setLoading(false);
          return;
        }
        const { data: inserted, error: saveError } = await supabase
          .from("athletes")
          .insert({ ...basePayload, auth_user_id: authUserId })
          .select("id")
          .single();
        if (saveError || !inserted) {
          setError(saveError?.message ?? "Failed to create athlete profile.");
          setLoading(false);
          return;
        }
        resolvedAthleteId = inserted.id;
      }

      const { data: updated } = await supabase
        .from("athletes")
        .select("status")
        .eq("id", resolvedAthleteId!)
        .single();
      if (updated?.status !== ATHLETE_STATUS.ACTIVE) {
        setError("Profile saved but activation failed. Please try again.");
        setLoading(false);
        return;
      }

      await refreshAthlete();

      if (isEditing) {
        toast.success("Profile updated successfully");
        router.replace("/(app)/profile");
      } else {
        router.replace("/");
      }
    },
    [athleteId, authUserId, isEditing, refreshAthlete, router],
  );

  return { loading, error, acceptTos, submit };
}
