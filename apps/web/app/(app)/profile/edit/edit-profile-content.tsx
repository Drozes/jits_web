import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { EditProfileForm } from "./edit-profile-form";

export async function EditProfileContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  // Split display_name into first/last best-effort
  const [firstName, ...lastParts] = (athlete.display_name ?? "").trim().split(/\s+/);
  const lastName = lastParts.join(" ");

  return (
    <EditProfileForm
      athleteId={athlete.id}
      firstName={firstName ?? ""}
      lastName={lastName ?? ""}
      weightKg={athlete.current_weight}
      city={athlete.city}
      primaryGymId={athlete.primary_gym_id}
      gyms={gyms ?? []}
    />
  );
}
