import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymsWithSessions } from "@jits/shared/api/queries";
import { GymFinder } from "./gym-finder";

export async function GymsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const gyms = await getGymsWithSessions(supabase);

  return (
    <GymFinder
      gyms={gyms}
      myGymId={athlete.primary_gym_id}
      defaultCity={athlete.city ?? null}
    />
  );
}
