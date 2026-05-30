import * as React from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SplashScreen from "expo-splash-screen";
import { SPLASH_REVEAL } from "@jits/shared/constants";
import { Wordmark } from "@/components/ui/elo-system/wordmark";

const S = SPLASH_REVEAL;
const EASE = Easing.bezier(
  S.EASING_BEZIER[0],
  S.EASING_BEZIER[1],
  S.EASING_BEZIER[2],
  S.EASING_BEZIER[3],
);

// Void "arena" palette — the reveal is intentionally theme-independent.
const VOID = "#0D0F14";
const WHITE = "#E8EDF2";
const GOLD = "#f59e0b";
const RED = "#E63946";
const GRAY = "#9CA3AF";

// Ascending bars = a rating climbing; the gold cap = the breakthrough.
const BAR_HEIGHTS = [42, 66, 90, 112, 130] as const;
const BAR_WIDTH = 18;
const BAR_GAP = 7;
const PEAK_W = 18;
const PEAK_H = 16;
const MAX_BAR = BAR_HEIGHTS[BAR_HEIGHTS.length - 1];

interface SplashRevealProps {
  /** Number the odometer rolls up to (cached real ELO, or DEFAULT_ELO). */
  targetElo: number;
  /** Called once the reveal (or its reduced-motion fallback) finishes. */
  onDone: () => void;
}

/** A single climbing bar — grows in height from the baseline. */
function Bar({ progress, maxHeight }: { progress: SharedValue<number>; maxHeight: number }) {
  const style = useAnimatedStyle(() => ({ height: progress.value * maxHeight }));
  return <Animated.View style={[styles.bar, style]} />;
}

export function SplashReveal({ targetElo, onDone }: SplashRevealProps) {
  const bar0 = useSharedValue(0);
  const bar1 = useSharedValue(0);
  const bar2 = useSharedValue(0);
  const bar3 = useSharedValue(0);
  const bar4 = useSharedValue(0);
  // Shared values are stable refs, so this plain array is safe to re-create.
  const bars = [bar0, bar1, bar2, bar3, bar4];
  const peak = useSharedValue(0);
  const numOpacity = useSharedValue(0);
  const word = useSharedValue(0);
  const rule = useSharedValue(0);
  const tag = useSharedValue(0);

  const startVal = Math.max(0, Math.round(targetElo) - 480);
  const [display, setDisplay] = React.useState(startVal);

  React.useEffect(() => {
    let mounted = true;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Hand the native splash off to this overlay (identical Void bg → no seam).
    SplashScreen.hideAsync().catch(() => {});

    (async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {}
      if (!mounted) return;

      if (reduce) {
        // Resting frame, no motion. Still dismisses.
        bars.forEach((b) => (b.value = 1));
        peak.value = 1;
        numOpacity.value = 1;
        word.value = 1;
        rule.value = 1;
        tag.value = 1;
        setDisplay(Math.round(targetElo));
        timers.push(setTimeout(onDone, S.REDUCED_MOTION_HOLD_MS));
        return;
      }

      // Bars rise one-by-one, left → right.
      bars.forEach((b, i) => {
        b.value = withDelay(
          S.BAR_FIRST_DELAY_MS + i * S.BAR_STAGGER_MS,
          withTiming(1, { duration: S.BAR_RISE_MS, easing: EASE }),
        );
      });
      // Gold breakthrough peak pops (slight overshoot, then settles).
      peak.value = withDelay(
        S.PEAK_DELAY_MS,
        withSequence(
          withTiming(1.18, { duration: S.PEAK_POP_MS * 0.7, easing: EASE }),
          withTiming(1, { duration: S.PEAK_POP_MS * 0.3, easing: EASE }),
        ),
      );
      // Number fades in, then rolls (rAF count-up below).
      numOpacity.value = withDelay(S.NUMBER_DELAY_MS, withTiming(1, { duration: S.NUMBER_FADE_MS }));
      // Wordmark locks (hard stop), then the red accent rule wipes.
      word.value = withDelay(S.WORDMARK_DELAY_MS, withTiming(1, { duration: S.WORDMARK_MS, easing: EASE }));
      rule.value = withDelay(S.RULE_DELAY_MS, withTiming(1, { duration: S.RULE_MS, easing: EASE }));
      tag.value = withDelay(
        S.RULE_DELAY_MS + S.TAG_DELAY_AFTER_RULE_MS,
        withTiming(1, { duration: S.TAG_MS }),
      );

      // Felt "lock" — the THX-style signature, on the wordmark beat.
      timers.push(
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, S.WORDMARK_DELAY_MS),
      );

      // Odometer roll (easeOutCubic) — JS-driven; a shared value is overkill.
      const rollStart = Date.now() + S.NUMBER_DELAY_MS;
      const target = Math.round(targetElo);
      const tick = () => {
        if (!mounted) return;
        const p = Math.min(1, Math.max(0, (Date.now() - rollStart) / S.NUMBER_ROLL_MS));
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(startVal + (target - startVal) * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      timers.push(setTimeout(onDone, S.TOTAL_MS));
    })();

    return () => {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // Mount-only: the reveal plays once per cold start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peakStyle = useAnimatedStyle(() => ({ transform: [{ scale: peak.value }] }));
  const numStyle = useAnimatedStyle(() => ({ opacity: numOpacity.value }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: interpolate(word.value, [0, 1], [18, 0]) }],
  }));
  const ruleStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: rule.value }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value }));

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.barsRow}>
        {bars.map((b, i) => (
          <Bar key={i} progress={b} maxHeight={BAR_HEIGHTS[i]} />
        ))}
        <Animated.View style={[styles.peak, peakStyle]} />
      </View>

      <Animated.View style={numStyle}>
        <Text className="font-mono-bold" style={styles.number}>
          {display}
        </Text>
      </Animated.View>

      <Animated.View style={[styles.wordmarkWrap, wordStyle]}>
        <Wordmark size="lg" className="text-[#E8EDF2]" />
      </Animated.View>

      <Animated.View style={[styles.rule, ruleStyle]} />

      <Animated.View style={tagStyle}>
        <Text className="font-heading" style={styles.tagline}>
          EARN YOUR RANK
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: VOID,
    alignItems: "center",
    justifyContent: "center",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: BAR_GAP,
    height: MAX_BAR,
    marginBottom: 30,
  },
  bar: {
    width: BAR_WIDTH,
    backgroundColor: WHITE,
    borderRadius: 2,
  },
  peak: {
    // Sits just above the tallest bar, which is the LAST/rightmost one
    // (BAR_HEIGHTS is ascending). If BAR_HEIGHTS is ever reordered, revisit.
    position: "absolute",
    right: 0,
    bottom: MAX_BAR + 4,
    width: PEAK_W,
    height: PEAK_H,
    backgroundColor: GOLD,
    borderRadius: 2,
    transformOrigin: "bottom",
  },
  number: {
    color: WHITE,
    fontSize: 72,
    lineHeight: 74,
    fontVariant: ["tabular-nums"],
  },
  wordmarkWrap: {
    marginTop: 14,
  },
  rule: {
    width: 150,
    height: 3,
    backgroundColor: RED,
    marginTop: 14,
    transformOrigin: "left",
  },
  tagline: {
    color: GRAY,
    fontSize: 11,
    letterSpacing: 3,
    marginTop: 16,
  },
});
