import * as React from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { darkTokens } from "@/lib/tokens";
import { useReelProgress } from "@/lib/highlight/use-reel-player-pool";
import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";

/** Matches the players' ~4 Hz time updates, so the fill glides between them. */
const STEP_MS = 250;

/**
 * The visible reel's playback progress (spec 8.2): 2 pt, full width, `ink`
 * fill on an `ink-3` track at 40%. The fill is a `scaleX` on the UI thread,
 * eased linearly between time updates (it carries information, so it also
 * runs under Reduce Motion); a loop back to the start snaps. Display only.
 */
export function ReelProgressBar({ pool, index }: { pool: ReelPoolController; index: number }) {
  const progress = useReelProgress(pool, index);
  const [width, setWidth] = React.useState(0);
  const scale = useSharedValue(progress);
  React.useEffect(() => {
    scale.value = progress < scale.value ? progress : withTiming(progress, { duration: STEP_MS, easing: Easing.linear });
  }, [progress, scale]);
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: (-width * (1 - scale.value)) / 2 }, { scaleX: scale.value }] }));
  return (
    <View
      testID="reel-progress"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: 2, overflow: "hidden" }}
    >
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, backgroundColor: darkTokens.textTertiary, opacity: 0.4 }} />
      <Animated.View testID="reel-progress-fill" style={[{ height: 2, width: "100%", backgroundColor: darkTokens.textPrimary }, fill]} />
    </View>
  );
}
