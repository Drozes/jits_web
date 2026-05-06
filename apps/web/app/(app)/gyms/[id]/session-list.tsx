import { Calendar } from "lucide-react";
import { SessionCard } from "@/components/domain/session-card";
import type { SessionListItem } from "@jits/shared/types/session";

interface SessionListProps {
  sessions: SessionListItem[];
  rsvpSessionIds: string[];
  currentAthleteId: string;
  isGymManager?: boolean;
}

export function SessionList({ sessions, rsvpSessionIds, currentAthleteId, isGymManager }: SessionListProps) {
  // Active sessions first, then upcoming sorted by closest start time
  const sorted = [...sessions].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Calendar className="h-4 w-4 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Sessions</h2>
        {sessions.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold text-muted-foreground">
            {sessions.length}
          </span>
        )}
      </div>

      {sessions.length > 0 ? (
        <div className="flex flex-col gap-3">
          {sorted.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isRsvpd={rsvpSessionIds.includes(session.id)}
              isCreator={session.createdBy === currentAthleteId || !!isGymManager}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No upcoming sessions</p>
        </div>
      )}
    </section>
  );
}
