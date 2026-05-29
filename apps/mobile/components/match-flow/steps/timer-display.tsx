import { Text, View } from "react-native";
import { LivePill } from "@/components/ui/elo-system";
import { cn } from "@/lib/cn";

interface TimerDisplayProps {
  formatted: string;
  remaining: number;
  paused: boolean;
  matchType: "ranked" | "casual";
}

/**
 * Big timer + match-type meta + paused indicator. Used by the
 * timekeeper-style live view (D7 wireframe lines 1213-1238): hero
 * mono numeric timer, LivePill, and ranked / casual meta tag below.
 *
 * Color rule: signal-red (negative) when remaining hits 0, otherwise
 * primary ink so the numeric reads as data, not a warning.
 */
export function TimerDisplay({ formatted, remaining, paused, matchType }: TimerDisplayProps) {
  return (
    <View className="items-center gap-3">
      <LivePill label="LIVE" />
      <Text
        className={cn(
          "font-mono-bold tabular-nums",
          remaining === 0 ? "text-negative" : "text-ink",
        )}
        style={{
          fontSize: 72,
          lineHeight: 72,
          letterSpacing: -72 * 0.04,
        }}
      >
        {formatted}
      </Text>
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {matchType === "ranked" ? "Ranked Match" : "Casual Match"}
      </Text>
      {paused ? (
        <Text className="font-mono-bold text-[10px] text-negative uppercase tracking-caps-l">
          Paused
        </Text>
      ) : null}
    </View>
  );
}
