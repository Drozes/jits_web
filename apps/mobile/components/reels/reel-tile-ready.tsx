import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Clapperboard } from "lucide-react-native";
import type { ReelItem } from "@/lib/highlight/reel-types";
import { useReduceMotion } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { REEL_TILE_SIZE, TileCaption, TileFrame, type ReelTileSize } from "./reel-tile-frame";
import { durationChip, readyA11yLabel, readyCaption, sourceChip } from "./reel-tile-copy";
import { runReveal, runRingPulse } from "./reel-motion";

/** `#RRGGBB` at an alpha, for the source chip's surface-3 at 85%. */
export function withAlpha(hex: string | undefined, alpha: number): string | undefined {
  const m = hex ? /^#([0-9a-f]{6})$/i.exec(hex) : null;
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * A ready reel (spec 5): signed poster (cover, centred), duration chip, the
 * source chip on a reel that is not the athlete's own, the unseen ring, and
 * the caption (`vs {opp}` for an own reel, else the subject's name). `pulse`
 * runs one ring pulse; `reveal` fades the tile in (a building tile that just
 * landed). Neither moves under Reduce Motion.
 */
export function ReadyTile({
  item,
  size,
  pulse,
  reveal,
  onPress,
  testID,
}: {
  item: ReelItem;
  size: ReelTileSize;
  pulse?: boolean;
  reveal?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const tokens = useThemedTokens();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const chip = sourceChip(item);
  const { width, height } = REEL_TILE_SIZE[size];

  React.useEffect(() => {
    if (pulse && !reduceMotion) runRingPulse(scale);
  }, [pulse, reduceMotion, scale]);
  React.useEffect(() => {
    if (reveal && !reduceMotion) runReveal(opacity);
  }, [reveal, reduceMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={readyA11yLabel(item)}
      style={{ gap: 6 }}
    >
      <Animated.View style={animated}>
        <TileFrame size={size} ring={item.unseen}>
          <View className="bg-surface-4 items-center justify-center" style={{ width, height }}>
            {item.posterUrl ? (
              <Image
                source={{ uri: item.posterUrl }}
                style={{ position: "absolute", top: 0, left: 0, width, height }}
                contentFit="cover"
                contentPosition="center"
              />
            ) : (
              <Clapperboard size={18} color={tokens.textTertiary} />
            )}
            {chip ? (
              <View
                testID="reel-source-chip"
                style={{ position: "absolute", top: 6, left: 6, height: 18, paddingHorizontal: 5, borderRadius: 2, justifyContent: "center", backgroundColor: withAlpha(tokens.bgElevated, 0.85) }}
              >
                <Text className="font-mono-bold text-micro text-ink-2 tracking-caps tabular-nums">{chip.label}</Text>
              </View>
            ) : null}
            <View
              style={{ position: "absolute", bottom: 5, left: 5, height: 18, paddingHorizontal: 5, borderRadius: 2, justifyContent: "center", backgroundColor: ON_MEDIA.badge }}
            >
              <Text className="font-mono-bold text-micro tabular-nums" style={{ color: ON_MEDIA.white }}>
                {durationChip(item.durationS)}
              </Text>
            </View>
          </View>
        </TileFrame>
      </Animated.View>
      <TileCaption title={readyCaption(item)} />
    </Pressable>
  );
}
