"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePendingChallenges } from "@/hooks/use-pending-challenges";
import { NotificationPanel } from "./notification-panel";

interface NotificationBellProps {
  athleteId: string;
}

export function NotificationBell({ athleteId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { count, challenges } = usePendingChallenges(athleteId);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      <NotificationPanel
        open={open}
        onOpenChange={setOpen}
        challenges={challenges}
      />
    </>
  );
}
