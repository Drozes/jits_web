import { Text, View } from "react-native";
import { LivePill } from "@/components/ui/elo-system";
import { useAmber } from "@/components/match-detail/use-amber";
import { cn } from "@/lib/cn";

interface TimerDisplayProps {
  formatted: string;
  remaining: number;
  paused: boolean;
  matchType: "ranked" | "casual";
  /** Opponent's display name for the caption ("RANKED · VS DEMO RED"). */
  opponentName?: string | null;
  /** Replaces the Ranked / Casual word in the caption (practice says "Practice"). */
  kindLabel?: string;
}

/** Pressure state caption; amber is behind a hook, so it mounts only when shown. */
function AmberCaption({ testID, children }: { testID: string; children: string }) {
  const amber = useAmber();
  return (
    <Text
      testID={testID}
      className={cn("font-mono-bold text-[10px] uppercase tracking-caps-l", amber.text)}
    >
      {children}
    </Text>
  );
}

/**
 * Big timer + match-type meta + paused indicator. Used by the
 * timekeeper-style live view (D7 wireframe lines 1213-1238): hero
 * mono numeric timer, LivePill, and ranked / casual meta tag below.
 *
 * Color rule: the numeral is always primary ink, it is data. Pause and
 * time-up are pressure, not losses, so their captions are amber, never
 * Signal Red (jits-4zp.2).
 */
export function TimerDisplay({
  formatted,
  remaining,
  paused,
  matchType,
  opponentName,
  kindLabel,
}: TimerDisplayProps) {
  const kind = kindLabel ?? (matchType === "ranked" ? "Ranked" : "Casual");
  const name = opponentName?.trim();
  return (
    <View className="items-center gap-3">
      <LivePill label="LIVE" />
      <Text
        testID="live-timer"
        className="font-mono-bold tabular-nums text-ink"
        style={{
          fontSize: 72,
          lineHeight: 86,
          letterSpacing: -72 * 0.04,
        }}
      >
        {formatted}
      </Text>
      <Text
        className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl text-center"
        numberOfLines={1}
      >
        {name ? `${kind} · vs ${name}` : `${kind} Match`}
      </Text>
      {paused ? (
        <AmberCaption testID="live-paused">Paused</AmberCaption>
      ) : remaining === 0 ? (
        <AmberCaption testID="live-time-up">Time</AmberCaption>
      ) : null}
    </View>
  );
}
