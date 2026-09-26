import * as React from "react";
import { Text, View } from "react-native";
import { MetaTag } from "@/components/ui/elo-system";
import { formatRelativeDate, formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailView } from "@jits/shared/api/queries";

const RESULT_LABEL: Record<string, string> = {
  submission: "Submission",
  draw: "Draw",
};

/**
 * `matches.duration_seconds` is the configured clock, not elapsed time, so it
 * reads as a round length: "10 MIN ROUND", or "3:05 ROUND" off the minute.
 */
export function formatRoundLength(seconds: number | null | undefined): string | null {
  const clock = formatVideoDuration(seconds);
  if (!clock) return null;
  const [min, sec] = clock.split(":");
  return sec === "00" ? `${min} MIN ROUND` : `${clock} ROUND`;
}

/** Date, RANKED / CASUAL, round length and how it ended. */
export function MatchMetaRow({ match }: { match: MatchDetailView["match"] }) {
  const when = match.completed_at ?? match.started_at;
  const duration = formatRoundLength(match.duration_seconds);
  const result = match.result ? RESULT_LABEL[match.result] : undefined;

  return (
    <View testID="match-meta-row" className="flex-row flex-wrap items-center gap-2">
      {when ? (
        <Text className="font-mono text-[12px] text-ink-3 tabular-nums">
          {formatRelativeDate(when)}
        </Text>
      ) : null}
      <MetaTag>{match.match_type === "ranked" ? "RANKED" : "CASUAL"}</MetaTag>
      {duration ? (
        <Text
          testID="match-round-length"
          className="font-mono text-[12px] text-ink-3 uppercase tabular-nums"
        >
          {duration}
        </Text>
      ) : null}
      {result ? (
        <Text className="font-body text-[12px] text-ink-3">{result}</Text>
      ) : null}
    </View>
  );
}
