/**
 * Presentational sub-components for the gym-owner athlete detail (H7).
 *
 * Layout only: the parent (gym-manager/athlete/[id].tsx) loads data via
 * useGymAthleteDetail and wires navigation. All numeric values use font-mono
 * tabular-nums per the brand rule; no decorative color, no drop shadows.
 */
import { Text, View } from "react-native";
import { Avatar32, DeltaNumber } from "@/components/ui/elo-system";
import { formatFinish } from "@/lib/gym-manager/roster-format";
import type { GymAthleteRecentMatch } from "@jits/shared/types/gym-portal";

/** Mono-caps tertiary section heading (wireframe `.section-label`). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
      {children}
    </Text>
  );
}

interface DetailHeaderProps {
  name: string;
  gymName: string | null;
}

/** Centered avatar + name + gym caps line (wireframe H7 hero block). */
export function DetailHeader({ name, gymName }: DetailHeaderProps) {
  return (
    <View className="items-center">
      <Avatar32 name={name} className="w-20 h-20 rounded-md mb-3" />
      <Text className="font-heading text-[20px] text-ink text-center" numberOfLines={2}>
        {name}
      </Text>
      {gymName ? (
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-1">
          {gymName}
        </Text>
      ) : null}
    </View>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  /** Smaller value type for long values like the W/L/D record. */
  compact?: boolean;
}

/** Caps-label + mono number tile (wireframe `.metric-tile`). */
export function StatTile({ label, value, compact }: StatTileProps) {
  return (
    <View className="w-[48%] bg-surface-3 border border-hairline rounded-md px-4 py-3 min-h-[72px] justify-center gap-1">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className={`font-mono-bold text-ink leading-none ${compact ? "text-[15px]" : "text-[26px]"}`}
        style={{ fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** Two-column wrapping grid for the four stat tiles. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">{children}</View>
  );
}

/**
 * One row in "Match History · Last 5": opponent + finish sub-label on the left,
 * ELO delta (signed, color-coded) on the right. Draws still show a delta
 * (Pressure Score), so we always render the delta when it is non-zero.
 */
export function RecentMatchRow({ match }: { match: GymAthleteRecentMatch }) {
  return (
    <View className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3">
      <View className="flex-1 min-w-0">
        <Text className="font-heading text-[12px] text-ink" numberOfLines={1}>
          vs {match.opponent_name}
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-[2px]">
          {formatFinish(match)}
        </Text>
      </View>
      <DeltaNumber value={match.elo_delta} size="m" showSign />
    </View>
  );
}
