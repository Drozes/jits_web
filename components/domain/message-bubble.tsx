import { cn } from "@/lib/utils";
import type { Message } from "@/types/message";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isPending?: boolean;
}

export function MessageBubble({ message, isOwn, isPending }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "flex",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md",
          isPending && "opacity-60",
        )}
      >
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        <p
          className={cn(
            "mt-0.5 text-[10px]",
            isOwn ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
