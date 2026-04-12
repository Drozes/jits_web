import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymsWithSessions } from "@/lib/api/queries";
import { GymSearch } from "./gym-search";

export async function GymsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const gyms = await getGymsWithSessions(supabase);

  return <GymSearch gyms={gyms} myGymId={athlete.primary_gym_id} />;
}
