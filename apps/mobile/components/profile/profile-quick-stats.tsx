import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface ProfileQuickStatsProps {
  totalMatches: number;
  winStreak: number;
  bestWinStreak: number;
  eloThisMonth: number;
  /** Optional, used to show win rate as one of the 2-up tiles on My Profile. */
  winRate?: number;
}

function StatTile({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-4 py-4 items-center">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className={cn(
          "font-mono-bold mt-2 tabular-nums",
          valueClassName ?? "text-ink",
        )}
        style={{ fontSize: 28, lineHeight: 34 }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Per G1 wireframe the headline 2-up is Matches / Win Rate. The wider stat set
 * (current streak, best streak, ELO this month) renders as a second compact row
 * so we keep the existing data surfaced without duplicating it.
 */
export function ProfileQuickStats({
  totalMatches,
  winStreak,
  bestWinStreak,
  eloThisMonth,
  winRate,
}: ProfileQuickStatsProps) {
  const eloFormatted =
    eloThisMonth > 0 ? `+${eloThisMonth}` : `${eloThisMonth}`;
  const eloClass =
    eloThisMonth > 0
      ? "text-positive"
      : eloThisMonth < 0
        ? "text-negative"
        : "text-ink";
  const winRateText =
    winRate == null
      ? "0%"
      : winRate > 0
        ? `${winRate}%`
        : "0%";

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <StatTile label="Matches" value={String(totalMatches)} />
        <StatTile label="Win Rate" value={winRateText} />
      </View>
      <View className="flex-row gap-3">
        <StatTile label="Streak" value={String(winStreak)} />
        <StatTile label="Best" value={String(bestWinStreak)} />
        <StatTile
          label="ELO/Mo"
          value={eloFormatted}
          valueClassName={eloClass}
        />
      </View>
    </View>
  );
}
