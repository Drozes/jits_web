import { Text, View } from "react-native";
import { MetaTag } from "@/components/ui/elo-system";

interface RecordStats {
  wins: number;
  losses: number;
  draws: number;
}

interface StatOverviewProps {
  stats: RecordStats;
}

/**
 * Dashboard "Record" block. Mirrors the web wireframe (B1/B2):
 * a small MetaTag label above a single mono line "{W}W · {L}L · {D}D".
 */
export function StatOverview({ stats }: StatOverviewProps) {
  return (
    <View className="gap-2">
      <MetaTag>Record</MetaTag>
      <Text
        className="font-mono-bold text-ink"
        style={{ fontSize: 28, lineHeight: 32, letterSpacing: -0.6 }}
      >
        {stats.wins}W · {stats.losses}L · {stats.draws}D
      </Text>
    </View>
  );
}
