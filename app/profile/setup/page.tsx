import { Suspense } from "react";
import { requireAuth } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ATHLETE_STATUS } from "@/lib/constants";
import { SetupForm } from "./setup-form";

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

  // Fetch existing athlete (auto-created by backend on signup)
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name, current_weight, primary_gym_id, status")
    .eq("auth_user_id", user.id)
    .single();

  const isEditing =
    !!athlete && athlete.status !== ATHLETE_STATUS.PENDING;

  // Fetch gyms server-side so the client component doesn't need to
  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("status", "active")
    .order("name");

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
        <SetupForm
          athleteId={athlete?.id ?? null}
          defaultDisplayName={athlete?.display_name ?? ""}
          defaultWeight={athlete?.current_weight?.toString() ?? ""}
          defaultGymId={athlete?.primary_gym_id ?? ""}
          gyms={gyms ?? []}
          isEditing={isEditing}
        />
      </div>
    </div>
  );
}
