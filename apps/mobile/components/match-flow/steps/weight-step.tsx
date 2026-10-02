import { Text, View } from "react-native";
import { EloTile } from "@/components/ui/elo-system";

/**
 * One athlete's scale weight as a tile. The match flow's weigh-in moved to
 * the face-off (`components/match-flow/faceoff/`); the practice match still
 * uses this tile on its own weight step.
 */
export function WeightTile({ name, weight }: { name: string; weight: number | null }) {
  return (
    <View className="flex-1 items-center gap-2">
      <Text
        className="font-heading text-caption text-ink-2 uppercase tracking-caps text-center"
        numberOfLines={1}
      >
        {name}
      </Text>
      <EloTile
        label="lbs"
        value={weight != null ? weight : "N/A"}
        size="medium"
      />
    </View>
  );
}
