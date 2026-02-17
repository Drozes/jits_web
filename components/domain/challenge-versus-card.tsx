import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Swords } from "lucide-react";
import { getInitials, getProfilePhotoUrl, formatRelativeDate } from "@/lib/utils";
import type { ChallengeStatus } from "@/lib/constants";

interface Participant {
  id: string;
  displayName: string;
  profilePhotoUrl?: string | null;
}

interface ChallengeVersusCardProps {
  challenger: Participant;
  opponent: Participant;
  status: ChallengeStatus;
  matchType: string;
  date: string;
  currentAthleteId: string;
  href?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  accepted: { label: "Accepted", className: "border-green-500/30 bg-green-500/10 text-green-600" },
  declined: { label: "Declined", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  expired: { label: "Expired", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
};

function AvatarWithLabel({ participant, isYou }: { participant: Participant; isYou: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <Avatar className="h-12 w-12 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
        {participant.profilePhotoUrl && (
          <AvatarImage src={getProfilePhotoUrl(participant.profilePhotoUrl)!} alt={participant.displayName} className="object-cover" />
        )}
        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white text-sm">
          {getInitials(participant.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium truncate max-w-[80px]">{participant.displayName}</span>
        {isYou && (
          <Badge variant="outline" className="border-accent text-[10px] text-accent px-1 py-0">You</Badge>
        )}
      </div>
    </div>
  );
}

function CardInner({ challenger, opponent, status, matchType, date, currentAthleteId }: ChallengeVersusCardProps) {
  const config = statusConfig[status] ?? statusConfig.pending;

  return (
    <CardContent className="py-4 px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AvatarWithLabel participant={challenger} isYou={challenger.id === currentAthleteId} />
          <Swords className="h-5 w-5 text-muted-foreground shrink-0" />
          <AvatarWithLabel participant={opponent} isYou={opponent.id === currentAthleteId} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={config.className}>{config.label}</Badge>
          <span className="text-[11px] text-muted-foreground capitalize">{matchType}</span>
          <span className="text-[11px] text-muted-foreground">{formatRelativeDate(date)}</span>
        </div>
      </div>
    </CardContent>
  );
}

export function ChallengeVersusCard(props: ChallengeVersusCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} prefetch={false}>
        <Card className="cursor-pointer hover:bg-accent/50 transition-all active:scale-[0.98] active:opacity-90">
          <CardInner {...props} />
        </Card>
      </Link>
    );
  }

  return (
    <Card>
      <CardInner {...props} />
    </Card>
  );
}
