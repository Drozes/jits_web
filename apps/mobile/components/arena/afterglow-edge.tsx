/**
 * Challenge afterglow (Adding Flare [01.4]; Motion Rule, Moment). A 2 px
 * bottom edge on an incoming challenge strip that starts hot (brandOrange
 * over Signal Red, Arena heat colors) and cools to the plate-bright hairline
 * over `AFTERGLOW_MS`, ONCE per challenge id.
 *
 * Once per id, not per component: the heat starts at the EARLIER of the
 * challenge's `created_at` and the first time this app run drew it, kept at
 * module level, and any later render or remount reads the heat left at that
 * moment. So a re-render, a tab switch or a remount after the cool-down
 * shows it cooled, a remount during the cool-down carries on rather than
 * reheating, and a challenge already older than `AFTERGLOW_MS` (a cold
 * start, an OTA reload, Reduce Motion turned off later) shows cooled. One
 * that arrived on another tab moments ago may still glow. Silent (no haptic:
 * the challenge prompt already buzzes for a new challenge).
 *
 * Reduce Motion: cooled at once (the id is still recorded, so turning it off
 * later never reheats an old challenge).
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

/** challenge id -> when its afterglow started (ms since epoch). */
const firstDrawn = new Map<string, number>();

/** `created_at` as ms, or null when missing or unparseable. */
function createdMs(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * When this id's afterglow started: the earlier of its `created_at` and its
 * first draw. The first call records it; a later, earlier `created_at` (it
 * was unknown at first) moves it back, never forward.
 */
function startedAt(id: string, now: number, createdAt?: string | null): number {
  const created = createdMs(createdAt);
  const known = firstDrawn.get(id);
  const start = Math.min(known ?? now, created ?? Infinity);
  if (start !== known) {
    firstDrawn.set(id, start);
    if (firstDrawn.size > MAX_REMEMBERED) {
      const oldest = firstDrawn.keys().next().value;
      if (oldest !== undefined) firstDrawn.delete(oldest);
    }
  }
  return start;
}

/** Heat left (1 hot to 0 cooled) for an id at `now`. */
export function afterglowHeat(id: string, now: number, createdAt?: string | null): number {
  const elapsed = now - startedAt(id, now, createdAt);
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

export function AfterglowEdge({
  challengeId,
  createdAt,
}: {
  challengeId: string | null | undefined;
  /** The challenge row's `created_at` (server time), when known. */
  createdAt?: string | null;
}) {
  const reduceMotion = useReduceMotion();
  const id = challengeId ?? null;

  // Read during render so the first frame is already right (hot or cooled).
  // Recorded under Reduce Motion too, so turning it off never reheats.
  const heatOf = () => {
    if (!id) return 0;
    const left = afterglowHeat(id, Date.now(), createdAt);
    return reduceMotion ? 0 : left;
  };
  const heat = useSharedValue(heatOf());

  React.useEffect(() => {
    cancelAnimation(heat);
    const left = heatOf();
    heat.value = left;
    if (left > 0) {
      heat.value = withTiming(0, {
        duration: Math.round(left * AFTERGLOW_MS),
        easing: Easing.linear,
      });
    }
    return () => cancelAnimation(heat);
    // createdAt only moves the start back; the id and Reduce Motion drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
