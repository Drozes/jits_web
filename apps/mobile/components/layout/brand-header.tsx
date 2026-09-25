import * as React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/ui/elo-system";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LiveHeaderSignal } from "./live-header-signal";

interface BrandHeaderProps {
  athleteId: string;
}

/**
 * The wordmark header for the untitled top-level tabs (Home, Rankings).
 *
 * Same 56pt bar, surface and right cluster as `AppHeader` on the titled tabs
 * (Arena, Profile), so the four tab headers read as one system: the right side
 * is exactly the LIVE signal (only while live) then the notification bell,
 * 8pt apart. Nothing else goes on the right.
 */
export function BrandHeader({ athleteId }: BrandHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface-2 border-b border-hairline flex-row items-center justify-between px-4"
      style={{ paddingTop: insets.top, height: 56 + insets.top }}
    >
      <Wordmark size="md" />
      <View className="flex-row items-center gap-2">
        <LiveHeaderSignal />
        <NotificationBell athleteId={athleteId} />
      </View>
    </View>
  );
}
