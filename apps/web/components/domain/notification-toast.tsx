"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { NotificationPayload } from "@/types/notification";

interface NotificationToastProps {
  id: string | number;
  payload: NotificationPayload;
}

export function NotificationToast({ id, payload }: NotificationToastProps) {
  const router = useRouter();

  function handleClick() {
    toast.dismiss(id);
    if (payload.href) router.push(payload.href);
  }

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-background p-3 shadow-[0_4px_24px_rgba(0,0,0,0.12)] ring-1 ring-primary/10 transition-colors hover:bg-muted/50"
    >
      <Avatar className="h-9 w-9 shrink-0">
        {payload.avatarUrl && (
          <AvatarImage src={payload.avatarUrl} alt={payload.title} />
        )}
        <AvatarFallback className="text-xs">
          {payload.avatarFallback ?? getInitials(payload.title)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{payload.title}</p>
        <p className="truncate text-xs text-muted-foreground">{payload.body}</p>
      </div>
    </button>
  );
}
