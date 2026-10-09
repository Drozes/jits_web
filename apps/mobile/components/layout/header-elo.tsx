/**
 * The header rating (jits-1ez5.1): after the wordmark on every tab root, a
 * 1px hairline-strong rule, then the athlete's `current_elo` in JetBrains
 * Mono 700 16px ink, on the wordmark's baseline. It reads the auth context
 * only, so it paints on the first frame and never fetches. The rating is the
 * only button in the left side (the wordmark stays a logo): a 44pt tall
 * target that opens Your numbers.
 *
 * After a result it rolls once and shows the delta for about 4s ("Header ELO
 * roll" in the Motion registry, `lib/rating/header-elo.ts`).
 */
import * as React from "react";
import { AccessibilityInfo, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { DeltaChip, RollingNumber } from "@/components/ui/elo-system";
import { useAuth } from "@/lib/auth/hooks";
import { duration, useReduceMotion } from "@/lib/motion";
import { useScreenFocused } from "@/lib/navigation/use-screen-focused";
import {
  HEADER_DELTA_GAP,
  HEADER_DELTA_HOLD_MS,
  HEADER_DELTA_STEP,
  claimHeaderMoment,
  headerDeltaFits,
  headerDeltaTone,
  headerEloAnnouncement,
  headerEloLabel,
  headerEloScale,
  takeVerdictOutcomeFor,
  useHeaderEloMoment,
  type HeaderEloMoment,
} from "@/lib/rating/header-elo";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, typeStep } from "@/lib/typography";
import { YourNumbersSheet } from "./your-numbers-sheet";

export const HEADER_ELO_TEST_ID = "header-elo";
/** The rating's touch row: taller than the 22pt text, inside the 56pt bar. */
export const HEADER_ELO_TARGET_HEIGHT = 44;
/** The pressed plate reaches this far past the digits on each side. */
const PRESS_PAD_X = 6;
/** The join: 10pt, a 16pt rule, 10pt. */
const JOIN_GAP = 10;
const RULE_HEIGHT = 16;

const RATING_STEP = typeStep("subhead");
const DELTA_STEP = typeStep(HEADER_DELTA_STEP);
const RATING_CLASS = "font-mono-bold text-ink";

/**
 * A text step at the header's own Dynamic Type scale. The header sizes its
 * rating and delta itself, with OS scaling off, like the status chip: relying
 * on `maxFontSizeMultiplier` left the rating at 1x on device (jits-1ez5
 * review D2) while the chip grew.
 */
function scaled(step: { fontSize: number; lineHeight: number }, scale: number) {
  return { fontSize: step.fontSize * scale, lineHeight: Math.round(step.lineHeight * scale) };
}

interface HeaderEloProps {
  /** The row width the status chip leaves unused (`HeaderStatusChip` `onSpareWidth`). */
  spareWidth: number | null;
}

export function HeaderElo({ spareWidth }: HeaderEloProps) {
  const { athlete } = useAuth();
  const focused = useScreenFocused();
  const { fontScale } = useWindowDimensions();
  const scale = headerEloScale(fontScale);
  const rating = athlete?.current_elo;
  const moment = useHeaderEloMoment(athlete?.id, rating ?? undefined, focused);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // Mounted from the tap until the sheet reports itself closed, so idle tab
  // roots carry no sheet (and no reads) at all.
  const [sheetMounted, setSheetMounted] = React.useState(false);
  const onSheetClosed = React.useCallback(() => {
    setSheetOpen(false);
    setSheetMounted(false);
  }, []);

  // The tab lost focus with the sheet up (accepting a challenge pushes the
  // match): close it, so it never sits over the next screen. The sheet's own
  // guard dismisses only what it presented.
  React.useEffect(() => {
    if (!focused && sheetOpen) setSheetOpen(false);
  }, [focused, sheetOpen]);

  // Signed out (or switching athlete): nothing of the old sheet survives.
  const hasAthlete = athlete != null;
  React.useEffect(() => {
    if (hasAthlete) return;
    setSheetOpen(false);
    setSheetMounted(false);
  }, [hasAthlete]);

  if (!athlete || rating == null) return null;

  const ratingStyle = { ...scaled(RATING_STEP, scale), ...TABULAR };

  return (
    <>
      <View
        testID="header-elo-rule"
        className="bg-hairline-strong"
        style={{ width: 1, height: RULE_HEIGHT, marginHorizontal: JOIN_GAP, alignSelf: "center" }}
      />
      <Pressable
        testID={HEADER_ELO_TEST_ID}
        accessibilityRole="button"
        accessibilityLabel={headerEloLabel(rating)}
        accessibilityHint="Opens your numbers"
        onPress={() => {
          setSheetMounted(true);
          setSheetOpen(true);
        }}
        className="justify-center rounded-xs active:bg-surface-3"
        style={{ height: HEADER_ELO_TARGET_HEIGHT, paddingHorizontal: PRESS_PAD_X, marginHorizontal: -PRESS_PAD_X, flexShrink: 0 }}
      >
        {/* The digits centred in the 44pt row; the delta on their baseline. */}
        <View className="flex-row items-baseline">
          {moment ? (
            // Keyed on the change: a new result is a new mount, one roll each.
            <HeaderEloRoll
              key={moment.key}
              athleteId={athlete.id}
              moment={moment}
              rating={rating}
              spareWidth={spareWidth}
              scale={scale}
              ratingStyle={ratingStyle}
            />
          ) : (
            <Text
              testID="header-elo-value"
              numberOfLines={1}
              allowFontScaling={false}
              className={RATING_CLASS}
              style={ratingStyle}
            >
              {rating}
            </Text>
          )}
        </View>
      </Pressable>
      {sheetMounted ? <YourNumbersSheet athlete={athlete} open={sheetOpen} onClosed={onSheetClosed} /> : null}
    </>
  );
}

