import * as React from "react";
import { View, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

interface LivePillProps {
  label?: string;
  className?: string;
}

const PULSE_DURATION_MS = 1400;

export function LivePill({ label = "LIVE", className }: LivePillProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.45, { duration: PULSE_DURATION_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    scale.value = withRepeat(
      withTiming(0.8, { duration: PULSE_DURATION_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, scale]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className={cn("flex-row items-center gap-2", className)}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="bg-positive"
        style={[{ width: 7, height: 7, borderRadius: 3.5 }, dotStyle]}
      />
      <Text className="font-mono-bold text-[10px] text-positive uppercase tracking-caps-xl">
        {label}
      </Text>
    </View>
  );
}
