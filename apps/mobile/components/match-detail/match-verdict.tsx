import * as React from "react";
import { Text, View } from "react-native";
import { TRACKING, typeStep } from "@/lib/typography";
import { formatClock } from "@jits/shared/utils";
import type { MatchDetailView } from "@jits/shared/api/queries";
import { usePalette, TABULAR, type Palette } from "@/lib/theme/palette";
import { deltaLabel, shortName, titleDate } from "@/lib/film-room/format";
import { humanizeAnalysisLabel, recordedEloDelta } from "@jits/shared/utils";

const VERDICT: Record<string, string> = { win: "YOU WON", loss: "YOU LOST", draw: "DRAW" };
/** Statuses whose result stands for nothing: muted chip, no rating change. */
const MUTED: Record<string, string> = { voided: "VOIDED", cancelled: "CANCELLED" };

/** "by Rear-naked choke · 06:17 · vs M. Park · Sep 27" */
export function verdictLine(view: MatchDetailView): string {
  const { match, opponent } = view;
  const parts: string[] = [];
  if (match.result === "submission") {
    parts.push(`by ${match.submission_name ?? "submission"}`);
    if (match.finish_time_seconds) parts.push(formatClock(match.finish_time_seconds));
  } else if (match.result && match.result !== "draw") {
    parts.push(`on ${humanizeAnalysisLabel(match.result)?.toLowerCase() ?? match.result}`);
  }
  if (opponent) parts.push(`vs ${shortName(opponent.display_name)}`);
  const when = titleDate(match.completed_at ?? match.started_at);
  if (when) parts.push(when);
  return parts.join(" · ");
}

function deltaColor(delta: number, p: Palette): string {
  if (delta > 0) return p.win;
  if (delta < 0) return p.red;
  return p.text2;
}

/**
 * YOU WON / YOU LOST / DRAW in Bebas, the rating change with its ▲/▼ prefix
 * and before → after on the right, and how it ended underneath. A disputed
 * result says so in amber. Every match is ranked; a legacy row with no
 * recorded rating change (elo_after NULL) shows no delta (never "casual").
 */
export function MatchVerdict({ view }: { view: MatchDetailView }) {
  const p = usePalette();
  const { match, me } = view;
  const muted = MUTED[match.status];
  const hasDelta = recordedEloDelta(me) != null;
  const verdict = (!muted && me.outcome && VERDICT[me.outcome]) || "NO RESULT";
  return (
    <View testID="match-result-header" style={{ gap: 8 }}>
      <View className="flex-row items-end justify-between" style={{ gap: 12 }}>
        <Text testID="match-verdict" className="font-display" style={[typeStep("display-52"), { lineHeight: 52, letterSpacing: TRACKING.loose, color: p.text }]}>
          {verdict}
        </Text>
        {muted ? (
          <Text className="font-body" style={[typeStep("small"), { color: p.text2, paddingBottom: 6 }]}>
            Rating unchanged
          </Text>
        ) : hasDelta ? (
          <View className="items-end" style={{ gap: 5, paddingBottom: 3 }}>
            <Text testID="match-elo-delta" className="font-mono-bold" style={[typeStep("title"), { color: deltaColor(me.elo_delta, p) }, TABULAR]}>
              {deltaLabel(me.elo_delta)}
            </Text>
            {me.elo_before != null && me.elo_after != null ? (
              <Text className="font-mono-medium" style={[typeStep("caption"), { letterSpacing: TRACKING.loose, color: p.text2 }, TABULAR]}>
                {me.elo_before} {"→"} {me.elo_after}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text testID="match-verdict-line" className="font-mono-medium uppercase" style={[typeStep("caption"), { lineHeight: 16, letterSpacing: TRACKING.caps, color: p.text2 }, TABULAR]}>
        {verdictLine(view)}
      </Text>
      {muted ? (
        <View testID="match-muted-badge" className="self-start" style={{ borderWidth: 1, borderColor: p.strong, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}>
            {muted}
          </Text>
        </View>
      ) : null}
      {match.status === "disputed" ? (
        <View testID="match-disputed-badge" className="self-start" style={{ borderWidth: 1, borderColor: p.amberRule, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.amber }, TABULAR]}>
            DISPUTED · UNDER REVIEW
          </Text>
        </View>
      ) : null}
    </View>
  );
}
