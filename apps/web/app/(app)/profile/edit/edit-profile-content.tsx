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

  // Prefer the structured columns; fall back to splitting display_name for any
  // legacy row not yet backfilled.
  const [splitFirst, ...lastParts] = (athlete.display_name ?? "").trim().split(/\s+/);
  const firstName = athlete.first_name ?? splitFirst ?? "";
  const lastName = athlete.last_name ?? lastParts.join(" ");

  return (
    <EditProfileForm
      athleteId={athlete.id}
      firstName={firstName ?? ""}
      lastName={lastName ?? ""}
      weight={athlete.current_weight}
      city={athlete.city}
      primaryGymId={athlete.primary_gym_id}
      gyms={gyms ?? []}
    />
  );
}
