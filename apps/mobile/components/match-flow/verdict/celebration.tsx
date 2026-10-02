import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/lib/match-flow/use-reduce-motion";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_EASING } from "../fight/fight-tokens";

const EASE = Easing.bezier(...FIGHT_EASING);

/** Sharp rectangles, brand colors only (palette keys); x is a fraction of the width. */
const PIECES = [
  { x: 0.09, w: 6, h: 14, c: "cta" as const, d: 0 },
  { x: 0.18, w: 8, h: 8, c: "text" as const, d: 180 },
  { x: 0.28, w: 5, h: 16, c: "red" as const, d: 90 },
  { x: 0.38, w: 10, h: 5, c: "text" as const, d: 320 },
  { x: 0.48, w: 6, h: 12, c: "cta" as const, d: 40 },
  { x: 0.58, w: 7, h: 7, c: "text" as const, d: 260 },
  { x: 0.67, w: 5, h: 14, c: "cta" as const, d: 140 },
  { x: 0.76, w: 9, h: 5, c: "red" as const, d: 380 },
  { x: 0.85, w: 6, h: 10, c: "text" as const, d: 60 },
  { x: 0.93, w: 5, h: 13, c: "cta" as const, d: 220 },
];

/**
 * One fall of confetti over the win verdict (a Moment in the Motion Rule
 * registry). Plays once; nothing at all under Reduce Motion.
 */
export function Confetti({ height = 600 }: { height?: number }) {
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const palette = usePalette();
  if (reduceMotion) return null;
  return (
    <View testID="verdict-confetti" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { height }]}>
      {PIECES.map((p, i) => (
        <Piece key={i} left={p.x * width} w={p.w} h={p.h} color={palette[p.c]} delay={p.d} fall={height} />
      ))}
    </View>
  );
}

function Piece({ left, w, h, color, delay, fall }: { left: number; w: number; h: number; color: string; delay: number; fall: number }) {
  const y = useSharedValue(-20);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);
  React.useEffect(() => {
    y.value = withDelay(delay, withTiming(fall, { duration: 1800, easing: Easing.in(Easing.quad) }));
    rot.value = withDelay(delay, withTiming(360, { duration: 1800 }));
    opacity.value = withDelay(delay + 1200, withTiming(0, { duration: 600 }));
  }, [y, rot, opacity, delay, fall]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }],
  }));
  return <Animated.View style={[{ position: "absolute", top: 0, left, width: w, height: h, backgroundColor: color }, style]} />;
}

/** "YOU WON" slams in (scale + fade), once; static under Reduce Motion. */
export function SlamIn({ children, animate }: { children: React.ReactNode; animate: boolean }) {
  const reduceMotion = useReduceMotion();
  const play = animate && !reduceMotion;
  const scale = useSharedValue(play ? 1.4 : 1);
  const opacity = useSharedValue(play ? 0 : 1);
  React.useEffect(() => {
    if (!play) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = withTiming(1, { duration: 520, easing: EASE });
    opacity.value = withTiming(1, { duration: 300, easing: EASE });
  }, [play, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={[{ alignSelf: "flex-start" }, style]}>{children}</Animated.View>;
}

/** Rises in once after the verdict (the rank strip). */
export function RiseIn({ children, delay = 500 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReduceMotion();
  const y = useSharedValue(reduceMotion ? 0 : 12);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  React.useEffect(() => {
    if (reduceMotion) {
      y.value = 0;
      opacity.value = 1;
      return;
    }
    y.value = withDelay(delay, withTiming(0, { duration: 400, easing: EASE }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: EASE }));
  }, [reduceMotion, delay, y, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Plain text helper so the verdict file stays short. */
export function DisplayText({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return (
    <Text testID={testID} className="font-display" style={style}>
      {children}
    </Text>
  );
}
