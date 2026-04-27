"use client";

import { useOnlineStatus } from "@/hooks/use-online-presence";
import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  athleteId: string;
  children: React.ReactNode;
  className?: string;
}

export function OnlineIndicator({ athleteId, children, className }: OnlineIndicatorProps) {
  const online = useOnlineStatus(athleteId);

  return (
    <div
      className={cn(
        "relative rounded-full transition-shadow",
        online && "ring-2 ring-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]",
        className,
      )}
    >
      {children}
      {online && (
        <span className="absolute right-0 bottom-0 z-10 block size-2.5 rounded-full bg-green-500 ring-2 ring-background" />
      )}
    </div>
  );
}
