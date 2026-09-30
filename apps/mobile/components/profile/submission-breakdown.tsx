import { ActivityIndicator, Text, View } from "react-native";
import type { SubmissionOutcome, SubmissionOutcomeCount } from "@jits/shared/types/analytics";
import { Chip, Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface SubmissionBreakdownSectionProps {
  /**
   * get_submission_breakdown rows for exactly the selected window and
   * `outcome`, count DESC; null while that result is still loading (the
   * caller must never pass rows fetched for a different outcome or window).
   */
  submissions: SubmissionOutcomeCount[] | null;
  outcome: SubmissionOutcome;
  onOutcomeChange: (outcome: SubmissionOutcome) => void;
  /** The load for the selected window and outcome failed. */
  error?: boolean;
}

const OUTCOMES: { value: SubmissionOutcome; label: string }[] = [
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
];

/**
 * Top Submissions (P-Profile-Stats): the five most frequent submissions the
 * athlete won with, or lost to, in the selected window. The Wins / Losses
 * toggle picks which side get_submission_breakdown counts.
 */
export function SubmissionBreakdownSection({
  submissions,
  outcome,
  onOutcomeChange,
  error = false,
}: SubmissionBreakdownSectionProps) {
  const tokens = useThemedTokens();
  const top5 = (submissions ?? []).slice(0, 5);
  const maxCount = Math.max(1, ...top5.map((s) => s.count));
  const suffix = outcome === "wins" ? "W" : "L";

  return (
    <Plate>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
          Top Submissions
        </Text>
        <View className="flex-row gap-2" accessibilityLabel="Submission view">
          {OUTCOMES.map((o) => (
            <Chip
              key={o.value}
              active={outcome === o.value}
              onPress={() => onOutcomeChange(o.value)}
              accessibilityLabel={`Show submission ${o.value}`}
            >
              {o.label}
            </Chip>
          ))}
        </View>
      </View>

      {error ? (
        <Text className="font-mono text-[10px] text-negative uppercase tracking-caps-l">
          Could not load submissions. Pull to refresh.
        </Text>
      ) : submissions === null ? (
        <View testID="submissions-loading" className="py-3 items-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      ) : top5.length === 0 ? (
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {outcome === "wins" ? "No submission wins yet" : "No submission losses yet"}
        </Text>
      ) : (
        <View className="gap-3">
          {top5.map((s) => {
            const pct = Math.round((s.count / maxCount) * 100);
            return (
              <View key={s.code || s.name} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-body text-[12px] text-ink" numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text
                    className={`font-mono-bold text-[11px] tabular-nums ${
                      outcome === "wins" ? "text-positive" : "text-negative"
                    }`}
                  >
                    {`${s.count}${suffix}`}
                  </Text>
                </View>
                <View className="h-1.5 rounded-xs bg-surface-4 overflow-hidden">
                  <View className="h-full bg-cta" style={{ width: `${pct}%` }} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Plate>
  );
}
