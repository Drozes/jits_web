/**
 * Presentational sub-components for the gym-owner stats screens (H8 gym stats +
 * H10 per-ELO bracket drill-down).
 *
 * Layout only: the parent screens load data via useGymStats / useGymBracketStats
 * and own navigation. All numeric values use font-mono tabular-nums per the
 * brand rule; Signal Red only for CTAs/negative, no drop shadows, 4px radius.
 */
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { DeltaNumber } from "@/components/ui/elo-system";
import { Chip } from "@/components/ui/elo-system";
import {
  formatElo,
  formatFinishTime,
  formatPct,
  formatRangeLabel,
} from "@/lib/gym-manager/stats-format";
import type { GymStatsRange } from "@jits/shared/api/queries";
import type { GymSubmissionStat } from "@jits/shared/types/gym-portal";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Mono-caps tertiary section heading (wireframe `.section-label`). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl mb-2">
      {children}
    </Text>
  );
}

interface RangeChipsProps {
  value: GymStatsRange;
  onChange: (range: GymStatsRange) => void;
}

/** 30d / 90d / all time filter row (wireframe `.chips`). */
export function RangeChips({ value, onChange }: RangeChipsProps) {
  const ranges: GymStatsRange[] = ["30d", "90d", "all"];
  return (
    <View className="flex-row gap-2 mb-4">
      {ranges.map((r) => (
        <Chip key={r} active={value === r} onPress={() => onChange(r)}>
          {formatRangeLabel(r)}
        </Chip>
      ))}
    </View>
  );
}

interface DrillDownTileProps {
  label: string;
  onPress: () => void;
}

/** Full-width row tile that navigates into the H10 bracket drill-down. */
export function DrillDownTile({ label, onPress }: DrillDownTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between bg-surface-3 border border-hairline rounded-md px-4 min-h-[56px] active:opacity-70 mb-5"
    >
      <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
        {label}
      </Text>
      <ChevronRight size={18} color="#6B7280" />
    </Pressable>
  );
}

interface StatHeroProps {
  label: string;
  value: number;
  /** Signed momentum delta shown beneath the value. */
  momentum: number;
  caption: string;
}

/** Big centered headline stat with a momentum footnote (wireframe `.stat-hero`). */
export function StatHero({ label, value, momentum, caption }: StatHeroProps) {
  return (
    <View className="bg-surface-3 border border-hairline rounded-md px-4 py-6 items-center mb-5">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className="font-mono-bold text-ink text-[44px] leading-none mt-2"
        style={TABULAR}
      >
        {formatElo(value)}
      </Text>
      <View className="flex-row items-center gap-2 mt-3">
        <DeltaNumber value={Math.round(momentum)} size="s" showSign />
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {caption}
        </Text>
      </View>
    </View>
  );
}

interface RatePlateProps {
  /** Big primary number (already formatted, e.g. "78%" or "32"). */
  headline: string;
  headlineSub: string;
  /** Right-aligned secondary number + caption. */
  asideValue: string;
  asideLabel: string;
  /**
   * Primary number color. "accent" is a neutral aggregate (submission rate) and
   * renders in default foreground per the brand rule (Signal Red is reserved for
   * CTAs/negative); "negative" is the sanctioned state-negative draw tile.
   */
  tone: "accent" | "negative";
  children?: React.ReactNode;
}

/**
 * Rate plate used for both Submission Rate and Draws (wireframe `.plate`): a big
 * headline number with a sub-label, an aligned secondary stat on the right, and
 * optional content below (split meter / draw trend rows).
 */
export function RatePlate({
  headline,
  headlineSub,
  asideValue,
  asideLabel,
  tone,
  children,
}: RatePlateProps) {
  const toneClass = tone === "accent" ? "text-ink" : "text-negative";
  return (
    <View className="bg-surface-3 border border-hairline rounded-md p-4 mb-5">
      <View className="flex-row items-baseline justify-between mb-3">
        <View className="flex-1">
          <Text
            className={`font-mono-bold text-[36px] leading-none ${toneClass}`}
            style={TABULAR}
          >
            {headline}
          </Text>
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-1">
            {headlineSub}
          </Text>
        </View>
        <View className="items-end">
          <Text
            className="font-mono text-[18px] text-ink-2 leading-none"
            style={TABULAR}
          >
            {asideValue}
          </Text>
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-1">
            {asideLabel}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

interface SplitMeterProps {
  /** 0..1 fraction filled by the accent (submission) segment. */
  fraction: number;
  leftLabel: string;
  rightLabel: string;
}

/** Two-segment proportional bar + legend (wireframe `.split-meter`). */
export function SplitMeter({ fraction, leftLabel, rightLabel }: SplitMeterProps) {
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View>
      <View className="flex-row h-2 rounded-xs overflow-hidden mb-2">
        <View className="bg-cta" style={{ flex: pct }} />
        <View className="bg-surface-4" style={{ flex: 1 - pct }} />
      </View>
      <View className="flex-row justify-between">
        <Text className="font-mono text-[10px] text-primary uppercase tracking-caps-l">
          ■ {leftLabel}
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          ■ {rightLabel}
        </Text>
      </View>
    </View>
  );
}

interface SubRankListProps {
  subs: GymSubmissionStat[];
  /** "winning" uses default foreground for the share; "losing" stays muted. */
  variant: "winning" | "losing";
}

/** Ranked submission list (wireframe `.sub-rank-list`). */
export function SubRankList({ subs, variant }: SubRankListProps) {
  if (subs.length === 0) {
    return (
      <View className="bg-surface-3 border border-hairline rounded-md px-4 py-6 items-center mb-5">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
          No Submissions Yet
        </Text>
      </View>
    );
  }
  // Both variants render the % as a neutral data value (default/secondary
  // foreground), never Signal Red, per the brand rule for numeric data.
  const pctClass = variant === "winning" ? "text-ink" : "text-ink-2";
  return (
    <View className="gap-[1px] mb-5">
      {subs.map((s, i) => (
        <View
          key={`${s.name}-${i}`}
          className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3"
        >
          <Text
            className="font-mono-bold text-[11px] text-ink-3 w-6"
            style={TABULAR}
          >
            {String(i + 1).padStart(2, "0")}
          </Text>
          <Text className="font-heading text-[12px] text-ink flex-1" numberOfLines={1}>
            {s.name}
          </Text>
          <Text className={`font-mono-bold text-[13px] ${pctClass}`} style={TABULAR}>
            {formatPct(s.pct)}
          </Text>
          <Text
            className="font-mono text-[11px] text-ink-3 w-8 text-right"
            style={TABULAR}
          >
            {s.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface DurationGridProps {
  avgWinTime: number;
  avgLossTime: number;
}

/** Two-tile avg win/loss finish-time grid (wireframe `.metric-grid`). */
export function DurationGrid({ avgWinTime, avgLossTime }: DurationGridProps) {
  return (
    <View className="flex-row gap-3 mb-5">
      <DurationTile
        label="Avg Win Time"
        value={formatFinishTime(avgWinTime)}
        tone="positive"
      />
      <DurationTile
        label="Avg Loss Time"
        value={formatFinishTime(avgLossTime)}
        tone="negative"
      />
    </View>
  );
}

function DurationTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-success" : "text-negative";
  return (
    <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-4 py-3 min-h-[72px] justify-center gap-1">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className={`font-mono-bold text-[26px] leading-none ${toneClass}`}
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}
