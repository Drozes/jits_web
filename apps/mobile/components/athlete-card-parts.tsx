import { Text } from "react-native";
import {
  Award,
  Crown,
  Medal,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { useThemedTokens } from "../lib/theme/use-theme";

export function RankIcon({ rank }: { rank: number }) {
  const tokens = useThemedTokens();
  if (rank === 1) return <Crown size={20} color={tokens.gold} />;
  if (rank === 2) return <Medal size={20} color={tokens.mutedForeground} />;
  if (rank === 3) return <Award size={20} color={tokens.brandOrange} />;
  return (
    <Text className="text-sm font-mono text-muted-foreground">#{rank}</Text>
  );
}

export function EloTrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
  const tokens = useThemedTokens();
  if (trend === "up") return <TrendingUp size={14} color={tokens.success} />;
  if (trend === "down")
    return <TrendingDown size={14} color={tokens.destructive} />;
  return <Minus size={14} color={tokens.mutedForeground} />;
}
