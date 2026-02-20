import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ConversationRow } from "@/lib/api/chat-queries";
import { cn, getInitials, getProfilePhotoUrl, formatRelativeTime } from "@/lib/utils";
import { OnlineIndicator } from "./online-indicator";
import { Users } from "lucide-react";

interface ConversationCardProps {
  conversation: ConversationRow;
  currentAthleteId: string;
}

export function ConversationCard({
  conversation: c,
  currentAthleteId,
}: ConversationCardProps) {
  const isDirect = c.conversation_type === "direct";
  const name = isDirect
    ? (c.other_athlete_display_name ?? "Unknown")
    : (c.gym_name ?? "Gym Chat");

  const hasUnread = c.unread_count > 0;

  const timeLabel = c.last_message_created_at
    ? formatRelativeTime(c.last_message_created_at)
    : "";

  return (
    <Link
      href={`/messages/${c.conversation_id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-3 transition-all hover:bg-muted/50 active:scale-[0.98] active:opacity-90"
    >
      <OnlineIndicator athleteId={isDirect ? (c.other_athlete_id ?? "") : ""} className="shrink-0">
        <Avatar className="h-10 w-10 border-2 border-accent/20 bg-gradient-to-br from-primary to-primary/80 text-white">
          {isDirect && c.other_athlete_profile_photo_url && (
            <AvatarImage src={getProfilePhotoUrl(c.other_athlete_profile_photo_url)!} alt={name} className="object-cover" />
          )}
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 font-bold text-white text-xs">
            {isDirect ? getInitials(name) : <Users className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      </OnlineIndicator>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              hasUnread ? "font-semibold" : "font-medium",
            )}
          >
            {name}
          </span>
          {timeLabel && (
            <span
              className={cn(
                "shrink-0 text-xs",
                hasUnread ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {timeLabel}
            </span>
          )}
        </div>
        <p
          className={cn(
            "truncate text-xs",
            hasUnread ? "text-foreground font-medium" : "text-muted-foreground",
          )}
        >
          {c.last_message_body
            ? c.last_message_sender_id === currentAthleteId
              ? `You: ${c.last_message_body}`
              : c.last_message_body
            : "No messages yet"}
        </p>
      </div>

      {c.unread_count > 0 && (
        <Badge variant="default" className="h-5 min-w-5 shrink-0 rounded-full px-1.5 text-[10px]">
          {c.unread_count > 99 ? "99+" : c.unread_count}
        </Badge>
      )}
    </Link>
  );
}
