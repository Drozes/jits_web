import { Text, View } from "react-native";
import type { WeeklyActivity } from "@jits/shared/types/analytics";
import { Plate } from "@/components/ui/elo-system";

interface WeeklyActivitySectionProps {
  weeks: WeeklyActivity[];
}

export function WeeklyActivitySection({ weeks }: WeeklyActivitySectionProps) {
  const maxMatches = Math.max(1, ...weeks.map((w) => w.matches));
  const hasActivity = weeks.some((w) => w.matches > 0);

  return (
    <Plate>
      <Text className="font-heading text-[12px] text-ink uppercase tracking-caps mb-3">
        Weekly Activity
      </Text>
      {!hasActivity ? (
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l text-center py-2">
          No matches in the last 8 weeks
        </Text>
      ) : (
        <View className="flex-row items-end gap-1 h-16">
          {weeks.map((w) => {
            const height = w.matches > 0 ? Math.max(8, (w.matches / maxMatches) * 100) : 0;
            return (
              <View key={w.week} className="flex-1 items-center gap-1">
                <View className="w-full justify-end" style={{ height: 48 }}>
                  {w.matches > 0 && (
                    <View
                      className="w-full bg-cta rounded-xs"
                      style={{ height: `${height}%` }}
                    />
                  )}
                </View>
                <Text className="font-mono text-[9px] text-ink-3 tabular-nums">
                  {w.week}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Plate>
  );
}