/**
 * The post-match moment: the rating rolls from the old value (RollingNumber),
 * then the delta sits beside it for `HEADER_DELTA_HOLD_MS` and fades out.
 * The delta shows only if it fits beside the chip as the row stands when the
 * moment starts; otherwise the moment is the roll alone. Reduce Motion: the
 * landed value at once, the delta shown and then removed in place. No haptic.
 * A negative delta is amber when the last verdict the athlete saw was a draw.
 */
function HeaderEloRoll({
  athleteId,
  moment,
  rating,
  spareWidth,
  scale,
  ratingStyle,
}: {
  athleteId: string;
  moment: HeaderEloMoment;
  rating: number;
  spareWidth: number | null;
  scale: number;
  ratingStyle: { fontSize: number; lineHeight: number };
}) {
  // Decided on mount: the first header to claim this change plays it.
  const [play] = React.useState(() => claimHeaderMoment(moment.key));
  const reduceMotion = useReduceMotion();
  const p = usePalette();
  // Decided once, on mount: the delta's own width must not re-decide it.
  const [withDelta] = React.useState(() => play && headerDeltaFits(moment.delta, scale, spareWidth));
  // Only the playing header spends the verdict's outcome, and only on the
  // change that verdict started from.
  const [tone] = React.useState(() =>
    headerDeltaTone(moment.delta, play ? takeVerdictOutcomeFor(athleteId, moment.from) : null),
  );
  const [phase, setPhase] = React.useState<"rolling" | "shown" | "gone">(withDelta ? "rolling" : "gone");

  const onLanded = React.useCallback(() => {
    AccessibilityInfo.announceForAccessibility(headerEloAnnouncement(moment.to, moment.delta));
    setPhase((cur) => (cur === "rolling" ? "shown" : cur));
  }, [moment.to, moment.delta]);

  React.useEffect(() => {
    if (phase !== "shown") return;
    const id = setTimeout(() => setPhase("gone"), HEADER_DELTA_HOLD_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const color = tone === "win" ? p.win : tone === "draw" ? p.amber : p.loss;

  return (
    <>
      <RollingNumber
        testID="header-elo-value"
        from={moment.from}
        to={rating}
        play={play}
        onLanded={play ? onLanded : undefined}
        className={RATING_CLASS}
        style={ratingStyle}
        // Already sized for Dynamic Type above: the digits must not scale again.
        maxFontScale={1}
        staticTextProps={{ numberOfLines: 1, allowFontScaling: false }}
      />
      {phase !== "gone" ? (
        <Animated.View
          testID="header-elo-delta"
          exiting={reduceMotion ? undefined : FadeOut.duration(duration.fast)}
          style={{ marginLeft: HEADER_DELTA_GAP }}
        >
          <DeltaChip
            testID="header-elo-delta-text"
            delta={moment.delta}
            color={color}
            shown={phase === "shown"}
            animate={play}
            style={scaled(DELTA_STEP, scale)}
            allowFontScaling={false}
          />
        </Animated.View>
      ) : null}
    </>
  );
}
