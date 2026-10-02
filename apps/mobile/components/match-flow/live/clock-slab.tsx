import { Text, View } from "react-native";
import { LivePill } from "@/components/ui/elo-system";
import { spokenDuration, type SlabLabel } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_LANDSCAPE, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";
import { TRACKING, numeralTracking, typeStep } from "@/lib/typography";

const LABEL_TEXT = { ...typeStep("micro"), lineHeight: 12, letterSpacing: TRACKING["caps-xl"] };
const DIGITS = { ...typeStep("display-88"), lineHeight: 92, letterSpacing: numeralTracking(88) };
const DIGITS_LANDSCAPE = { ...typeStep("display-80"), lineHeight: 84, letterSpacing: numeralTracking(80) };

/** What a screen reader hears before the time, so the state is not only visual. */
const SPOKEN_PREFIX: Record<SlabLabel, string> = {
  live: "",
  paused: "Paused, ",
  time: "Time up, ",
  final: "Final clock, ",
};

function StaticLabel({ text, color, dot }: { text: string; color: string; dot: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} /> : null}
      <Text className="font-mono-bold" style={[LABEL_TEXT, { color }, TABULAR]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The clock: remaining time in big mono digits that never change color, the
 * state label top-left and the bout length top-right. Landscape is a
 * slightly shorter slab (96) with 80 px digits.
 */
export function ClockSlab({
  label,
  formatted,
  seconds,
  durationFormatted,
  landscape = false,
}: {
  label: SlabLabel;
  formatted: string;
  /** The same remaining time as `formatted`, in seconds, for the spoken label. */
  seconds: number;
  durationFormatted: string;
  landscape?: boolean;
}) {
  return (
    <View
      testID="live-clock-slab"
      style={{
        height: landscape ? BROADCAST_LANDSCAPE.slab : BROADCAST_SIZE.slab,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BROADCAST.slab,
        borderBottomLeftRadius: BROADCAST_RADIUS.plate,
        borderBottomRightRadius: BROADCAST_RADIUS.plate,
      }}
    >
      <View testID={`live-slab-${label}`} style={{ position: "absolute", left: 12, top: 10 }}>
        {label === "live" ? (
          <LivePill label="LIVE" onDark pace="fixed" />
        ) : label === "paused" ? (
          <StaticLabel text="PAUSED" color={BROADCAST.amber} dot />
        ) : label === "time" ? (
          <StaticLabel text="TIME" color={BROADCAST.amber} dot />
        ) : (
          <StaticLabel text="FINAL" color={BROADCAST.dim62} dot={false} />
        )}
      </View>
      <Text
        className="font-mono-medium"
        style={[typeStep("micro"), { position: "absolute", right: 12, top: 10, lineHeight: 12, letterSpacing: TRACKING["caps-l"], color: BROADCAST.dim62 }, TABULAR]}
      >
        OF {durationFormatted}
      </Text>
      <Text
        testID="live-timer"
        accessibilityRole="timer"
        accessibilityLabel={`${SPOKEN_PREFIX[label]}${spokenDuration(seconds)} remaining`}
        className="font-mono-bold"
        style={[
          { ...(landscape ? DIGITS_LANDSCAPE : DIGITS), color: BROADCAST.inkDark, paddingTop: 10 },
          TABULAR,
        ]}
      >
        {formatted}
      </Text>
    </View>
  );
}
