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
import { duration } from "@/lib/motion";

interface LivePillProps {
  label?: string;
  className?: string;
  /**
   * Fixed #22C55E dot and text for dark chrome over video (the live
   * broadcast clock slab), whatever the app theme.
   */
  onDark?: boolean;
}

const ON_DARK_GREEN = "#22C55E";

/** One full LIVE pulse cycle (`duration.pulse`, Motion Rule). */
const PULSE_DURATION_MS = duration.pulse;

interface LiveDotProps {
  /** Dot diameter in points. 7 by default (the LIVE pill's). */
  size?: number;
  /** Fixed #22C55E, for dark chrome over video. */
  onDark?: boolean;
  testID?: string;
}

/**
 * The pulsing green LIVE dot on its own. It is the app's ONE pulse (1400ms,
 * `PULSE_DURATION_MS`): the LIVE pill and the header status chip render this,
 * so there is never a second rhythm. The pushed screens' `HeaderLiveDot`
 * (`components/layout/header-live-dot.tsx`) is deliberately STATIC and must
 * not use this (decision Q1, spec 3: one pulse).
 * Decorative: hidden from assistive tech, the caller labels the state.
 */
export function LiveDot({ size = 7, onDark = false, testID }: LiveDotProps) {
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
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={onDark ? undefined : "bg-positive"}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        onDark ? { backgroundColor: ON_DARK_GREEN } : null,
        dotStyle,
      ]}
    />
  );
}

export function LivePill({ label = "LIVE", className, onDark = false }: LivePillProps) {
  return (
    // 6 px on dark chrome, matching the broadcast slab's static labels.
    <View className={cn("flex-row items-center", onDark ? undefined : "gap-2", className)} style={onDark ? { gap: 6 } : undefined}>
      <LiveDot onDark={onDark} />
      <Text
        className={cn(
          "font-mono-bold text-[10px] uppercase tracking-caps-xl",
          onDark ? undefined : "text-positive",
        )}
        style={onDark ? { color: ON_DARK_GREEN } : undefined}
      >
        {label}
      </Text>
    </View>
  );
}
