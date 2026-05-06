import { Text, View } from "react-native";
import { Swords } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { HeadToHeadMatch } from "@/components/compare-stats-parts";

export function HeadToHeadCard({ matches }: { matches: HeadToHeadMatch[] }) {
  const tokens = useThemedTokens();
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const draws = matches.filter((m) => m.result === "draw").length;

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Swords size={18} color={tokens.primary} />
        <Text className="text-base font-heading text-foreground">
          Head-to-Head
        </Text>
      </View>
      {matches.length === 0 ? (
        <View className="items-center py-2">
          <Text className="text-sm text-muted-foreground">No history yet</Text>
          <Text className="text-xs text-muted-foreground mt-1">
            Challenge them to your first match!
          </Text>
        </View>
      ) : (
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-xl font-mono tabular-nums text-success">
              {wins}
            </Text>
            <Text className="text-[11px] text-muted-foreground">Wins</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-mono tabular-nums text-destructive">
              {losses}
            </Text>
            <Text className="text-[11px] text-muted-foreground">Losses</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-mono tabular-nums text-amber-500">
              {draws}
            </Text>
            <Text className="text-[11px] text-muted-foreground">Draws</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-mono tabular-nums text-foreground">
              {matches.length}
            </Text>
            <Text className="text-[11px] text-muted-foreground">Total</Text>
          </View>
        </View>
      )}
    </Card>
  );
}
