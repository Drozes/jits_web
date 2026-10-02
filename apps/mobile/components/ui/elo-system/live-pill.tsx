import * as React from "react";
import { View, Text } from "react-native";
import Animated from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { useLivePulseStyle } from "@/lib/arena/arena-tempo";

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

interface LiveDotProps {
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
 * heartbeat) stays in phase. Static under Reduce Motion and paused in the
 * background.
 * Decorative: hidden from assistive tech, the caller labels the state.
 */
export function LiveDot({ size = 7, onDark = false, testID }: LiveDotProps) {
  const dotStyle = useLivePulseStyle();

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
