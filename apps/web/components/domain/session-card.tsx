import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock } from "lucide-react";
import { RsvpButton } from "@/app/(app)/gyms/[id]/rsvp-button";
import type { SessionListItem } from "@jits/shared/types/session";

interface SessionCardProps {
  session: SessionListItem;
  isRsvpd: boolean;
}

function formatSessionTime(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const startTime = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endTime = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateStr}, ${startTime} - ${endTime}`;
}

export function SessionCard({ session, isRsvpd }: SessionCardProps) {
  const title = session.title ?? "Open Mat";
  const isActive = session.status === "active";
  const capacityText = session.maxParticipants
    ? `${session.participantCount}/${session.maxParticipants}`
    : `${session.participantCount}`;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">{title}</span>
          {isActive ? (
            <Badge variant="success" className="text-[10px]">Live</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Scheduled</Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatSessionTime(session.scheduledStart, session.scheduledEnd)}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {capacityText} checked in
            </span>
            {session.rsvpCount > 0 && (
              <span>{session.rsvpCount} RSVP</span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Hosted by {session.createdByName}
        </p>

        <div className="mt-1">
          {isActive ? (
            <Link href={`/session/${session.id}/join`}>
              <Button size="sm" className="w-full">Join Lobby</Button>
            </Link>
          ) : (
            <RsvpButton sessionId={session.id} isRsvpd={isRsvpd} />
          )}
        </div>
      </div>
    </Card>
  );
}
