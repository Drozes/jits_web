import * as React from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { haptics, useReduceMotion } from "@/lib/motion";
import { usePalette, TABULAR } from "@/lib/theme/palette";
import { DeltaChip, spokenDelta } from "@/components/ui/elo-system/delta-chip";
import { RollingNumber, usePlayOnce } from "@/components/ui/elo-system/rolling-number";
import { RatingBlock, deltaColor } from "../fight/fight-ui";

/** "The tap": three tick marks, 180ms apart (Motion Rule registry). */
export const TAP_COUNT = 3;
export const TAP_STAGGER_MS = 180;
/** The roll starts once the third tick has had its beat. */
export const TAP_LEAD_MS = TAP_COUNT * TAP_STAGGER_MS;
/** How far the card nudges on each tick, px. */
const NUDGE_PX = 2;

const RATING_TEXT = { fontSize: 22, lineHeight: 26 } as const;

/**
 * Three Signal Red tick marks. `play` fills them one by one, 180ms apart, on
 * the UI thread; otherwise (the loser, a replay, Reduce Motion) they are
 * drawn filled and still. Decorative: the finish is already in the copy.
 */
export function TapMarks({ play }: { play: boolean }) {
  const p = usePalette();
  return (
    <View
      testID="verdict-tap-marks"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", gap: 3, marginLeft: 10, alignItems: "center" }}
    >
      {Array.from({ length: TAP_COUNT }, (_, i) => (
        <TapMark key={i} index={i} play={play} track={p.track} fill={p.cta} />
      ))}
    </View>
  );
}

function TapMark({ index, play, track, fill }: { index: number; play: boolean; track: string; fill: string }) {
  const reduceMotion = useReduceMotion();
  const animate = play && !reduceMotion;
  const filled = useSharedValue(animate ? 0 : 1);
  React.useEffect(() => {
    if (!animate) return;
    filled.value = withDelay(index * TAP_STAGGER_MS, withTiming(1, { duration: 80 }));
    // Mount-only: the moment plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: filled.value }));
  return (
    <View testID={`verdict-tap-mark-${index}`} style={{ width: 3, height: 14, borderRadius: 1, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: fill }, style]} />
    </View>
  );
}

interface RatingMomentProps {
  matchId: string;
  outcome: "win" | "loss" | "draw" | null;
  disputed: boolean;
  /** The result was a submission (points or decision results skip the tap). */
  submission: boolean;
  before: number | null;
  after: number;
  delta: number | null;
}

/**
 * The verdict's rating card as one Moment, played once per confirmed result
 * (keyed on the match and the stamped rating, so a remount or navigating
 * back shows the end state, silent):
 *
 * 1. A submission WIN gets "the tap": the card nudges three times as three
 *    Signal Red marks fill, 180ms apart, each with `tapTick`. The loser of a
 *    submission sees the marks filled, still and silent.
 * 2. The rating rolls like an odometer (`RollingNumber`), after the tap.
 * 3. When it lands the delta chip pops in, and a gain on a win fires
 *    `ratingGain`. Nothing buzzes on a loss or a draw.
 *
 * Reduce Motion: marks, number and chip are shown final; the winner's
 * haptics keep their timing. VoiceOver reads only "Rating 1526, up 14".
 */
export function RatingMoment({ matchId, outcome, disputed, submission, before, after, delta }: RatingMomentProps) {
  const p = usePalette();
  const reduceMotion = useReduceMotion();
  const play = usePlayOnce(`verdict:${matchId}:${after}`, !disputed);
  const showBefore = !disputed && before != null && before !== after;
  const submissionWin = submission && !disputed && outcome === "win";
  const submissionLoss = submission && !disputed && outcome === "loss";
  const tapPlays = play && submissionWin;
  const gain = outcome === "win" && !disputed && before != null && after > before;
  const [landed, setLanded] = React.useState(!play);

  // The tap's haptics, winner only, kept under Reduce Motion.
  React.useEffect(() => {
    if (!tapPlays) return;
    void haptics.tapTick();
    const timers = Array.from({ length: TAP_COUNT - 1 }, (_, i) => setTimeout(() => void haptics.tapTick(), (i + 1) * TAP_STAGGER_MS));
    return () => timers.forEach(clearTimeout);
    // Mount-only: the moment plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The card's three micro-nudges, on the UI thread.
  const nudge = useSharedValue(0);
  React.useEffect(() => {
    if (!tapPlays || reduceMotion) return;
    const beat = () => withSequence(withTiming(NUDGE_PX, { duration: 50 }), withTiming(0, { duration: TAP_STAGGER_MS - 50 }));
    nudge.value = withSequence(beat(), beat(), beat());
    // Mount-only: the moment plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nudgeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: nudge.value }] }));

  const onLanded = React.useCallback(() => {
    setLanded(true);
    if (gain) void haptics.ratingGain();
  }, [gain]);

  const spoken = delta != null && delta !== 0 ? `Rating ${after}, ${spokenDelta(delta)}` : `Rating ${after}`;

  return (
    <Animated.View style={nudgeStyle}>
      <View testID="verdict-rating-card" accessible accessibilityRole="text" accessibilityLabel={spoken}>
        <RatingBlock
          before={before}
          after={after}
          delta={delta}
          ratingNode={
            <View testID="verdict-rating" style={{ flexDirection: "row", alignItems: "center" }}>
              {showBefore ? (
                <Text className="font-mono-bold" style={[RATING_TEXT, { color: p.text }, TABULAR]}>
                  {`${before} → `}
                </Text>
              ) : null}
              <RollingNumber
                testID="verdict-rating-value"
                from={showBefore ? before : null}
                to={after}
                play={play}
                delayMs={tapPlays ? TAP_LEAD_MS : 0}
                onLanded={onLanded}
                className="font-mono-bold"
                style={{ ...RATING_TEXT, color: p.text, fontVariant: ["tabular-nums"] }}
              />
              {submissionWin || submissionLoss ? <TapMarks play={tapPlays} /> : null}
            </View>
          }
          deltaNode={
            delta != null && delta !== 0 ? (
              <DeltaChip
                testID="summary-elo-delta"
                delta={delta}
                color={outcome === "draw" ? p.amber : deltaColor(delta, p)}
                shown={landed}
                animate={play}
                style={{ fontSize: 26 }}
              />
            ) : null
          }
        />
      </View>
    </Animated.View>
  );
}
