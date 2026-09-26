import * as React from "react";
import { Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { cn } from "@/lib/cn";
import type { MatchDetailView } from "@jits/shared/api/queries";
import { MatchMetaRow } from "./match-meta-row";
import { MatchStatusBadge } from "./match-status-badge";

const VERDICT: Record<string, { text: string; className: string }> = {
  win: { text: "WIN", className: "text-ink" },
  loss: { text: "LOSS", className: "text-negative" },
  draw: { text: "DRAW", className: "text-amber-500" },
};
const NO_RESULT = { text: "NO RESULT", className: "text-ink-3" };

/**
 * Delta color: Gain Green only for an increase, Signal Red for a decrease,
 * amber on a draw (draws always cost ELO, the Pressure Score rule).
 */
function deltaClass(delta: number, outcome: string | null): string {
  if (outcome === "draw") return "text-amber-500";
  if (delta > 0) return "text-positive";
  if (delta < 0) return "text-negative";
  return "text-ink-3";
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Result plate: verdict, rating change (or casual copy), status, meta. */
export function MatchResultHeader({ view }: { view: MatchDetailView }) {
  const { match, me } = view;
  const verdict = (me.outcome && VERDICT[me.outcome]) || NO_RESULT;
  const ranked = match.match_type === "ranked";

  return (
    <Plate testID="match-result-header" className="gap-3">
      <View className="flex-row items-end justify-between gap-3">
        <Text
          testID="match-verdict"
          className={cn("font-display text-[40px] tracking-mark", verdict.className)}
        >
          {verdict.text}
        </Text>
        {ranked ? (
          <View className="items-end">
            <Text
              testID="match-elo-delta"
              className={cn(
                "font-mono-bold text-[24px] tabular-nums",
                deltaClass(me.elo_delta, me.outcome),
              )}
            >
              {signed(me.elo_delta)}
            </Text>
            {me.elo_before != null && me.elo_after != null ? (
              <Text className="font-mono text-[12px] text-ink-3 tabular-nums">
                {me.elo_before} {"→"} {me.elo_after}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="font-body text-[12px] text-ink-3">
            Casual, unrated
          </Text>
        )}
      </View>
      <MatchStatusBadge status={match.status} />
      <MatchMetaRow match={match} />
    </Plate>
  );
}
