import * as React from "react";
import { AccessibilityInfo, Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as SplashScreen from "expo-splash-screen";
import { SPLASH_GLOW_STATEMENT, SPLASH_REVEAL } from "@jits/shared/constants";
import { ErMark } from "@/components/ui/elo-system/er-mark";

const S = SPLASH_GLOW_STATEMENT;
const EASE = Easing.bezier(
  SPLASH_REVEAL.EASING_BEZIER[0],
  SPLASH_REVEAL.EASING_BEZIER[1],
  SPLASH_REVEAL.EASING_BEZIER[2],
  SPLASH_REVEAL.EASING_BEZIER[3],
);
// Smooth settle ease (no overshoot) for the expand.
const EXPAND = Easing.bezier(
  S.EASING_EXPAND[0],
  S.EASING_EXPAND[1],
  S.EASING_EXPAND[2],
  S.EASING_EXPAND[3],
);

// Void "arena" palette, theme-independent, matches the native splash exactly so
// the hand-off has no seam.
const VOID = "#0D0F14";
const WHITE = "#E8EDF2"; // ELO RATED
const GRAY = "#9CA3AF"; // WE ARE
const RED = "#E63946"; // Signal Red, ARE YOU? only

// dp width of the centered mark. KEEP THIS EQUAL to app.json's expo-splash-screen
// `imageWidth`, that's what makes the static native splash and this animated
// overlay the same size so the hand-off has no size jump. (The native side only
// updates on a prebuild/EAS build; this overlay updates instantly over Metro.)
const MARK_DP = 280;

// Centered block; the wordmark is the widest child and sets the column width, so
// WE ARE / ARE YOU? align to the wordmark's left / right edges (no measurement).
const BLOCK_W = Math.min(Dimensions.get("window").width - 48, 360);

// Fixed fitted wordmark size (NO adjustsFontSizeToFit / no runtime measure, per the
// New-Arch rules). Bebas Neue is condensed; ~0.46 of fontSize per glyph is a safe
// width estimate for "ELO RATED" (9 glyphs incl. the space). Clamp down from the
// design's ~64 if it would overflow BLOCK_W, never up.
const WORD_TEXT = "ELO RATED";
// Bigger final wordmark = a smaller settle (MARK_MATCH) from the E·R seed, so the
// E·R → ELO RATED transition reads tighter (less shrink). The formula still clamps
// per device so the word never overflows BLOCK_W on narrow phones.
const TARGET_SIZE = 80;
const CHAR_W_RATIO = 0.46;
const FITTED_SIZE = Math.min(TARGET_SIZE, Math.floor(BLOCK_W / (WORD_TEXT.length * CHAR_W_RATIO)));

// Explicit word-gap width between ELO and RATED (a lone space glyph's advance is
// font/platform-dependent and can collapse to "ELORATED").
const WORD_GAP = Math.round(FITTED_SIZE * 0.32);

// --- Expand-from-seed geometry (analytical, so there is NO runtime text measure) ---
const ADV = CHAR_W_RATIO * FITTED_SIZE; // estimated per-glyph advance
const WORD_W = 8 * ADV + WORD_GAP; // E L O [gap] R A T E D
const SEED_SPREAD = Math.round(FITTED_SIZE * 0.46); // compact E·R half-spread at the seed

// The Bebas wordmark starts scaled to the DM Sans mark's cap height (so the
// DM Sans→Bebas crossfade has no size jump), then settles to 1 as it expands.
// Mark cap = the E·R glyph height (0..-259.66 in the splash.svg 1024 box).
const MARK_CAP = (259.66 / 1024) * MARK_DP;
const BEBAS_CAP = 0.7 * FITTED_SIZE;
const MARK_MATCH = MARK_CAP / BEBAS_CAP;

const TOTAL_EXPAND = S.UNFURL_MS + S.UNFURL_STEP_MS * 4; // last letter's end
const FADE_ANCHOR = S.MARK_FADE_MS / S.UNFURL_MS; // E,R crossfade in with the mark
const FADE_LETTER = 0.5;

// Per-letter expand data. side: -1 = ELO (spreads left), +1 = RATED (spreads right);
// k: layout slot (for the analytical final position); order: stagger from the anchor.
const LETTER_DATA = [
  { ch: "E", side: -1, k: 0, order: 0, anchor: true },
  { ch: "L", side: -1, k: 1, order: 1, anchor: false },
  { ch: "O", side: -1, k: 2, order: 2, anchor: false },
  { ch: "R", side: 1, k: 3, order: 0, anchor: true },
  { ch: "A", side: 1, k: 4, order: 1, anchor: false },
  { ch: "T", side: 1, k: 5, order: 2, anchor: false },
  { ch: "E", side: 1, k: 6, order: 3, anchor: false },
  { ch: "D", side: 1, k: 7, order: 4, anchor: false },
].map((L) => {
  const leftEdge = L.k * ADV + (L.k >= 3 ? WORD_GAP : 0);
  const finalCenter = leftEdge + ADV / 2 - WORD_W / 2; // from the row center
  return {
    ch: L.ch,
    seedTX: L.side * SEED_SPREAD - finalCenter, // collapse to the compact E·R seed
    winStart: (L.order * S.UNFURL_STEP_MS) / TOTAL_EXPAND,
    winEnd: (L.order * S.UNFURL_STEP_MS + S.UNFURL_MS) / TOTAL_EXPAND,
    fadeFrac: L.anchor ? FADE_ANCHOR : FADE_LETTER,
  };
});

/** One letter that expands outward from the compact seed to its final slot. */
function ExpandLetter({
  ch,
  expand,
  seedTX,
  winStart,
  winEnd,
  fadeFrac,
}: {
  ch: string;
  expand: SharedValue<number>;
  seedTX: number;
  winStart: number;
  winEnd: number;
  fadeFrac: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(expand.value, [winStart, winEnd], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, fadeFrac], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(p, [0, 1], [seedTX, 0]) }],
    };
  });
  return (
    <Animated.Text className="font-display" style={[styles.letter, style]}>
      {ch}
    </Animated.Text>
  );
}

