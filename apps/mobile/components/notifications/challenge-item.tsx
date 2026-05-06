import { Pressable, Text, View } from "react-native";
import { ChevronRight, Zap } from "lucide-react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import type { PendingChallenge } from "@jits/shared/hooks/use-pending-challenges";

export function ChallengeItem({
  challenge,
  onNavigate,
}: {
  challenge: PendingChallenge;
  onNavigate: () => void;
}) {
  return (
    <Pressable
      onPress={onNavigate}
      className="flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-accent/40"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
        <Zap size={16} color="#f59e0b" />
      </View>
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-foreground"
        >
          {challenge.challengerName}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {challenge.matchType === "ranked" ? "Ranked" : "Casual"} challenge
          {" · "}
          {formatRelativeDate(challenge.createdAt)}
        </Text>
      </View>
      <ChevronRight size={16} color="#a1a1aa" />
    </Pressable>
  );
}
