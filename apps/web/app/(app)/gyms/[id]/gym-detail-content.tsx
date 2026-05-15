import { notFound } from "next/navigation";
import { MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

      {/* Last Session plate (wireframe E2 lines 1444-1450).
          TODO: requires getGymDetail to expose last-session aggregates
          (attendees, avg matches, ELO range, median). Rendered with "—"
          placeholders until the query is extended. */}
      {gym.isGymManager && <LastSessionPlate />}

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

/**
 * Last Session plate, wireframe E2 lines 1444-1450.
 * Renders a section label "Last Session · {date}" plus a 2x2 grid of DataRows
 * (Attendees / Avg Matches / ELO Range / Median).
 *
 * TODO: requires getGymDetail to expose last-session aggregates (attendees,
 * avg matches, ELO range, median). All values show "—" until the query is
 * extended.
 */
function LastSessionPlate() {
  const lastSession: {
    date: string | null;
    attendees: number | null;
    avgMatches: number | null;
    eloRange: string | null;
    medianElo: number | null;
  } = {
    date: null,
    attendees: null,
    avgMatches: null,
    eloRange: null,
    medianElo: null,
  };

  const dateSuffix = lastSession.date ? ` · ${lastSession.date}` : "";
  const rows: { label: string; value: string | number }[] = [
    { label: "Attendees", value: lastSession.attendees ?? "—" },
    { label: "Avg Matches", value: lastSession.avgMatches ?? "—" },
    { label: "ELO Range", value: lastSession.eloRange ?? "—" },
    { label: "Median", value: lastSession.medianElo ?? "—" },
  ];

  return (
    <section>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Last Session{dateSuffix}
      </p>
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </span>
              <span className="font-mono text-base tabular-nums">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
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