interface SplashGlowStatementProps {
  /** Called once the statement (or its reduced-motion fallback) finishes. */
  onDone: () => void;
}

export function SplashGlowStatement({ onDone }: SplashGlowStatementProps) {
  // DM Sans mark layers. Frame 0 = the static splash: mark fully on. The mark holds
  // its size and just fades (Option B); the Bebas wordmark does the size match.
  const glyph = useSharedValue(1); // white E/R
  const dot = useSharedValue(1); // red interpunct

  // Hero cluster.
  const weare = useSharedValue(0);
  const expand = useSharedValue(0); // drives every letter (translateX + opacity) + the settle scale
  const areyou = useSharedValue(0);

  // Reduced-motion fades the whole resting frame in via this one value.
  const intro = useSharedValue(0);
  // Whole-overlay opacity; dismissal cross-dissolves it to 0.
  const farewell = useSharedValue(1);

  // The mark must NOT be visible in the reduced-motion resting frame (it would
  // overlap the wordmark). We start with it shown so frame 0 is correct for the
  // full-motion path, then unmount it if reduce-motion turns out to be on.
  const [showMark, setShowMark] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Hand the native splash off to this overlay (identical Void bg → no seam).
    SplashScreen.hideAsync().catch(() => {});

    const dismiss = () => {
      farewell.value = withTiming(0, { duration: S.FADEOUT_MS, easing: EASE }, (finished) => {
        if (finished) runOnJS(onDone)();
      });
    };

    (async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {}
      if (!mounted) return;

      if (reduce) {
        // Resting final frame: NO mark, full ELO RATED, WE ARE + ARE YOU?. Fade the
        // group IN via opacity only, no expand / scale / haptic.
        setShowMark(false);
        glyph.value = 0;
        dot.value = 0;
        weare.value = 1;
        expand.value = 1; // letters at their final slots, wordmark at final size
        areyou.value = 1;
        intro.value = withTiming(1, { duration: S.REDUCED_MOTION_FADEIN_MS, easing: EASE });
        timers.push(setTimeout(dismiss, S.REDUCED_MOTION_FADEIN_MS + S.REDUCED_MOTION_HOLD_MS));
        return;
      }

      // Full motion. The hero group is opaque; each element reveals itself.
      intro.value = 1;

      // WE ARE rises in during the hold (left-aligned).
      weare.value = withDelay(S.WEARE_DELAY_MS, withTiming(1, { duration: S.WEARE_MS, easing: EASE }));

      // Red interpunct fades out within the hold, before any letter expands.
      dot.value = withDelay(S.DOT_FADE_DELAY_MS, withTiming(0, { duration: S.DOT_FADE_MS, easing: EASE }));

      // EXP: the mark's white E/R crossfade out as the Bebas wordmark crossfades in
      // (at the mark's size) and expands outward from the seed, settling to final.
      glyph.value = withDelay(S.EXP_DELAY_MS, withTiming(0, { duration: S.MARK_FADE_MS, easing: EASE }));
      expand.value = withDelay(S.EXP_DELAY_MS, withTiming(1, { duration: TOTAL_EXPAND, easing: EXPAND }));

      // LOCK: a Heavy haptic + "ARE YOU?" rises in red (right-aligned).
      areyou.value = withDelay(S.AREYOU_DELAY_MS, withTiming(1, { duration: S.AREYOU_MS, easing: EASE }));
      timers.push(
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, S.HAPTIC_DELAY_MS),
      );

      timers.push(setTimeout(dismiss, S.TOTAL_MS));
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
  // The whole wordmark settles from the mark's size down to its final size as it
  // expands (scales about its center = screen center, since the row fills the block).
  const wordmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(expand.value, [0, 1], [MARK_MATCH, 1], Extrapolation.CLAMP) }],
  }));
  const areyouStyle = useAnimatedStyle(() => ({
    opacity: areyou.value,
    transform: [{ translateY: interpolate(areyou.value, [0, 1], [6, 0]) }],
  }));
  const introStyle = useAnimatedStyle(() => ({ opacity: intro.value }));
  const farewellStyle = useAnimatedStyle(() => ({ opacity: farewell.value }));

  return (
    <Animated.View style={[styles.overlay, farewellStyle]} pointerEvents="none">
      {/* DM Sans mark, absolutely centered in the FULL screen (matches the native
          splash, ignores safe-area insets), behind the hero cluster. */}
      {showMark && <ErMark size={MARK_DP} glyphOpacity={glyph} dotOpacity={dot} />}

      <Animated.View style={[styles.hero, introStyle]}>
        <Animated.View style={weareStyle}>
          <Text className="font-heading" style={styles.weare}>
            WE ARE
          </Text>
        </Animated.View>

        {/* ELO RATED, a per-letter row that EXPANDS outward from the compact E·R
            seed (the leading E, R lead; the rest cascade), while the whole row scales
            down from the mark's size to final. Transforms only → no Yoga reflow. */}
        <Animated.View style={[styles.wordmarkRow, wordmarkStyle]}>
          {LETTER_DATA.slice(0, 3).map((d, i) => (
            <ExpandLetter key={i} expand={expand} {...d} />
          ))}
          <View style={{ width: WORD_GAP }} />
          {LETTER_DATA.slice(3).map((d, i) => (
            <ExpandLetter key={i + 3} expand={expand} {...d} />
          ))}
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
    // Size the block to the wordmark (its widest child) so ELO RATED is centered and
    // WE ARE / ARE YOU? frame its left / right edges.
    maxWidth: BLOCK_W,
    alignItems: "stretch",
    // Nudge WE ARE + ELO RATED DOWN so the caps land on the E·R (screen center).
    // Bebas caps ride high in their line box, so the cluster otherwise centers above
    // them. ARE YOU? cancels this shift (below) so only WE ARE + ELO RATED move. Also
    // tightens the seed→mark vertical alignment at the crossfade.
    transform: [{ translateY: 12 }],
  },
  weare: {
    color: GRAY,
    fontSize: 15,
    letterSpacing: 6.3, // ~0.42em * 15
    alignSelf: "stretch",
    marginBottom: 14,
    // Nudge WE ARE UP (transform, so it doesn't push ELO RATED down) for a touch more
    // breathing room above the wordmark.
    transform: [{ translateY: -8 }],
  },
  wordmarkRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    // Center the letters in the row so the wordmark stays centered under the E·R
    // mark even if the row is ever wider than the word, and so the seed collapse is
    // relative to the true center.
    justifyContent: "center",
  },
  letter: {
    color: WHITE,
    fontSize: FITTED_SIZE,
    // Bebas Neue's tall caps overflow the default line box; lineHeight == fontSize
    // keeps them fully visible (mirrors the Wordmark component).
    lineHeight: FITTED_SIZE,
  },
  areyouWrap: {
    alignSelf: "flex-end",
    // 12 (gap) − 12 (cancel the cluster's downward nudge) = 0, so ARE YOU? holds its
    // position while WE ARE + ELO RATED move down, which also closes the gap below
    // ELO RATED.
    marginTop: 0,
  },
  areyou: {
    color: RED,
    fontSize: 24,
    letterSpacing: 3.6, // ~0.15em * 24
    textAlign: "right",
  },
});
