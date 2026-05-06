import { Text, View } from "react-native";
import type { SubmissionBreakdown } from "@jits/shared/types/analytics";
import { Card, CardContent } from "@/components/ui/card";

interface SubmissionBreakdownSectionProps {
  submissions: SubmissionBreakdown[];
}

export function SubmissionBreakdownSection({ submissions }: SubmissionBreakdownSectionProps) {
  const top5 = submissions.slice(0, 5);
  const maxCount = Math.max(1, ...top5.map((s) => s.count));

  if (top5.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 items-center">
          <Text className="text-sm font-heading text-foreground mb-2">Top Submissions</Text>
          <Text className="text-xs text-muted-foreground">No submissions recorded yet</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 gap-3">
        <Text className="text-sm font-heading text-foreground">Top Submissions</Text>
        {top5.map((s) => {
          const pct = Math.round((s.count / maxCount) * 100);
          return (
            <View key={s.type} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-foreground" numberOfLines={1}>{s.type}</Text>
                <Text className="text-xs font-mono text-muted-foreground tabular-nums">
                  {s.asWinner}W / {s.asLoser}L
                </Text>
              </View>
              <View className="h-2 rounded-full bg-muted overflow-hidden">
                <View className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}
