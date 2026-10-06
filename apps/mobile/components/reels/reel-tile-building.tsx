import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Sparkles } from "lucide-react-native";
import type { BuildingReel } from "@/lib/highlight/reel-lane";
import { useReduceMotion } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { REEL_TILE_SIZE, TileCaption, TileFrame, type ReelTileSize } from "./reel-tile-frame";
import { BUILDING_COPY, buildingA11yLabel, buildingStepLine, readyCaption, stepCounter } from "./reel-tile-copy";
import { useServerCountdown } from "./use-server-countdown";
import { runShimmer } from "./reel-motion";

/** The shimmer band: 40% of the tile, skewed, sweeping left to right. Static (none) under Reduce Motion. */
function ShimmerSweep({ width }: { width: number }) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    runShimmer(progress);
    return () => cancelAnimation(progress);
  }, [progress]);
  const band = width * 0.4;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -band + progress.value * (width + band) }, { skewX: "-12deg" }] }));
  return (
    <Animated.View
      testID="reel-building-shimmer"
      pointerEvents="none"
      style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: band, backgroundColor: ON_MEDIA.glass }, style]}
    />
  );
}

/** Two-step progress: the current step amber, a done step ink, a future step the track. */
function StepBar({ step }: { step: 1 | 2 }) {
  const seg = (i: 1 | 2) => (i === step ? ON_MEDIA.amber : i < step ? ON_MEDIA.text : ON_MEDIA.track);
  return (
    <View style={{ flexDirection: "row", gap: 3 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={{ flex: 1, height: 3, backgroundColor: seg(1) }} />
      <View style={{ flex: 1, height: 3, backgroundColor: seg(2) }} />
    </View>
  );
}

/**
 * The anticipation tile (spec 10.5): the match poster under a dark scrim, a
 * shimmer sweep, and a plate with C-B1 / C-B2 plus the step bar and C-B5, or
 * the C-B3 countdown on the server's clock while the reel waits for another
 * angle. C-B4 sits under the tile. Tapping opens match detail (its Film
 * status plate), never the viewer.
 */
export function BuildingTile({
  reel,
  size,
  onPress,
  animate = true,
  testID,
}: {
  reel: BuildingReel;
  size: ReelTileSize;
  onPress: () => void;
  /** False while the host screen is blurred: the shimmer pauses. */
  animate?: boolean;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const { width, height } = REEL_TILE_SIZE[size];
  const remaining = useServerCountdown(reel.reelState === "waiting" ? reel.waitDeadlineAt : null, reel.serverNow, reel.receivedAt);
  const line = buildingStepLine(reel, remaining);
  const waiting = reel.reelState === "waiting" && remaining != null;
  const step: 1 | 2 = line === BUILDING_COPY.step2 ? 2 : 1;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      // Static while counting down: VoiceOver must not re-announce every second.
      accessibilityLabel={buildingA11yLabel(reel.opponentName, waiting ? BUILDING_COPY.waitingA11y : line)}
      style={{ gap: 6 }}
    >
      <TileFrame size={size}>
        <View className="bg-surface-4" style={{ width, height }}>
          {reel.posterUrl ? (
            <Image source={{ uri: reel.posterUrl, cacheKey: reel.posterPath ?? undefined }} style={{ position: "absolute", top: 0, left: 0, width, height }} contentFit="cover" />
          ) : null}
          <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: ON_MEDIA.scrim }} />
          {reduceMotion || !animate ? null : <ShimmerSweep width={width} />}
          <View style={{ position: "absolute", left: 6, right: 6, bottom: 6, padding: 7, borderRadius: 2, gap: 6, backgroundColor: ON_MEDIA.badge }}>
            <Sparkles size={14} color={ON_MEDIA.amber} />
            {waiting ? (
              <Text testID="reel-building-countdown" className="font-mono-bold text-caption uppercase tracking-caps tabular-nums" style={{ color: ON_MEDIA.amber }}>
                {line}
              </Text>
            ) : (
              <>
                <Text className="font-heading text-small" style={{ color: ON_MEDIA.text }}>
                  {line}
                </Text>
                <StepBar step={step} />
                <Text className="font-mono-medium text-micro tracking-caps tabular-nums" style={{ color: ON_MEDIA.text2 }}>
                  {stepCounter(step)}
                </Text>
              </>
            )}
          </View>
        </View>
      </TileFrame>
      <TileCaption title={readyCaption({ isOwn: true, opponentName: reel.opponentName })} meta={BUILDING_COPY.helper} />
    </Pressable>
  );
}
