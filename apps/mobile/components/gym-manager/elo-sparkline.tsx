import { Text, View } from "react-native";
import type { GymAthleteEloPoint } from "@jits/shared/types/gym-portal";

interface EloSparklineProps {
  /** Last-10 ranked ELO points, oldest -> newest (BE order). */
  points: GymAthleteEloPoint[];
}

const HEIGHT = 48;
const MIN_BAR = 3;

/**
 * H7 · "ELO Trend · Last 10" sparkline. react-native-svg is not a dependency,
 * so this renders a column chart from each point's `rating_after`, scaled into
 * a 48pt band: the newest column is Signal Red (the wireframe's accent dot), the
 * rest are hairline-strong. Bars are evenly spaced via flex; the band collapses
 * to an em-dash when there is no ranked history.
 */
export function EloSparkline({ points }: EloSparklineProps) {
  if (points.length === 0) {
    return (
      <View className="items-center justify-center" style={{ height: HEIGHT }}>
        <Text className="font-mono text-[12px] text-ink-3">—</Text>
      </View>
    );
  }

  const ratings = points.map((p) => p.rating_after);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = max - min || 1;

  return (
    <View className="flex-row items-end gap-1" style={{ height: HEIGHT }}>
      {points.map((p, i) => {
        const frac = (p.rating_after - min) / span;
        const height = MIN_BAR + frac * (HEIGHT - MIN_BAR);
        const isLast = i === points.length - 1;
        return (
          <View
            key={`${p.created_at}-${i}`}
            className={`flex-1 rounded-xs ${isLast ? "bg-cta" : "bg-surface-4"}`}
            style={{ height }}
          />
        );
      })}
    </View>
  );
}
