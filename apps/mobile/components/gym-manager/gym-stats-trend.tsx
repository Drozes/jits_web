import { Text, View } from "react-native";
import type { GymEloTrendPoint } from "@jits/shared/types/gym-portal";

interface GymStatsTrendProps {
  /** Daily net gym-wide ELO change, oldest -> newest (BE order). */
  points: GymEloTrendPoint[];
}

const HEIGHT = 48;
const MIN_BAR = 3;

/**
 * H8 · "ELO Trend" sparkline. react-native-svg is not a dependency, so this
 * renders a column chart of the running cumulative net ELO change (each day's
 * `net_delta` summed left-to-right), scaled into a 48pt band: the newest column
 * is Signal Red (the wireframe accent dot), the rest hairline-strong. The band
 * collapses to an em-dash when there is no trend data in the window.
 */
export function GymStatsTrend({ points }: GymStatsTrendProps) {
  if (points.length === 0) {
    return (
      <View className="items-center justify-center" style={{ height: HEIGHT }}>
        <Text className="font-mono text-[12px] text-ink-3">—</Text>
      </View>
    );
  }

  // Build the cumulative line from daily net deltas.
  let running = 0;
  const cumulative = points.map((p) => (running += p.net_delta));
  const min = Math.min(0, ...cumulative);
  const max = Math.max(0, ...cumulative);
  const span = max - min || 1;

  return (
    <View className="flex-row items-end gap-1" style={{ height: HEIGHT }}>
      {cumulative.map((v, i) => {
        const frac = (v - min) / span;
        const height = MIN_BAR + frac * (HEIGHT - MIN_BAR);
        const isLast = i === cumulative.length - 1;
        return (
          <View
            key={`${points[i].day}-${i}`}
            className={`flex-1 rounded-xs ${isLast ? "bg-cta" : "bg-surface-4"}`}
            style={{ height }}
          />
        );
      })}
    </View>
  );
}
