import * as React from "react";
import { Dimensions, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SplashScreen from "expo-splash-screen";
import { SPLASH_REVEAL, SPLASH_STATEMENT } from "@jits/shared/constants";
import { Wordmark } from "@/components/ui/elo-system/wordmark";
import { useReduceMotion } from "@/lib/motion";
import { darkTokens, onMediaTokens } from "@/lib/tokens";

const S = SPLASH_STATEMENT;
const EASE = Easing.bezier(
  SPLASH_REVEAL.EASING_BEZIER[0],
  SPLASH_REVEAL.EASING_BEZIER[1],
  SPLASH_REVEAL.EASING_BEZIER[2],
  SPLASH_REVEAL.EASING_BEZIER[3],
);

// Void "arena" palette — intentionally theme-independent (matches the native
// splash exactly so the hand-off has no seam). Backdrop is a FLAT fill for v1.
// The dark (Void) tokens, pinned: the statement ignores the app theme.
const VOID = darkTokens.bgPrimary;
const WHITE = darkTokens.textPrimary; // brand wordmark base
const HALO = onMediaTokens.white; // pure-white glow layer (the halo only)
const GRAY = darkTokens.textSecondary; // "WE ARE"
const RED = darkTokens.accentCta; // Signal Red, "ARE YOU?" only

// Centered block; the wordmark is the widest child and sets the column width.
const BLOCK_W = Math.min(Dimensions.get("window").width - 48, 360);

// Wordmark sizing. We compute a fixed fitted size ourselves (NO
// adjustsFontSizeToFit) so the base and glow layers share the SAME fontSize and
// therefore align pixel-for-pixel. Bebas Neue is condensed; ~0.40 of fontSize
// per char at letterSpacing 0.02em is a safe width estimate for "ELO RATED"
// (9 glyphs incl. the space). Clamp down from the design's ~64 if it would
// overflow BLOCK_W, never up.
const WORD_TEXT = "ELO RATED";
const TARGET_SIZE = 64;
const CHAR_W_RATIO = 0.46; // conservative per-glyph advance for Bebas Neue caps
const FITTED_SIZE = Math.min(TARGET_SIZE, Math.floor(BLOCK_W / (WORD_TEXT.length * CHAR_W_RATIO)));

// Gentle glow envelope (the RN-faithful port of the CSS brightness/text-shadow
// glow: CSS filter/text-shadow don't animate on RN Text, so we fade an
// over-laid pure-white duplicate). Tuned subtle — a calm glow, not a pulse.
const GLOW_BASELINE = 0.45;
const GLOW_PEAK = 0.8;

interface SplashStatementProps {
  /** Called once the statement (or its reduced-motion fallback) finishes. */
  onDone: () => void;
}

/**
 * "The Statement" launch splash (Motion Rule registry: Launch splash reveal,
 * a Moment, once per cold start). Reduce Motion is read with
 * `useReduceMotion()` (correct on the first frame); a late flip to on snaps
 * to the resting frame, drops the pending lock haptic and dismisses after at
 * most the reduced hold. The glow plays once: it
 * ramps to its baseline with the ignite, breathes up and back one time, then
 * rests at the baseline (a Moment never loops).
 */
export function SplashStatement({ onDone }: SplashStatementProps) {
  const weare = useSharedValue(0);
  const ignite = useSharedValue(0);
  const glow = useSharedValue(0);
  const areyou = useSharedValue(0);
  // Text-group opacity. Full-motion sets it to 1 immediately (each line fades in
  // on its own); reduced-motion fades the whole resting frame in via this single
  // value so the statement appears gently instead of popping.
  const intro = useSharedValue(0);
  // Whole-overlay opacity. Starts at 1; the dismissal cross-dissolves it to 0 so
  // the live app underneath is revealed smoothly instead of a hard cut.
  const farewell = useSharedValue(1);
  const reduceMotion = useReduceMotion();

  // Resting frame at final positions: no transform, scale or glow motion.
  const rest = React.useCallback(() => {
    [weare, ignite, areyou, glow, intro].forEach((v) => cancelAnimation(v));
    weare.value = 1;
    ignite.value = 1;
    areyou.value = 1;
    glow.value = GLOW_BASELINE;
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

    // Cross-dissolve the overlay out, then signal done once the fade lands.
    const dismiss = () => {
      farewell.value = withTiming(0, { duration: S.FADEOUT_MS, easing: EASE }, (finished) => {
        if (finished) runOnJS(onDone)();
      });
    };

    if (reduceMotion) {
      // Resting frame at final positions (no transform/scale/glow motion), but
      // fade the group IN via opacity so it doesn't pop, then cross-fade out.
      rest();
      intro.value = withTiming(1, { duration: S.REDUCED_MOTION_FADEIN_MS, easing: EASE });
      timers.push(setTimeout(dismiss, S.REDUCED_MOTION_FADEIN_MS + S.REDUCED_MOTION_HOLD_MS));
      return () => timers.forEach(clearTimeout);
    }

    // Full motion: each line reveals itself, so the group is fully opaque.
    intro.value = 1;

    // "WE ARE" rises + fades in.
    weare.value = withDelay(S.WEARE_DELAY_MS, withTiming(1, { duration: S.WEARE_MS, easing: EASE }));

    // "ELO RATED" locks in: fade + a subtle scale 1.04 → 1 (no flash, no blur).
    ignite.value = withDelay(S.IGNITE_DELAY_MS, withTiming(1, { duration: S.IGNITE_MS, easing: EASE }));

    // Glow ramps to baseline during ignite, breathes up and back ONCE, then
    // rests at the baseline (a Moment plays once; it never loops). The
    // sequence keeps the seam continuous (baseline -> breathe up -> back).
    const breathe = { duration: S.GLOW_BREATHE_MS / 2, easing: Easing.inOut(Easing.ease) };
    glow.value = withDelay(
      S.IGNITE_DELAY_MS,
      withSequence(
        withTiming(GLOW_BASELINE, { duration: S.IGNITE_MS, easing: EASE }),
        withTiming(GLOW_PEAK, breathe),
        withTiming(GLOW_BASELINE, breathe),
      ),
    );

    // "ARE YOU?" rises + fades in.
    areyou.value = withDelay(S.AREYOU_DELAY_MS, withTiming(1, { duration: S.AREYOU_MS, easing: EASE }));

    // Felt "lock" on the ARE YOU? beat: the signature.
    hapticTimerRef.current = setTimeout(() => {
      hapticTimerRef.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, S.HAPTIC_DELAY_MS);

    dismissFnRef.current = dismiss;
    scheduleDismiss(S.TOTAL_MS);

    return () => {
      timers.forEach(clearTimeout);
      if (hapticTimerRef.current != null) clearTimeout(hapticTimerRef.current);
      if (dismissTimerRef.current != null) clearTimeout(dismissTimerRef.current);
    };
    // Mount-only: the statement plays once per cold start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reduce Motion switched on mid-reveal: snap to the resting frame, no lock
  // haptic, and the dismiss comes after at most the reduced-motion hold.
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
    intro.value = 1;
  }, [reduceMotion, startedReduced, rest, intro, scheduleDismiss]);

  const weareStyle = useAnimatedStyle(() => ({
    opacity: weare.value,
    transform: [{ translateY: interpolate(weare.value, [0, 1], [8, 0]) }],
  }));
  const igniteStyle = useAnimatedStyle(() => ({
    opacity: ignite.value,
    transform: [{ scale: interpolate(ignite.value, [0, 1], [1.04, 1]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const areyouStyle = useAnimatedStyle(() => ({
    opacity: areyou.value,
    transform: [{ translateY: interpolate(areyou.value, [0, 1], [6, 0]) }],
  }));
  const introStyle = useAnimatedStyle(() => ({ opacity: intro.value }));
  const farewellStyle = useAnimatedStyle(() => ({ opacity: farewell.value }));

  // Both wordmark layers share these exact text props → identical layout.
  const wordStyle = { fontSize: FITTED_SIZE, lineHeight: FITTED_SIZE, maxWidth: BLOCK_W };

  return (
    <Animated.View style={[styles.overlay, farewellStyle]} pointerEvents="none">
      <Animated.View style={[styles.hero, introStyle]}>
        <Animated.View style={weareStyle}>
          <Text className="font-heading" style={styles.weare}>
            WE ARE
          </Text>
        </Animated.View>

        <Animated.View style={[styles.wordmarkGroup, igniteStyle]}>
          {/* BASE */}
          <Wordmark numberOfLines={1} style={[styles.wordmarkText, wordStyle]} />
          {/* GLOW LAYER — pure-white duplicate, static text-shadow halo, opacity-animated */}
          <Animated.View style={[styles.glowLayer, glowStyle]} pointerEvents="none">
            <Wordmark numberOfLines={1} style={[styles.wordmarkText, styles.glowText, wordStyle]} />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.areyouWrap, areyouStyle]}>
          <Text className="font-heading" style={styles.areyou}>
            ARE YOU?
          </Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
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
  hero: {
    // Size the block to the wordmark (its widest child) and let the overlay
    // center THAT, so ELO RATED is truly centered on screen with WE ARE /
    // ARE YOU? framing its left/right edges. A fixed width here would leave the
    // wordmark pinned left-of-center inside an over-wide block.
    maxWidth: BLOCK_W,
    alignItems: "stretch",
  },
  weare: {
    color: GRAY,
    fontSize: 15,
    letterSpacing: 6.3, // ~0.42em * 15
    alignSelf: "stretch",
    marginBottom: 14,
  },
  wordmarkGroup: {
    position: "relative",
    alignSelf: "stretch",
  },
  wordmarkText: {
    color: WHITE,
  },
  glowLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  glowText: {
    color: HALO,
    // The one intentional glow (brand exception): a static white halo whose
    // *opacity* is animated to fake CSS's animated text-shadow/brightness.
    // The app's only shadow, sanctioned for the launch moment and recorded in
    // the Motion registry row (DESIGN.md); never copy it to product UI.
    textShadowColor: HALO,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  areyouWrap: {
    alignSelf: "flex-end",
    marginTop: 12,
  },
  areyou: {
    color: RED,
    fontSize: 24,
    letterSpacing: 3.6, // ~0.15em * 24
    textAlign: "right",
  },
});
