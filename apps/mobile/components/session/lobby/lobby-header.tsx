import { Text, View } from "react-native";
import { LivePill, MetaTag } from "@/components/ui/elo-system";

interface LobbyHeaderProps {
  gymName: string;
  activeCount: number;
  /** Hide the live pill when the lobby data is still loading or the session is paused. */
  showLive?: boolean;
}

/**
 * Title block for the session lobby. Renders a LivePill + lobby count meta
 * strip on top of a font-heading gym name; matches the C4 wireframe
 * (lines 1010-1027) where the lobby surfaces presence, status, and a quick
 * occupancy count above the action buttons.
 */
export function LobbyHeader({ gymName, activeCount, showLive = true }: LobbyHeaderProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        {showLive ? <LivePill label="LIVE" /> : <View />}
        <MetaTag>
          {activeCount} in lobby
        </MetaTag>
      </View>
      <Text className="font-heading text-[22px] text-ink" numberOfLines={1}>
        {gymName}
      </Text>
    </View>
  );
}
