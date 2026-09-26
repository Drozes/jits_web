import * as React from "react";
import { Text, View } from "react-native";
import { MetaTag } from "@/components/ui/elo-system";
import { formatRelativeDate, formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailView } from "@jits/shared/api/queries";

const RESULT_LABEL: Record<string, string> = {
  submission: "Submission",
  draw: "Draw",
};

/** Date, RANKED / CASUAL, match length and how it ended. */
export function MatchMetaRow({ match }: { match: MatchDetailView["match"] }) {
  const when = match.completed_at ?? match.started_at;
  const duration = formatVideoDuration(match.duration_seconds);
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
        <Text className="font-mono text-[12px] text-ink-3 tabular-nums">
          {duration}
        </Text>
      ) : null}
      {result ? (
        <Text className="font-body text-[12px] text-ink-3">{result}</Text>
      ) : null}
    </View>
  );
}
