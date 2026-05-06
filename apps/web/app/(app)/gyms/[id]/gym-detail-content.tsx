import { notFound } from "next/navigation";
import { MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getGymDetail, getSessionTemplates, getGymManagerStats } from "@jits/shared/api/queries";
import { SessionList } from "./session-list";
import { CreateSessionDialog } from "./create-session-dialog";
import { EditGymDialog } from "./edit-gym-dialog";
import { SessionTemplates } from "./session-templates";
import { GymStats } from "./gym-stats";

interface GymDetailContentProps {
  paramsPromise: Promise<{ id: string }>;
}

export async function GymDetailContent({ paramsPromise }: GymDetailContentProps) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();
  const [gym, templates, managerStats] = await Promise.all([
    getGymDetail(supabase, id, athlete.id),
    getSessionTemplates(supabase, id),
    getGymManagerStats(supabase, id),
  ]);

  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-6">
      <GymHeader gym={gym} />

      {/* Manager actions */}
      {gym.isGymManager && (
        <div className="flex items-center gap-2">
          <EditGymDialog gymId={id} currentName={gym.name} currentCity={gym.city} />
          <CreateSessionDialog gymId={id} />
        </div>
      )}

      {/* Gym stats (visible to managers) */}
      {gym.isGymManager && <GymStats stats={managerStats} />}

      {/* Session templates (visible to managers, create-session available to all) */}
      {(gym.isGymManager || templates.length > 0) && (
        <SessionTemplates gymId={id} templates={templates} isManager={gym.isGymManager} />
      )}

      {/* Sessions list */}
      <SessionList
        sessions={gym.sessions}
        rsvpSessionIds={gym.rsvpSessionIds}
        currentAthleteId={athlete.id}
        isGymManager={gym.isGymManager}
      />
    </div>
  );
}

function GymHeader({ gym }: { gym: { name: string; city: string | null; isMemberGym: boolean } }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{gym.name}</h1>
        {gym.isMemberGym && <Badge variant="outline">My Gym</Badge>}
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
  );
}
