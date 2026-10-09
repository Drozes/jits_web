import * as React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { duration, spring, useReduceMotion } from "@/lib/motion";

/** "▲ +14" / "▼ −9" / "0": the sign AND an arrow glyph, never color alone. */
export function formatDeltaChip(delta: number): string {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ −${Math.abs(delta)}`;
  return "0";
}

/** Spoken form of a rating move: "up 14", "down 9", "no change". */
export function spokenDelta(delta: number): string {
  if (delta > 0) return `up ${delta}`;
  if (delta < 0) return `down ${Math.abs(delta)}`;
  return "no change";
}

/** Scale the chip pops from. */
export const DELTA_CHIP_FROM_SCALE = 0.6;

interface DeltaChipProps {
  delta: number;
  /** Text color: Gain Green up, the negative token down (amber on a draw). */
  color: string;
  /**
   * Pop in when this flips to true (the roll landed). With `animate` false
   * the chip is simply shown in place.
   */
  shown: boolean;
  /** This mount plays the pop (a real transition, once). */
  animate: boolean;
  style?: StyleProp<TextStyle>;
  /** Dynamic Type cap for the chip's text (the header delta stops at 1.3x). */
  maxFontSizeMultiplier?: number;
  testID?: string;
}

/**
 * The ELO delta chip (Motion Rule registry, a Moment): after the roll
 * lands it pops in from 0.6 on the short press spring with a fade. Under
 * Reduce Motion, or when the moment already played, it is shown in place.
 */
export function DeltaChip({ delta, color, shown, animate, style, maxFontSizeMultiplier, testID }: DeltaChipProps) {
  const reduceMotion = useReduceMotion();
  const pop = animate && !reduceMotion;
  const visible = shown || !animate;
  const scale = useSharedValue(pop && !visible ? DELTA_CHIP_FROM_SCALE : 1);
  const opacity = useSharedValue(pop && !visible ? 0 : 1);
  const poppedRef = React.useRef(!pop || visible);

  React.useEffect(() => {
    if (!visible || poppedRef.current) return;
    poppedRef.current = true;
    scale.value = withSpring(1, spring.press);
    opacity.value = withTiming(1, { duration: duration.instant });
  }, [visible, scale, opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={anim}>
      <Text
        testID={testID}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        className="font-mono-bold"
        style={[{ color, fontVariant: ["tabular-nums"] }, style]}>
        {formatDeltaChip(delta)}
      </Text>
    </Animated.View>
  );
}
