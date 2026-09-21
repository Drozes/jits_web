import Link from "next/link";
import { WifiOff } from "lucide-react";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getGymsWithSessionsResult } from "@jits/shared/api/queries";
import { GymFinder } from "./gym-finder";

export async function GymsContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // RESULT VARIANT, NOT THE LENIENT ONE. `getGymsWithSessions` returns whatever
  // it managed to build and never reports failure, so a dropped gyms or
  // sessions read arrived here as `[]` and the finder rendered "no gyms" as if
  // it were a fact. An empty gym finder and a failed gym finder look identical
  // to the athlete but mean opposite things: one says stop looking, the other
  // says try again.
  const result = await getGymsWithSessionsResult(supabase);

  if (!result.ok) return <GymFinderUnavailable />;

  return (
    <GymFinder
      gyms={result.data}
      myGymId={athlete.primary_gym_id}
      defaultCity={athlete.city ?? null}
    />
  );
}

/**
 * Shown when the gym list read FAILED, as opposed to there being no gyms.
 * Mirrors `SessionUnavailable`: a plate, the cause, and one way out. A server
 * component has no `reset()`, so the exit is a link rather than a retry.
 */
function GymFinderUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">Gym finder unavailable</p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load the gym list. This is a connection problem, not an
        empty map.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
