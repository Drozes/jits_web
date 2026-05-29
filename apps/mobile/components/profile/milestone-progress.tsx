import { Text, View } from "react-native";
import { getCurrentMilestone, getNextMilestone, getMilestoneProgress } from "@jits/shared/utils";
import { Plate } from "@/components/ui/elo-system";

interface MilestoneProgressProps {
  elo: number;
}

export function MilestoneProgress({ elo }: MilestoneProgressProps) {
  const current = getCurrentMilestone(elo);
  const next = getNextMilestone(elo);
  const progress = getMilestoneProgress(elo);

  return (
    <Plate>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
          {current.name}
        </Text>
        {next ? (
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l tabular-nums">
            {next.threshold - elo} to {next.name}
          </Text>
        ) : (
          <Text className="font-mono-bold text-[10px] text-positive uppercase tracking-caps-l">
            Max Rank
          </Text>
        )}
      </View>
      <View className="h-1.5 rounded-xs bg-surface-4 overflow-hidden">
        <View className="h-full bg-cta" style={{ width: `${progress}%` }} />
      </View>
      {next && (
        <View className="flex-row justify-between mt-2">
          <Text className="font-mono text-[10px] text-ink-3 tabular-nums">
            {current.threshold}
          </Text>
          <Text className="font-mono text-[10px] text-ink-3 tabular-nums">
            {next.threshold}
          </Text>
        </View>
      )}
    </Plate>
  );
}
