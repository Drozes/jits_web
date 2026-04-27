"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { WizardValues } from "./setup-wizard";

interface UseSetupSubmitArgs {
  athleteId: string | null;
  waiverId?: string;
  isEditing: boolean;
  onAfterTos: () => void;
}

export function useSetupSubmit({
  athleteId,
  waiverId,
  isEditing,
  onAfterTos,
}: UseSetupSubmitArgs) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptTos() {
    if (athleteId && waiverId) {
      const supabase = createClient();
      const { error: tosError } = await supabase
        .from("waiver_acknowledgements")
        .insert({ athlete_id: athleteId, waiver_id: waiverId });
      if (tosError) {
        setError("Failed to save Terms of Service acceptance. Please try again.");
        return;
      }
    }
    onAfterTos();
  }

  async function submit(values: WizardValues, skipOptional: boolean) {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      display_name: values.displayName.trim(),
      current_weight: parseFloat(values.weight),
      primary_gym_id: values.gymId,
      gender: values.gender,
      date_of_birth: values.dateOfBirth || null,
      city: skipOptional ? null : values.city.trim() || null,
    };

    const op = athleteId
      ? supabase.from("athletes").update(payload).eq("id", athleteId)
      : supabase.from("athletes").insert(payload);
    const { error: saveError } = await op;
    if (saveError) {
      setError(saveError.message);
      setLoading(false);
      return;
    }

    const { data: updated } = await supabase
      .from("athletes")
      .select("status")
      .eq("id", athleteId!)
      .single();
    if (updated?.status !== "active") {
      setError("Profile saved but activation failed. Please try again.");
      setLoading(false);
      return;
    }

    if (isEditing) {
      toast.success("Profile updated successfully");
      router.push("/profile");
    } else {
      window.location.href = "/";
    }
  }

  return { loading, error, acceptTos, submit };
}
