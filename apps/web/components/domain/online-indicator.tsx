"use client";

import { useOnlineStatus } from "@/hooks/use-online-presence";
import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  athleteId: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * app:online presence dot.
 *
 * Brand rules: no drop shadows (the old version painted an 8px green glow),
 * and the notch ring must match the page ground, not shadcn's --background,
 * which resolves light and drew a near-white halo on the dark shell.
 * The sr-only label keeps "online" from being conveyed by colour alone.
 */
export function OnlineIndicator({ athleteId, children, className }: OnlineIndicatorProps) {
  const online = useOnlineStatus(athleteId);

  return (
    <div
      className={cn("relative rounded-full", className)}
      style={
        online
          ? { boxShadow: "0 0 0 2px var(--state-positive)" }
          : undefined
      }
    >
      {children}
      {online && (
        <>
          <span
            aria-hidden
            className="absolute right-0 bottom-0 z-10 block size-2.5 rounded-full"
            style={{
              background: "var(--state-positive)",
              boxShadow: "0 0 0 2px var(--bg-primary)",
            }}
          />
          <span className="sr-only">Online</span>
        </>
      )}
    </div>
  );
}
