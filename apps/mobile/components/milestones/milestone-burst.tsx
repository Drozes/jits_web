import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { easing, moment, useReduceMotion } from "@/lib/motion";
import { usePalette, type Palette } from "@/lib/theme/palette";

type PieceColor = keyof Pick<Palette, "cta" | "text" | "red" | "text2" | "text3">;

/**
 * 14 sharp rectangles; x is a fraction of the width, d the start delay (ms,
 * at most `moment.milestoneBurstStagger`). `c` is the brand colour (the
 * verdict confetti colours: Signal Red fill, ink, Signal Red text); `ink` is
 * the colour for a loss (ink steps only, no red and no green).
 */
export const BURST_PIECES: readonly { x: number; w: number; h: number; c: PieceColor; ink: PieceColor; d: number }[] = [
  { x: 0.06, w: 5, h: 12, c: "cta", ink: "text", d: 0 },
  { x: 0.13, w: 7, h: 7, c: "text", ink: "text2", d: 120 },
  { x: 0.2, w: 4, h: 13, c: "red", ink: "text3", d: 60 },
  { x: 0.27, w: 9, h: 4, c: "text", ink: "text", d: 180 },
  { x: 0.34, w: 5, h: 11, c: "cta", ink: "text2", d: 30 },
  { x: 0.41, w: 6, h: 6, c: "text", ink: "text3", d: 150 },
  { x: 0.48, w: 4, h: 12, c: "red", ink: "text", d: 90 },
  { x: 0.55, w: 8, h: 4, c: "cta", ink: "text2", d: 10 },
  { x: 0.62, w: 5, h: 10, c: "text", ink: "text3", d: 170 },
  { x: 0.69, w: 6, h: 6, c: "red", ink: "text", d: 50 },
  { x: 0.76, w: 4, h: 12, c: "cta", ink: "text2", d: 130 },
  { x: 0.83, w: 8, h: 4, c: "text", ink: "text3", d: 80 },
  { x: 0.89, w: 5, h: 11, c: "red", ink: "text", d: 160 },
  { x: 0.95, w: 6, h: 7, c: "cta", ink: "text2", d: 20 },
];

/**
 * The milestone burst (a Moment in the DESIGN.md Motion registry, specs/
 * matches-tab 10.6): 14 pieces fall and turn once over the celebrated card
 * or tile, ending within 1.2 s. `palette="ink"` for a first match that was a
 * loss. Nothing at all under Reduce Motion or without `play`. Decorative:
 * hidden from screen readers and never takes a touch.
 */
export function MilestoneBurst({ play, palette = "brand", height = 200 }: { play: boolean; palette?: "brand" | "ink"; height?: number }) {
  const reduceMotion = useReduceMotion();
  const colors = usePalette();
  const [width, setWidth] = React.useState(0);
  if (reduceMotion || !play) return null;
  return (
    <View
      testID="milestone-burst"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[StyleSheet.absoluteFill, { overflow: "visible" }]}
    >
      {width > 0
        ? BURST_PIECES.map((p, i) => (
            <Piece key={i} left={p.x * width} w={p.w} h={p.h} color={colors[palette === "ink" ? p.ink : p.c]} delay={p.d} fall={height} />
          ))
        : null}
    </View>
  );
}

function Piece({ left, w, h, color, delay, fall }: { left: number; w: number; h: number; color: string; delay: number; fall: number }) {
  const y = useSharedValue(-12);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);
  React.useEffect(() => {
    y.value = withDelay(delay, withTiming(fall, { duration: moment.milestoneBurstFall, easing: easing.inQuad }));
    rot.value = withDelay(delay, withTiming(300, { duration: moment.milestoneBurstFall }));
    opacity.value = withDelay(delay + moment.milestoneBurstFadeDelay, withTiming(0, { duration: moment.milestoneBurstFade }));
  }, [y, rot, opacity, delay, fall]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }],
  }));
  return <Animated.View testID="milestone-burst-piece" style={[{ position: "absolute", top: 0, left, width: w, height: h, backgroundColor: color }, style]} />;
}
