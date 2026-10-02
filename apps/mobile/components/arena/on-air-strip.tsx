/**
 * ON AIR strip (Adding Flare [06.3]; Motion Rule): on the Arena screen body,
 * while the athlete is live, an ON AIR tally and a thin heartbeat trace.
 *
 * - Tally (Moment): its green fill softly sweeps in from the left when live
 *   flips false to true. Mounting while already live (tab switch, remount,
 *   app restore) shows it filled, never replays.
 * - Heartbeat (Ambient): a dim trace whose beat brightens once per cycle of
 *   the ONE shared Arena tempo clock (`lib/arena/arena-tempo.ts`), in phase
 *   with every live dot; quicker when the lobby is busier. Paused in the
 *   background. Silent (never a haptic for ambient motion).
 *
 * Reduce Motion: the tally is filled and the full trace is drawn static.
 *
 * Not the header (the tab header's right side is exactly the status chip
 * then the bell) and never the words "Go live" / "Go offline": the
 * match-loop harness taps those.
 */
import * as React from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { duration, easing, useReduceMotion } from "@/lib/motion";
import { useArenaTempo } from "@/lib/arena/arena-tempo";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { MAX_SCALE } from "@/components/arena/strip-primitives";

export const ON_AIR_TEST_ID = "arena-on-air";

/** One beat in a 100 x 16 box: flat, a spike, flat. */
const TRACE_PATH = "M0 8 H62 L65 8 L68 2 L72 14 L75 5 L77 8 H100";

/** Share of a cycle the beat stays lit after it lands. */
const BEAT_SHARE = 0.3;
/** How dim the trace rests between beats. */
const TRACE_REST_OPACITY = 0.3;

/** The beat at a clock phase: 1 as the cycle starts, fading out by BEAT_SHARE. */
export function beatLevel(phase: number): number {
  "worklet";
  if (phase < 0 || phase >= BEAT_SHARE) return 0;
  const t = 1 - phase / BEAT_SHARE;
  return t * t;
}

export function OnAirStrip({ isLive }: { isLive: boolean }) {
  const reduceMotion = useReduceMotion();
  const { clock, animate } = useArenaTempo(isLive);
  const tokens = useThemedTokens();

  // The tally fill: full when mounted while live; empty while offline, so a
  // go-live's first frame is empty and the sweep starts from there.
  // Seeded from the MOUNT's live state only, never a later render's.
  const initialFill = React.useRef(isLive ? 1 : 0).current;
  const fill = useSharedValue(initialFill);
  const wasLive = React.useRef(isLive);
  // Layout effects: they land before the frame paints, so the first live
  // frame never flashes a filled tally ahead of the sweep.
  React.useLayoutEffect(() => {
    const was = wasLive.current;
    wasLive.current = isLive;
    if (!isLive) {
      cancelAnimation(fill);
      fill.value = 0;
      return;
    }
    if (was) return;
    cancelAnimation(fill);
    if (reduceMotion) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    fill.value = withTiming(1, { duration: duration.slow, easing: easing.brandOut });
  }, [isLive, reduceMotion, fill]);

  // Reduce Motion turned on mid-fill: land it.
  React.useLayoutEffect(() => {
    if (!reduceMotion || !wasLive.current) return;
    cancelAnimation(fill);
    fill.value = 1;
  }, [reduceMotion, fill]);

  // Under Reduce Motion the tally is simply full, whatever the shared value.
  const fillStyle = useAnimatedStyle(
    () => ({ transform: [{ scaleX: reduceMotion ? 1 : fill.value }] }),
    [reduceMotion],
  );
  // The bright trace: lit on the beat; drawn whole when nothing animates.
  const beatStyle = useAnimatedStyle(
    () => ({ opacity: animate ? beatLevel(clock.value) : 1 }),
    [animate],
  );

  if (!isLive) return null;

  const stroke = tokens.statePositive;

  return (
    <View
      testID={ON_AIR_TEST_ID}
      accessible
      accessibilityRole="text"
      accessibilityLabel="On air"
      className="h-7 flex-row items-center gap-3"
    >
      <View className="h-5 justify-center overflow-hidden rounded-xs border border-positive px-1.5">
        <Animated.View
          testID={`${ON_AIR_TEST_ID}-fill`}
          className="absolute inset-0 bg-positive"
          style={[{ opacity: 0.18, transformOrigin: "left" }, fillStyle]}
        />
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-mono-bold text-[10px] text-positive uppercase tracking-caps-xl"
        >
          On air
        </Text>
      </View>
      <View
        className="h-4 flex-1"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          style={{ opacity: TRACE_REST_OPACITY, position: "absolute" }}
        >
          <Path
            d={TRACE_PATH}
            stroke={stroke}
            strokeWidth={1.5}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
        <Animated.View testID={`${ON_AIR_TEST_ID}-beat`} className="absolute inset-0" style={beatStyle}>
          <Svg width="100%" height="100%" viewBox="0 0 100 16" preserveAspectRatio="none">
            <Path
              d={TRACE_PATH}
              stroke={stroke}
              strokeWidth={1.5}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}
