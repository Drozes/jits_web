import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ProfileHighlight } from "@/lib/highlight/use-my-highlights";
import { MetaTag } from "@/components/ui/elo-system";

export const HIGHLIGHT_TILE_WIDTH = 96;
const TILE_HEIGHT = Math.round((HIGHLIGHT_TILE_WIDTH * 16) / 9);

export function highlightTileLabel(item: Pick<ProfileHighlight, "opponentName" | "durationS">): string {
  const seconds = Math.round(item.durationS);
  return item.opponentName ? `Highlight vs ${item.opponentName}, ${seconds} seconds` : `Highlight, ${seconds} seconds`;
}

/** One 9:16 poster tile: "NEW" tag while unseen, duration badge in mono. */
export function HighlightTile({ item, onPress }: { item: ProfileHighlight; onPress: () => void }) {
  return (
    <Pressable
      testID={`highlight-tile-${item.highlightId}`}
      accessibilityRole="button"
      accessibilityLabel={highlightTileLabel(item)}
      onPress={onPress}
      className="bg-surface-4 rounded-md overflow-hidden active:opacity-70"
      style={{ width: HIGHLIGHT_TILE_WIDTH, height: TILE_HEIGHT }}
    >
      {item.posterUrl ? (
        <Image
          testID={`highlight-tile-poster-${item.highlightId}`}
          source={{ uri: item.posterUrl, cacheKey: item.posterPath ? `highlight-poster:${item.posterPath}` : undefined }}
          style={{ width: HIGHLIGHT_TILE_WIDTH, height: TILE_HEIGHT }}
          contentFit="cover"
        />
      ) : null}
      {item.unseen ? (
        <View testID={`highlight-tile-new-${item.highlightId}`} className="absolute top-1 left-1">
          <MetaTag className="bg-surface-2">NEW</MetaTag>
        </View>
      ) : null}
      <View className="absolute bottom-1 left-1 bg-surface-2 rounded-xs px-1">
        <Text className="font-mono text-[10px] text-ink" style={{ fontVariant: ["tabular-nums"] }}>
          {`${Math.round(item.durationS)}s`}
        </Text>
      </View>
    </Pressable>
  );
}
