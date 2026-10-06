import * as React from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { ChevronUp } from "lucide-react-native";
import { duration, easing, useReduceMotion } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { VIEWER_COPY } from "./viewer-copy";

/** Chevron lift of the hint bounce, pt. */
const BOUNCE = 4;

/**
 * C-V1 "Swipe up for the next one" under the actions (spec 8, AC 4.6). The
 * pager decides when it shows (once per install, lanes of 2+ pages, gone
 * after the first swipe or 4 s). Motion registry "Swipe hint": the chevron
 * lifts twice when the hint appears (a Moment); still under Reduce Motion.
 */
export function SwipeHint() {
  const reduceMotion = useReduceMotion();
  const lift = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) return;
    const half = { duration: duration.fast, easing: easing.brandOut };
    lift.value = withRepeat(withSequence(withTiming(-BOUNCE, half), withTiming(0, half)), 2, false);
  }, [lift, reduceMotion]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  return (
    <View testID="swipe-hint" accessibilityRole="text" className="flex-row items-center gap-1">
      <Animated.View style={chevron}>
        <ChevronUp size={14} color={ON_MEDIA.text2} />
      </Animated.View>
      <Text className="font-mono text-caption uppercase tracking-caps tabular-nums" style={{ color: ON_MEDIA.text2 }}>
        {VIEWER_COPY.swipeHint}
      </Text>
    </View>
  );
}
