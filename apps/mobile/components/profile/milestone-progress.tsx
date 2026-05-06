import { Text, View } from "react-native";
import { getCurrentMilestone, getNextMilestone, getMilestoneProgress } from "@jits/shared/utils";
import { Card, CardContent } from "@/components/ui/card";

interface MilestoneProgressProps {
  elo: number;
}

export function MilestoneProgress({ elo }: MilestoneProgressProps) {
  const current = getCurrentMilestone(elo);
  const next = getNextMilestone(elo);
  const progress = getMilestoneProgress(elo);

  return (
    <Card>
      <CardContent className="p-4 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-heading text-foreground">{current.name}</Text>
          {next ? (
            <Text className="text-xs font-mono text-muted-foreground tabular-nums">
              {next.threshold - elo} pts to {next.name}
            </Text>
          ) : (
            <Text className="text-xs font-medium text-success">Max rank</Text>
          )}
        </View>
        <View className="h-2.5 rounded-full bg-muted overflow-hidden">
          <View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </View>
        {next && (
          <View className="flex-row justify-between">
            <Text className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {current.threshold}
            </Text>
            <Text className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {next.threshold}
            </Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
