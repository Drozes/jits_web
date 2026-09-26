import { Text, View } from "react-native";
import { LivePill } from "@/components/ui/elo-system";
import { spokenDuration, type SlabLabel } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";

const LABEL_TEXT = { fontSize: 10, lineHeight: 12, letterSpacing: 2.52 };

function StaticLabel({ text, color, dot }: { text: string; color: string; dot: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} /> : null}
      <Text className="font-mono-bold" style={[LABEL_TEXT, { color }]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The clock: remaining time in big mono digits that never change color, the
 * state label top-left and the bout length top-right.
 */
export function ClockSlab({
  label,
  formatted,
  seconds,
  durationFormatted,
}: {
  label: SlabLabel;
  formatted: string;
  /** The same remaining time as `formatted`, in seconds, for the spoken label. */
  seconds: number;
  durationFormatted: string;
}) {
  return (
    <View
      testID="live-clock-slab"
      style={{
        height: BROADCAST_SIZE.slab,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BROADCAST.slab,
        borderBottomLeftRadius: BROADCAST_RADIUS.plate,
        borderBottomRightRadius: BROADCAST_RADIUS.plate,
      }}
    >
      <View testID={`live-slab-${label}`} style={{ position: "absolute", left: 12, top: 10 }}>
        {label === "live" ? (
          <LivePill label="LIVE" onDark />
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
        style={[{ position: "absolute", right: 12, top: 10, fontSize: 10, lineHeight: 12, letterSpacing: 1.68, color: BROADCAST.dim62 }, TABULAR]}
      >
        OF {durationFormatted}
      </Text>
      <Text
        testID="live-timer"
        accessibilityRole="timer"
        accessibilityLabel={`${spokenDuration(seconds)} remaining`}
        className="font-mono-bold"
        style={[
          { fontSize: 88, lineHeight: 92, letterSpacing: -3.52, color: BROADCAST.inkDark, paddingTop: 10 },
          TABULAR,
        ]}
      >
        {formatted}
      </Text>
    </View>
  );
}
