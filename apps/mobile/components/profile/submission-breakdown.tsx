import { Text, View } from "react-native";
import type { SubmissionBreakdown } from "@jits/shared/types/analytics";
import { Plate } from "@/components/ui/elo-system";

interface SubmissionBreakdownSectionProps {
  submissions: SubmissionBreakdown[];
}

export function SubmissionBreakdownSection({ submissions }: SubmissionBreakdownSectionProps) {
  const top5 = submissions.slice(0, 5);
  const maxCount = Math.max(1, ...top5.map((s) => s.count));

  if (top5.length === 0) {
    return (
      <Plate>
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps mb-2">
          Top Submissions
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          No submissions recorded yet
        </Text>
      </Plate>
    );
  }

  return (
    <Plate>
      <Text className="font-heading text-[12px] text-ink uppercase tracking-caps mb-3">
        Top Submissions
      </Text>
      <View className="gap-3">
        {top5.map((s) => {
          const pct = Math.round((s.count / maxCount) * 100);
          return (
            <View key={s.type} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-body text-[12px] text-ink" numberOfLines={1}>
                  {s.type}
                </Text>
                <View className="flex-row items-center gap-1">
                  <Text className="font-mono-bold text-positive text-[11px] tabular-nums">
                    {s.asWinner}W
                  </Text>
                  <Text className="font-mono text-ink-3 text-[11px]">·</Text>
                  <Text className="font-mono-bold text-negative text-[11px] tabular-nums">
                    {s.asLoser}L
                  </Text>
                </View>
              </View>
              <View className="h-1.5 rounded-xs bg-surface-4 overflow-hidden">
                <View className="h-full bg-cta" style={{ width: `${pct}%` }} />
              </View>
            </View>
          );
        })}
      </View>
    </Plate>
  );
}
