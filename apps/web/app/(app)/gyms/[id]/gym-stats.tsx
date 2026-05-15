import { Card, CardContent } from "@/components/ui/card";
import type { GymManagerStats } from "@jits/shared/types/analytics";
import { Calendar, Users, TrendingUp, UserCheck } from "lucide-react";

interface GymStatsProps {
  stats: GymManagerStats;
}

// Wireframe E2 (line ~1440) specifies a 2-up tile grid: Sessions + Avg ELO as
// the primary tiles, with Check-ins + Members below. Total Matches was
// previously surfaced here but has been replaced with Avg ELO per spec.
// TODO: requires getGymManagerStats to expose avgElo (mean current_elo across
// active members). Until then we show a "—" placeholder.
const statItems = [
  { key: "totalSessions", label: "Sessions", Icon: Calendar },
  { key: "avgElo", label: "Avg ELO", Icon: TrendingUp },
  { key: "totalParticipants", label: "Check-ins", Icon: Users },
  { key: "activeMemberCount", label: "Members", Icon: UserCheck },
] as const;

export function GymStats({ stats }: GymStatsProps) {
  return (
    <section>
      <h3 className="font-semibold mb-3 text-sm">Gym Stats</h3>
      <div className="grid grid-cols-2 gap-3">
        {statItems.map(({ key, label, Icon }) => {
          const value =
            key in stats
              ? (stats as GymManagerStats & Record<string, number | undefined>)[key]
              : undefined;
          return (
            <Card key={key}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xl font-bold tabular-nums font-mono">
                    {value === undefined ? "—" : value}
                  </p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
