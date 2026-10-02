/**
 * Challenge afterglow (Adding Flare [01.4]; Motion Rule, Moment). A 2 px
 * bottom edge on an incoming challenge strip that starts hot (brandOrange
 * over Signal Red, Arena heat colors) and cools to the plate-bright hairline
 * over `AFTERGLOW_MS`, ONCE per challenge id.
 *
 * Once per id, not per component: the first time an id is drawn its start
 * time is kept at module level, and any later render or remount reads the
 * heat left at that moment. So a re-render, a tab switch or a remount after
 * the cool-down shows it cooled, and a remount during the cool-down carries
 * on from where it was rather than reheating. Silent (no haptic: the
 * challenge prompt already buzzes for a new challenge).
 *
 * Reduce Motion: cooled at once.
 */
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "@/lib/motion";

/** How long a new challenge's edge takes to cool. */
export const AFTERGLOW_MS = 2000;

export const AFTERGLOW_TEST_ID = "arena-afterglow";

/** Ids kept before the oldest are forgotten (a forgotten id is long cooled). */
const MAX_REMEMBERED = 200;

/** challenge id -> when its edge was first drawn (ms since epoch). */
const firstDrawn = new Map<string, number>();

/** When this id's afterglow started; the first call starts it. */
function startedAt(id: string, now: number): number {
  const at = firstDrawn.get(id);
  if (at !== undefined) return at;
  firstDrawn.set(id, now);
  if (firstDrawn.size > MAX_REMEMBERED) {
    const oldest = firstDrawn.keys().next().value;
    if (oldest !== undefined) firstDrawn.delete(oldest);
  }
  return now;
}

/** Heat left (1 hot to 0 cooled) for an id at `now`. */
export function afterglowHeat(id: string, now: number): number {
  const elapsed = now - startedAt(id, now);
  if (elapsed <= 0) return 1;
  return Math.max(0, 1 - elapsed / AFTERGLOW_MS);
}

/** The orange core: white-hot only in the first half of the cool. */
function orangeOf(heat: number): number {
  "worklet";
  const t = (heat - 0.5) / 0.5;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** The red glow: cools fast, then lingers (ease-out). */
function redOf(heat: number): number {
  "worklet";
  const h = heat <= 0 ? 0 : heat >= 1 ? 1 : heat;
  return h * h;
}

export function AfterglowEdge({ challengeId }: { challengeId: string | null | undefined }) {
  const reduceMotion = useReduceMotion();
  const id = challengeId ?? null;

  // Read during render so the first frame is already right (hot or cooled).
  const heatNow = id && !reduceMotion ? afterglowHeat(id, Date.now()) : 0;
  const heat = useSharedValue(heatNow);

  React.useEffect(() => {
    cancelAnimation(heat);
    const left = id && !reduceMotion ? afterglowHeat(id, Date.now()) : 0;
    heat.value = left;
    if (left > 0) {
      heat.value = withTiming(0, {
        duration: Math.round(left * AFTERGLOW_MS),
        easing: Easing.linear,
      });
    }
    return () => cancelAnimation(heat);
  }, [id, reduceMotion, heat]);

  const redStyle = useAnimatedStyle(() => ({ opacity: redOf(heat.value) }));
  const orangeStyle = useAnimatedStyle(() => ({ opacity: orangeOf(heat.value) }));

  return (
    <View
      testID={AFTERGLOW_TEST_ID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute bottom-0 left-0 right-0 bg-surface-4"
      style={{ height: 2 }}
    >
      <Animated.View
        testID={`${AFTERGLOW_TEST_ID}-red`}
        className="absolute inset-0 bg-cta"
        style={redStyle}
      />
      <Animated.View
        testID={`${AFTERGLOW_TEST_ID}-orange`}
        className="absolute inset-0 bg-brand-orange"
        style={orangeStyle}
      />
    </View>
  );
}

/** Tests only: forget every challenge's afterglow. */
export function __resetAfterglowForTests(): void {
  firstDrawn.clear();
}
