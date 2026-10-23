import * as React from "react";
import { Text, View } from "react-native";
import { Timer } from "lucide-react-native";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { useSecondsLeft } from "./use-seconds-left";

/** At this many seconds and under, the chip takes its still emphasis (COPY-DECK Round 5, TK-W1). */
export const DEADLINE_EMPHASIS_S = 120;

/** The chip's text keeps one line up to this Dynamic Type multiple. */
const MAX_FONT_SCALE = 1.3;

/**
 * TK-W1 `CANCELS IN {m:ss}`: the pick deadline (`timekeeper_deadline_at`),
 * after which the server cancels the match (`no_timekeeper`). Always the
 * attention (amber) token, never Signal Red (review product minor 2). From
 * 2:00 down it is emphasised and still: bold text and the full amber rule,
 * no animation. Nothing renders without a deadline (a seated timekeeper
 * clears it).
 */
export function DeadlineChip({ deadlineAt }: { deadlineAt: string | null | undefined }) {
  const p = usePalette();
  const seconds = useSecondsLeft(deadlineAt);
  if (seconds == null) return null;
  const urgent = seconds <= DEADLINE_EMPHASIS_S;
  const copy = TIMEKEEPER_COPY["TK-W1"];
  return (
    <View
      testID="crew-deadline"
      // One accessibility element, so VoiceOver speaks the deck's label, not the CANCELS IN text.
      accessible
      accessibilityRole="timer"
      accessibilityLabel={copy.a11y(seconds)}
      style={{
        height: 28,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 9,
        borderWidth: 1,
        borderColor: urgent ? p.amber : p.amberRule,
        borderRadius: FIGHT_RADIUS.tag,
        flexShrink: 0,
      }}
    >
      <Timer size={13} color={p.amber} />
      <Text
        testID="crew-deadline-text"
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        className={urgent ? "font-mono-bold" : "font-mono"}
        style={[typeStep("body"), { color: p.amber }, TABULAR]}
      >
        {copy.text(seconds)}
      </Text>
    </View>
  );
}
