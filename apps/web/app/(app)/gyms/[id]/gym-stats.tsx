import { Card, CardContent } from "@/components/ui/card";
import type { GymManagerStats } from "@jits/shared/types/analytics";
import { Calendar, Users, Swords, UserCheck } from "lucide-react";

interface GymStatsProps {
  stats: GymManagerStats;
}

const statItems = [
  { key: "totalSessions", label: "Sessions", Icon: Calendar },
  { key: "totalParticipants", label: "Check-ins", Icon: Users },
  { key: "totalMatches", label: "Matches", Icon: Swords },
  { key: "activeMemberCount", label: "Members", Icon: UserCheck },
] as const;

export function GymStats({ stats }: GymStatsProps) {
  return (
    <section>
      <h3 className="font-semibold mb-3 text-sm">Gym Stats</h3>
      <div className="grid grid-cols-2 gap-3">
        {statItems.map(({ key, label, Icon }) => (
          <Card key={key}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xl font-bold tabular-nums">{stats[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
