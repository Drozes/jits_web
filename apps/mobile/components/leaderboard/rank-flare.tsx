import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { easing } from "@/lib/motion";
import { RANK_FLARE_MS, RANK_SWAP_MS } from "@/lib/leaderboard/use-rank-climb";

const BAND_WIDTH = 72;

/**
 * Rank-up swap flare: a skewed Signal Red band sweeps once across the
 * athlete's row after the swap lands (Motion Rule registry, "Rank-up swap
 * flare"). Wrap the athlete's row in it for good (so the row never remounts)
 * and set `active` while the climb is in its `swapped` stage: the band then
 * sweeps once and is silent. The caller never activates it under Reduce
 * Motion (no climb is reported then).
 */
export function RankFlare({ active, children }: { active: boolean; children: React.ReactNode }) {
  const width = useSharedValue(0);
  const progress = useSharedValue(0);

  React.useEffect(() => {
    if (!active) return undefined;
    progress.value = 0;
    progress.value = withDelay(
      RANK_SWAP_MS,
      withTiming(1, { duration: RANK_FLARE_MS, easing: easing.brandOut }),
    );
    return () => cancelAnimation(progress);
  }, [active, progress]);

  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );

  const bandStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 && progress.value < 1 ? 0.35 : 0,
    transform: [
      { translateX: -BAND_WIDTH + progress.value * (width.value + BAND_WIDTH * 2) },
      { skewX: "-20deg" },
    ],
  }));

  return (
    <View style={{ overflow: "hidden" }} onLayout={onLayout}>
      {children}
      {active ? (
        <Animated.View
          testID="rank-flare"
          pointerEvents="none"
          className="bg-cta"
          style={[
            { position: "absolute", top: 0, bottom: 0, left: 0, width: BAND_WIDTH },
            bandStyle,
          ]}
        />
      ) : null}
    </View>
  );
}
