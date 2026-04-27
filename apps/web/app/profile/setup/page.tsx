import { Suspense } from "react";
import { requireAuth } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { SetupWizard } from "./setup-wizard";

export default function ProfileSetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}

async function SetupContent() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "id, display_name, current_weight, primary_gym_id, status, profile_photo_url, gender, date_of_birth, city",
    )
    .eq("auth_user_id", user.id)
    .single();

  const isEditing = !!athlete && athlete.status !== ATHLETE_STATUS.PENDING;

  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  const { data: waiver } = await supabase
    .from("waivers")
    .select("id")
    .eq("slug", "app-liability-v1")
    .eq("is_active", true)
    .single();

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

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {isEditing ? "Edit Profile" : "Welcome to Jits Arena"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {isEditing
              ? "Update your athlete details"
              : "Set up your athlete profile to get started"}
          </p>
        </div>
        <SetupWizard
          athleteId={athlete?.id ?? null}
          defaults={{
            displayName: athlete?.display_name ?? "",
            weight: athlete?.current_weight?.toString() ?? "",
            gymId: athlete?.primary_gym_id ?? "",
            gender: athlete?.gender ?? "",
            dateOfBirth: athlete?.date_of_birth ?? "",
            city: athlete?.city ?? "",
          }}
          defaultProfilePhotoUrl={athlete?.profile_photo_url ?? null}
          gyms={gyms ?? []}
          isEditing={isEditing}
          hasAcceptedTos={hasAcceptedTos}
          waiverId={waiver?.id}
        />
      </div>
    </div>
  );
}
