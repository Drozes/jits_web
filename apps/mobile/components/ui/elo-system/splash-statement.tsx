import * as React from "react";
import { AccessibilityInfo, Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SplashScreen from "expo-splash-screen";
import { SPLASH_REVEAL, SPLASH_STATEMENT } from "@jits/shared/constants";
import { Wordmark } from "@/components/ui/elo-system/wordmark";

const S = SPLASH_STATEMENT;
const EASE = Easing.bezier(
  SPLASH_REVEAL.EASING_BEZIER[0],
  SPLASH_REVEAL.EASING_BEZIER[1],
  SPLASH_REVEAL.EASING_BEZIER[2],
  SPLASH_REVEAL.EASING_BEZIER[3],
);

// Void "arena" palette — intentionally theme-independent (matches the native
// splash exactly so the hand-off has no seam). Backdrop is a FLAT fill for v1.
const VOID = "#0D0F14";
const WHITE = "#E8EDF2"; // brand wordmark base
const HALO = "#FFFFFF"; // pure-white glow layer (the halo only)
const GRAY = "#9CA3AF"; // "WE ARE"
const RED = "#E63946"; // Signal Red — "ARE YOU?" only

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

export function SplashStatement({ onDone }: SplashStatementProps) {
  const weare = useSharedValue(0);
  const ignite = useSharedValue(0);
  const glow = useSharedValue(0);
  const areyou = useSharedValue(0);

  React.useEffect(() => {
    let mounted = true;
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
        // Static resting frame, no motion, no haptic. Still dismisses.
        weare.value = 1;
        ignite.value = 1;
        areyou.value = 1;
        glow.value = GLOW_BASELINE;
        timers.push(setTimeout(onDone, S.REDUCED_MOTION_HOLD_MS));
        return;
      }

      // "WE ARE" rises + fades in.
      weare.value = withDelay(S.WEARE_DELAY_MS, withTiming(1, { duration: S.WEARE_MS, easing: EASE }));

      // "ELO RATED" locks in: fade + a subtle scale 1.04 → 1 (no flash, no blur).
      ignite.value = withDelay(S.IGNITE_DELAY_MS, withTiming(1, { duration: S.IGNITE_MS, easing: EASE }));

      // Glow ramps to baseline during ignite, then breathes gently forever.
      // withSequence keeps the seam continuous (baseline → breathe up/back),
      // so there's no visible jump from ignite-end into the loop.
      glow.value = withDelay(
        S.IGNITE_DELAY_MS,
        withSequence(
          withTiming(GLOW_BASELINE, { duration: S.IGNITE_MS, easing: EASE }),
          withRepeat(
            withTiming(GLOW_PEAK, {
              duration: S.GLOW_BREATHE_MS / 2,
              easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true, // auto-reverse → full up+back cycle = GLOW_BREATHE_MS
          ),
        ),
      );

      // "ARE YOU?" rises + fades in.
      areyou.value = withDelay(S.AREYOU_DELAY_MS, withTiming(1, { duration: S.AREYOU_MS, easing: EASE }));

      // Felt "lock" on the ARE YOU? beat — the signature.
      timers.push(
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, S.HAPTIC_DELAY_MS),
      );

      timers.push(setTimeout(onDone, S.TOTAL_MS));
    })();

    return () => {
      mounted = false;
      timers.forEach(clearTimeout);
    };
    // Mount-only: the statement plays once per cold start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Both wordmark layers share these exact text props → identical layout.
  const wordStyle = { fontSize: FITTED_SIZE, lineHeight: FITTED_SIZE, maxWidth: BLOCK_W };

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.hero}>
        <Animated.View style={weareStyle}>
          <Text className="font-heading" style={styles.weare}>
            WE ARE
          </Text>
        </Animated.View>

        <Animated.View style={[styles.wordmarkGroup, igniteStyle]}>
          {/* BASE */}
          <Wordmark numberOfLines={1} className="text-[#E8EDF2]" style={[styles.wordmarkText, wordStyle]} />
          {/* GLOW LAYER — pure-white duplicate, static text-shadow halo, opacity-animated */}
          <Animated.View style={[styles.glowLayer, glowStyle]} pointerEvents="none">
            <Wordmark numberOfLines={1} className="text-[#FFFFFF]" style={[styles.wordmarkText, styles.glowText, wordStyle]} />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.areyouWrap, areyouStyle]}>
          <Text className="font-heading" style={styles.areyou}>
            ARE YOU?
          </Text>
        </Animated.View>
      </View>
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
