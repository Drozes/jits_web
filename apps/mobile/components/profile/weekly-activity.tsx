import { Text, View } from "react-native";
import type { WeeklyActivity } from "@jits/shared/types/analytics";
import { Card, CardContent } from "@/components/ui/card";

interface WeeklyActivitySectionProps {
  weeks: WeeklyActivity[];
}

export function WeeklyActivitySection({ weeks }: WeeklyActivitySectionProps) {
  const maxMatches = Math.max(1, ...weeks.map((w) => w.matches));
  const hasActivity = weeks.some((w) => w.matches > 0);

  return (
    <Card>
      <CardContent className="p-4 gap-2">
        <Text className="text-sm font-heading text-foreground">Weekly Activity</Text>
        {!hasActivity ? (
          <Text className="text-xs text-muted-foreground text-center py-2">
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
                        className="w-full rounded-sm bg-primary/80"
                        style={{ height: `${height}%` }}
                      />
                    )}
                  </View>
                  <Text className="text-[9px] text-muted-foreground tabular-nums">{w.week}</Text>
                </View>
              );
            })}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
