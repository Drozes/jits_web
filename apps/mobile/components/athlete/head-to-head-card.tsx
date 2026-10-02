import { Text, View } from "react-native";
import { Swords } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { HeadToHeadMatch } from "@/components/compare-stats-parts";

function StatColumn({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "positive" | "negative" | "neutral" | "ink";
}) {
  const tone_ =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "neutral"
          ? "text-ink-3"
          : "text-ink";
  return (
    <View className="items-center flex-1">
      <Text
        className={`font-mono-bold text-headline ${tone_} tabular-nums`}
      >
        {value}
      </Text>
      <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l mt-1">
        {label}
      </Text>
    </View>
  );
}

export function HeadToHeadCard({ matches }: { matches: HeadToHeadMatch[] }) {
  const tokens = useThemedTokens();
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const draws = matches.filter((m) => m.result === "draw").length;

  return (
    <Plate>
      <View className="flex-row items-center gap-2 mb-3">
        <Swords size={14} color={tokens.textTertiary} />
        <Text className="font-heading text-small text-ink uppercase tracking-caps">
          Head-to-Head
        </Text>
      </View>
      {matches.length === 0 ? (
        <View className="items-center py-4 gap-1">
          <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
            No History Yet
          </Text>
          <Text className="font-body text-caption text-ink-3">
            Challenge them to your first match
          </Text>
        </View>
      ) : (
        <View className="flex-row">
          <StatColumn value={wins} label="Wins" tone="ink" />
          <StatColumn value={losses} label="Losses" tone="negative" />
          <StatColumn value={draws} label="Draws" tone="neutral" />
          <StatColumn value={matches.length} label="Total" tone="ink" />
        </View>
      )}
    </Plate>
  );
}
