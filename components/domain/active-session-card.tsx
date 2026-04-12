import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users } from "lucide-react";
import type { ActiveSessionInfo } from "@/types/session";

interface ActiveSessionCardProps {
  session: ActiveSessionInfo | null;
}

function formatStartsIn(scheduledStart: string) {
  const diff = new Date(scheduledStart).getTime() - Date.now();
  if (diff <= 0) return "Starting now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Starts in ${mins}m`;
  const hours = Math.floor(mins / 60);
  return `Starts in ${hours}h ${mins % 60}m`;
}

export function ActiveSessionCard({ session }: ActiveSessionCardProps) {
  if (!session) {
    return (
      <Link href="/gyms">
        <Card variant="interactive" className="border-dashed p-6 text-center active:scale-[0.98]">
          <MapPin className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Find a session</p>
          <p className="text-xs text-muted-foreground mt-1">
            Browse gyms and join an open mat
          </p>
        </Card>
      </Link>
    );
  }

  if (session.status === "active") {
    return (
      <Card className="border-green-500/30 bg-green-500/5 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="success" className="text-[10px]">Live</Badge>
              <span className="text-sm font-semibold">Session at {session.gymName}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {session.participantCount} checked in
          </div>
          <Link href={`/session/${session.sessionId}/join`}>
            <Button size="sm" className="w-full mt-1">Go to Lobby</Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Scheduled
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Upcoming at {session.gymName}</span>
          <Badge variant="secondary" className="text-[10px]">
            {formatStartsIn(session.scheduledStart)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {session.participantCount} checked in
        </div>
      </div>
    </Card>
  );
}
