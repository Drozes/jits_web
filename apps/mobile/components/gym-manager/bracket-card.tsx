/**
 * H10 · One ELO-bracket card in the gym stats drill-down. Renders the bracket
 * range + tier label, athlete/match counts, a six-cell stat grid (avg ELO,
 * momentum, sub rate, draw rate, avg win/loss time) and the top winning/losing
 * submissions. Layout only; numeric values use font-mono tabular-nums.
 */
import { Text, View } from "react-native";
import {
  formatBracketRange,
  formatFinishTime,
  formatMomentum,
  formatPct,
  formatTierLabel,
} from "@/lib/gym-manager/stats-format";
import type { GymEloBracketStats } from "@jits/shared/types/gym-portal";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

interface StatCellProps {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}

function StatCell({ label, value, tone = "default" }: StatCellProps) {
  const toneClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-negative"
        : "text-ink";
  return (
    <View className="w-1/3 mb-3">
      <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
        {label}
      </Text>
      <Text
        className={`font-mono-bold text-[15px] leading-tight mt-[2px] ${toneClass}`}
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}

export function BracketCard({ bracket }: { bracket: GymEloBracketStats }) {
  const momentumTone =
    bracket.momentum > 0 ? "positive" : bracket.momentum < 0 ? "negative" : "default";
  const tier = formatTierLabel(bracket.bracket);

  return (
    <View className="bg-surface-3 border border-hairline rounded-md p-4">
      <View className="flex-row items-start justify-between mb-3">
        <View>
          <Text className="font-mono-bold text-[18px] text-ink" style={TABULAR}>
            {formatBracketRange(bracket.bracket)}
          </Text>
          {tier ? (
            <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-[2px]">
              {tier}
            </Text>
          ) : null}
        </View>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l text-right max-w-[45%]">
          {bracket.athleteCount} ATHLETE{bracket.athleteCount === 1 ? "" : "S"} ·{" "}
          {bracket.matchCount} MATCHES
        </Text>
      </View>

      <View className="flex-row flex-wrap">
        <StatCell label="Avg ELO" value={String(bracket.avgElo)} />
        <StatCell
          label="Momentum"
          value={formatMomentum(bracket.momentum)}
          tone={momentumTone}
        />
        <StatCell label="Sub Rate" value={formatPct(bracket.submissionRate)} />
        <StatCell label="Draw Rate" value={formatPct(bracket.drawRate)} />
        <StatCell
          label="Avg Win Time"
          value={formatFinishTime(bracket.avgWinTime)}
          tone="positive"
        />
        <StatCell
          label="Avg Loss Time"
          value={formatFinishTime(bracket.avgLossTime)}
          tone="negative"
        />
      </View>

      <View className="flex-row gap-3 pt-3 border-t border-hairline-faint">
        <View className="flex-1">
          <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
            Top Winning Sub
          </Text>
          <Text className="font-heading text-[12px] text-ink mt-[2px]" numberOfLines={1}>
            {bracket.topWinningSub ?? "—"}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
            Top Losing Sub
          </Text>
          <Text className="font-heading text-[12px] text-ink mt-[2px]" numberOfLines={1}>
            {bracket.topLosingSub ?? "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}
