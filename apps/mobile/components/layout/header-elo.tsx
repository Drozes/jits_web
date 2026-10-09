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
import { DeltaChip, RollingNumber, usePlayOnce } from "@/components/ui/elo-system";
import { useAuth } from "@/lib/auth/hooks";
import { duration, useReduceMotion } from "@/lib/motion";
import { useScreenFocused } from "@/lib/navigation/use-screen-focused";
import {
  HEADER_DELTA_GAP,
  HEADER_DELTA_HOLD_MS,
  HEADER_DELTA_STEP,
  HEADER_ELO_MAX_FONT_SCALE,
  headerDeltaFits,
  headerEloAnnouncement,
  headerEloLabel,
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

const RATING_STYLE = { ...typeStep("subhead"), ...TABULAR };
const RATING_CLASS = "font-mono-bold text-ink";

interface HeaderEloProps {
  /** The row width the status chip leaves unused (`HeaderStatusChip` `onSpareWidth`). */
  spareWidth: number | null;
}

export function HeaderElo({ spareWidth }: HeaderEloProps) {
  const { athlete } = useAuth();
  const focused = useScreenFocused();
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

  if (!athlete || rating == null) return null;

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
            // Keyed on the transition: a new result is a new mount, one roll each.
            <HeaderEloRoll key={moment.key} moment={moment} rating={rating} spareWidth={spareWidth} />
          ) : (
            <RatingText rating={rating} />
          )}
        </View>
      </Pressable>
      {sheetMounted ? <YourNumbersSheet athlete={athlete} open={sheetOpen} onClosed={onSheetClosed} /> : null}
    </>
  );
}

function RatingText({ rating }: { rating: number }) {
  return (
    <Text
      testID="header-elo-value"
      numberOfLines={1}
      maxFontSizeMultiplier={HEADER_ELO_MAX_FONT_SCALE}
      className={RATING_CLASS}
      style={RATING_STYLE}
    >
      {rating}
    </Text>
  );
}

/**
 * The post-match moment: the rating rolls from the old value (RollingNumber),
 * then the delta sits beside it for `HEADER_DELTA_HOLD_MS` and fades out.
 * The delta shows only if it fits beside the chip as the row stands when the
 * moment starts; otherwise the moment is the roll alone. Reduce Motion: the
 * landed value at once, the delta shown and then removed in place. No haptic.
 */
function HeaderEloRoll({
  moment,
  rating,
  spareWidth,
}: {
  moment: HeaderEloMoment;
  rating: number;
  spareWidth: number | null;
}) {
  const play = usePlayOnce(moment.key, true);
  const reduceMotion = useReduceMotion();
  const p = usePalette();
  const { fontScale } = useWindowDimensions();
  // Decided once, on mount: the delta's own width must not re-decide it.
  const [withDelta] = React.useState(() => play && headerDeltaFits(moment.delta, fontScale, spareWidth));
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

  return (
    <>
      <RollingNumber
        testID="header-elo-value"
        from={moment.from}
        to={rating}
        play={play}
        onLanded={play ? onLanded : undefined}
        className={RATING_CLASS}
        style={RATING_STYLE}
        maxFontScale={HEADER_ELO_MAX_FONT_SCALE}
        staticTextProps={{ numberOfLines: 1, maxFontSizeMultiplier: HEADER_ELO_MAX_FONT_SCALE }}
      />
      {phase !== "gone" ? (
        <Animated.View
          testID="header-elo-delta"
          exiting={reduceMotion ? undefined : FadeOut.duration(duration.fast)}
          style={{ marginLeft: HEADER_DELTA_GAP }}
        >
          <DeltaChip
            delta={moment.delta}
            color={moment.delta > 0 ? p.win : p.loss}
            shown={phase === "shown"}
            animate={play}
            style={typeStep(HEADER_DELTA_STEP)}
            maxFontSizeMultiplier={HEADER_ELO_MAX_FONT_SCALE}
          />
        </Animated.View>
      ) : null}
    </>
  );
}
