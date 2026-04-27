import { Text, View } from "react-native";

interface LobbyHeaderProps {
  gymName: string;
  activeCount: number;
}

/** Title block for the session lobby screen. */
export function LobbyHeader({ gymName, activeCount }: LobbyHeaderProps) {
  return (
    <View className="gap-1">
      <Text className="text-lg font-semibold text-foreground">{gymName}</Text>
      <Text className="text-sm text-muted-foreground">
        {activeCount} fighter{activeCount === 1 ? "" : "s"} in lobby
      </Text>
    </View>
  );
}
