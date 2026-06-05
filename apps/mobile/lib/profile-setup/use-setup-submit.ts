import * as React from "react";
import { useRouter } from "expo-router";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { toast } from "@/components/ui/toast";
import {
  FREE_AGENT_OPTION,
  type WizardValues,
} from "../../components/profile-setup/types";

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
    // Only the edit/re-setup path reaches here with an existing athlete row;
    // brand-new signups have no row yet, so the ack is written in `submit()`
    // once the athlete is created. Idempotent check-then-insert (the app-level
    // waiver's null `session_id` is distinct under the unique constraint, so a
    // duplicate insert would not be rejected).
    if (athleteId && waiverId) {
      const { data: existingAck } = await supabase
        .from("waiver_acknowledgements")
        .select("id")
        .eq("athlete_id", athleteId)
        .eq("waiver_id", waiverId)
        .is("session_id", null)
        .maybeSingle();
      if (!existingAck) {
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
    }
    onAfterTos();
  }, [athleteId, waiverId, onAfterTos]);

  const submit = React.useCallback(
    async (values: WizardValues) => {
      setLoading(true);
      setError(null);

      const firstName = values.firstName.trim();
      const lastName = values.lastName.trim();
      // Free-agent is derived from the gym picker sentinel; never send the
      // sentinel as a primary_gym_id. City is required, always written trimmed.
      const freeAgent = values.gymId === FREE_AGENT_OPTION;
      const basePayload = {
        first_name: firstName,
        last_name: lastName,
        // display_name is a derived label kept in sync for the many screens
        // that render it; the backend also derives it from first/last on signup.
        display_name: `${firstName} ${lastName}`.trim(),
        current_weight: parseFloat(values.weight),
        gender: values.gender,
        date_of_birth: values.dateOfBirth || null,
        city: values.city.trim(),
        free_agent: freeAgent,
        primary_gym_id: freeAgent ? null : values.gymId || null,
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

      // Record the TOS/waiver acknowledgement. On the primary signup path the
      // athlete row does not exist until the insert above, so `acceptTos` (which
      // only fires when an athlete row already exists) skips it and the legal
      // agreement would be saved for nobody. Mirror web `eua-form.tsx`: the
      // app-level waiver has a null `session_id`, and Postgres treats NULLs as
      // distinct in the `uq_waiver_ack` unique constraint, so a repeat insert
      // would NOT be caught. Check before inserting to stay idempotent.
      if (waiverId && resolvedAthleteId) {
        const { data: existingAck } = await supabase
          .from("waiver_acknowledgements")
          .select("id")
          .eq("athlete_id", resolvedAthleteId)
          .eq("waiver_id", waiverId)
          .is("session_id", null)
          .maybeSingle();
        if (!existingAck) {
          const { error: ackError } = await supabase
            .from("waiver_acknowledgements")
            .insert({ athlete_id: resolvedAthleteId, waiver_id: waiverId });
          if (ackError) {
            setError(
              "Failed to save Terms of Service acceptance. Please try again.",
            );
            setLoading(false);
            return;
          }
        }
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
    [athleteId, authUserId, waiverId, isEditing, refreshAthlete, router],
  );

  return { loading, error, acceptTos, submit };
}
