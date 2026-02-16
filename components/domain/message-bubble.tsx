import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import type { Message } from "@/types/message";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  senderName?: string;
  senderPhotoUrl?: string | null;
  showAvatar?: boolean;
  showSenderLabel?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  isPending,
  isFirstInGroup = true,
  isLastInGroup = true,
  senderName,
  senderPhotoUrl,
  showAvatar,
  showSenderLabel,
}: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  // Adaptive border radius based on group position
  const bubbleRadius = isOwn
    ? cn(
        "rounded-2xl",
        !isFirstInGroup && "rounded-tr-md",
        !isLastInGroup && "rounded-br-md",
        isLastInGroup && "rounded-br-md",
      )
    : cn(
        "rounded-2xl",
        !isFirstInGroup && "rounded-tl-md",
        !isLastInGroup && "rounded-bl-md",
        isLastInGroup && "rounded-bl-md",
      );

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      {/* Avatar placeholder for alignment (received messages only) */}
      {showAvatar && (
        <div className="w-7 shrink-0 self-end mr-2">
          {isLastInGroup && (
            <Avatar className="h-7 w-7" size="sm">
              {senderPhotoUrl && (
                <AvatarImage src={senderPhotoUrl} alt={senderName ?? ""} />
              )}
              <AvatarFallback className="text-[10px]">
                {getInitials(senderName ?? "?")}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className="max-w-[75%]">
        {showSenderLabel && senderName && (
          <p className="mb-0.5 ml-1 text-[11px] font-medium text-muted-foreground">
            {senderName}
          </p>
        )}
        <div
          className={cn(
            "px-3 py-2 text-sm",
            bubbleRadius,
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted",
            isPending && "opacity-60",
          )}
        >
          {message.body && (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
          {isLastInGroup && (
            <p
              className={cn(
                "mt-0.5 text-[10px]",
                isOwn ? "text-primary-foreground/60" : "text-muted-foreground",
              )}
            >
              {time}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
