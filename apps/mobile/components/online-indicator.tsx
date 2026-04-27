/**
 * Small green dot used to mark an athlete as online. Renders nothing if the
 * athlete is not currently in the `app:online` Presence set, so it's safe to
 * drop into avatars / list rows unconditionally.
 */
import * as React from "react";
import { View } from "react-native";
import { cn } from "../lib/cn";
import { useOnlineStatus } from "../lib/presence/use-online-presence";

export interface OnlineIndicatorProps {
  athleteId: string;
  className?: string;
}

export function OnlineIndicator({
  athleteId,
  className,
}: OnlineIndicatorProps) {
  const isOnline = useOnlineStatus(athleteId);
  if (!isOnline) return null;
  return (
    <View
      className={cn(
        "h-2.5 w-2.5 rounded-full bg-success border border-background",
        className,
      )}
    />
  );
}
