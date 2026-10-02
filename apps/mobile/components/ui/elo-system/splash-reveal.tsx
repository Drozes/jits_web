import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
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
import { RollingNumber } from "@/components/ui/elo-system/rolling-number";
import { easing, useReduceMotion } from "@/lib/motion";
import { darkTokens } from "@/lib/tokens";

const S = SPLASH_REVEAL;
const EASE = Easing.bezier(
  S.EASING_BEZIER[0],
  S.EASING_BEZIER[1],
  S.EASING_BEZIER[2],
  S.EASING_BEZIER[3],
);

// Void "arena" palette — the reveal is intentionally theme-independent.
// The dark (Void) tokens, pinned: the reveal ignores the app theme.
const VOID = darkTokens.bgPrimary;
const WHITE = darkTokens.textPrimary;
// The gold cap is the dark `attention` amber, a documented brand exception
// (DESIGN.md "Color": the launch reveal's breakthrough cap). Do not copy it.
const GOLD = darkTokens.attention;
const RED = darkTokens.accentCta;
const GRAY = darkTokens.textSecondary;

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

/**
 * The "climb" launch splash (Motion Rule registry: Launch splash reveal, a
 * Moment, once per cold start). Reduce Motion is read with `useReduceMotion()`
 * (correct on the first frame); a late flip to on snaps to the resting frame,
 * drops the pending lock haptic and dismisses after at most the reduced hold. The odometer is the registered `RollingNumber`
 * on the UI thread (no per-frame setState), rolling the whole climb over
 * NUMBER_ROLL_MS on the out-cubic curve it always used.
 */
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

  const reduceMotion = useReduceMotion();
  // Decided on mount, like the rest of the reveal: the odometer rolls once.
  const [target] = React.useState(() => Math.round(targetElo));
  const [startVal] = React.useState(() => Math.max(0, target - 480));
  const [rollKey, setRollKey] = React.useState(0);

  // Resting frame, no motion.
  const rest = React.useCallback(() => {
    [...bars, peak, numOpacity, word, rule, tag].forEach((v) => {
      cancelAnimation(v);
      v.value = 1;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pending lock haptic and dismiss, kept so a late Reduce Motion switch
  // can drop the haptic and shorten the hold (see the effect below).
  const startedAtRef = React.useRef(0);
  const hapticTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissFnRef = React.useRef<() => void>(() => undefined);
  const scheduleDismiss = React.useCallback((ms: number) => {
    if (dismissTimerRef.current != null) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      dismissFnRef.current();
    }, ms);
  }, []);

  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    startedAtRef.current = Date.now();

    // Hand the native splash off to this overlay (identical Void bg → no seam).
    SplashScreen.hideAsync().catch(() => {});

    if (reduceMotion) {
      // Resting frame, no motion. Still dismisses.
      rest();
      timers.push(setTimeout(onDone, S.REDUCED_MOTION_HOLD_MS));
      return () => timers.forEach(clearTimeout);
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
    // Number fades in, then rolls (RollingNumber below, delayed to this beat).
    numOpacity.value = withDelay(S.NUMBER_DELAY_MS, withTiming(1, { duration: S.NUMBER_FADE_MS }));
    // Wordmark locks (hard stop), then the red accent rule wipes.
    word.value = withDelay(S.WORDMARK_DELAY_MS, withTiming(1, { duration: S.WORDMARK_MS, easing: EASE }));
    rule.value = withDelay(S.RULE_DELAY_MS, withTiming(1, { duration: S.RULE_MS, easing: EASE }));
    tag.value = withDelay(
      S.RULE_DELAY_MS + S.TAG_DELAY_AFTER_RULE_MS,
      withTiming(1, { duration: S.TAG_MS }),
    );

    // Felt "lock": the THX-style signature, on the wordmark beat.
    hapticTimerRef.current = setTimeout(() => {
      hapticTimerRef.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, S.WORDMARK_DELAY_MS);

    dismissFnRef.current = onDone;
    scheduleDismiss(S.TOTAL_MS);

    return () => {
      timers.forEach(clearTimeout);
      if (hapticTimerRef.current != null) clearTimeout(hapticTimerRef.current);
      if (dismissTimerRef.current != null) clearTimeout(dismissTimerRef.current);
    };
    // Mount-only: the reveal plays once per cold start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reduce Motion switched on mid-reveal: snap to the resting frame (the
  // odometer remounts on its final value), no lock haptic, and the dismiss
  // comes after at most the reduced-motion hold.
  const startedReduced = React.useRef(reduceMotion).current;
  React.useEffect(() => {
    if (!reduceMotion || startedReduced) return;
    rest();
    // No lock haptic and no full hold for a late Reduce Motion read: drop the
    // pending haptic and dismiss after at most the reduced-motion hold.
    if (hapticTimerRef.current != null) {
      clearTimeout(hapticTimerRef.current);
      hapticTimerRef.current = null;
    }
    if (dismissTimerRef.current != null) {
      const remaining = Math.max(0, S.TOTAL_MS - (Date.now() - startedAtRef.current));
      scheduleDismiss(Math.min(remaining, S.REDUCED_MOTION_HOLD_MS));
    }
    setRollKey((k) => k + 1);
  }, [reduceMotion, startedReduced, rest, scheduleDismiss]);

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
        <RollingNumber
          key={rollKey}
          testID="splash-odometer"
          from={rollKey === 0 ? startVal : null}
          to={target}
          play
          delayMs={S.NUMBER_DELAY_MS}
          durationMs={S.NUMBER_ROLL_MS}
          maxSpan={Number.MAX_SAFE_INTEGER}
          curve={easing.outCubic}
          className="font-mono-bold"
          style={styles.number}
        />
      </Animated.View>

      <Animated.View style={[styles.wordmarkWrap, wordStyle]}>
        <Wordmark size="lg" style={{ color: WHITE }} />
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
