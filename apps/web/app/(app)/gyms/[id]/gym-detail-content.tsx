import { notFound } from "next/navigation";
import { MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymDetail } from "@/lib/api/queries";
import { SessionList } from "./session-list";
import { StartSessionButton } from "./start-session-button";

interface GymDetailContentProps {
  paramsPromise: Promise<{ id: string }>;
}

export async function GymDetailContent({ paramsPromise }: GymDetailContentProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const gym = await getGymDetail(supabase, id, athlete.id);

  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-6">
      {/* Gym header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{gym.name}</h1>
          {gym.isMemberGym && (
            <Badge variant="outline">My Gym</Badge>
          )}
        </div>
        {gym.city && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {gym.city}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Members at this gym
        </div>
      </div>

      {/* Start Session button for members */}
      {gym.isMemberGym && <StartSessionButton gymId={id} />}

      {/* Sessions list */}
      <SessionList sessions={gym.sessions} rsvpSessionIds={gym.rsvpSessionIds} />
    </div>
  );
}
