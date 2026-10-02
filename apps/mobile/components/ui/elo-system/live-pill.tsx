import * as React from "react";
import { View, Text } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { duration, useAppActive, useReduceMotion } from "@/lib/motion";
import {
  LIVE_DOT_MIN_OPACITY,
  LIVE_DOT_MIN_SCALE,
  pulseLevel,
  useLivePulseStyle,
} from "@/lib/arena/arena-tempo";

/**
 * What sets a live dot's speed.
 * - `arena` (default): the shared Arena tempo clock, for "live in the Arena"
 *   indicators (the header chip, Live / In lobby plates, friends live).
 * - `fixed`: the fixed `duration.pulse` cycle (1400 ms), for pills whose
 *   meaning is not the lobby (the match screen's LIVE, a sent challenge).
 */
export type LivePace = "arena" | "fixed";

interface LivePillProps {
  label?: string;
  /** See `LivePace`. `arena` by default. */
  pace?: LivePace;
  className?: string;
  /**
   * Fixed #22C55E dot and text for dark chrome over video (the live
   * broadcast clock slab), whatever the app theme.
   */
  onDark?: boolean;
}

const ON_DARK_GREEN = "#22C55E";

interface LiveDotProps {
  /** `arena` (shared tempo clock, default) or `fixed` (1400 ms). */
  pace?: LivePace;
  /** Dot diameter in points. 7 by default (the LIVE pill's). */
  size?: number;
  /** Fixed #22C55E, for dark chrome over video. */
  onDark?: boolean;
  testID?: string;
}

/**
 * The pulsing green LIVE dot on its own (Motion Rule, Ambient: "LIVE pulse").
 * It beats on the ONE shared Arena tempo clock (`lib/arena/arena-tempo.ts`):
 * its speed follows how many athletes are live in the lobby, and every live
 * dot in the app (this, the LIVE pill, the header live dot, the ON AIR
 * heartbeat) stays in phase. With `pace="fixed"` it keeps its own fixed
 * 1400 ms cycle instead (a match LIVE, a sent challenge: not the lobby).
 * Either way: static under Reduce Motion and paused in the background.
 * Decorative: hidden from assistive tech, the caller labels the state.
 */
export function LiveDot({ size = 7, onDark = false, testID, pace = "arena" }: LiveDotProps) {
  const arenaStyle = useLivePulseStyle(pace === "arena");
  const fixedStyle = useFixedPulseStyle(pace === "fixed");
  const dotStyle = pace === "fixed" ? fixedStyle : arenaStyle;

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

/**
 * The LIVE pulse on a fixed `duration.pulse` cycle, per dot. Runs only while
 * `enabled`, the app is in the foreground and Reduce Motion is off; else
 * static (opacity 1, scale 1).
 */
function useFixedPulseStyle(enabled: boolean) {
  const reduceMotion = useReduceMotion();
  const appActive = useAppActive();
  const animate = enabled && appActive && !reduceMotion;
  const phase = useSharedValue(0);

  React.useEffect(() => {
    if (!animate) return;
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: duration.pulse, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [animate, phase]);

  return useAnimatedStyle(() => {
    const level = animate ? pulseLevel(phase.value) : 0;
    return {
      opacity: 1 - (1 - LIVE_DOT_MIN_OPACITY) * level,
      transform: [{ scale: 1 - (1 - LIVE_DOT_MIN_SCALE) * level }],
    };
  }, [animate]);
}

export function LivePill({ label = "LIVE", className, onDark = false, pace = "arena" }: LivePillProps) {
  return (
    // 6 px on dark chrome, matching the broadcast slab's static labels.
    <View className={cn("flex-row items-center", onDark ? undefined : "gap-2", className)} style={onDark ? { gap: 6 } : undefined}>
      <LiveDot onDark={onDark} pace={pace} />
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
