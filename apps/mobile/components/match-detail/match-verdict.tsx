import * as React from "react";
import { Text, View } from "react-native";
import { formatClock } from "@jits/shared/utils";
import type { MatchDetailView } from "@jits/shared/api/queries";
import { FILM, TABULAR } from "@/lib/film-room/film-palette";
import { deltaLabel, shortName, titleDate } from "@/lib/film-room/format";
import { humanizeAnalysisLabel } from "@jits/shared/utils";

const VERDICT: Record<string, string> = { win: "YOU WON", loss: "YOU LOST", draw: "DRAW" };

/** "by Rear-naked choke · 06:17 · vs M. Park · Ranked · Sep 27" */
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
  parts.push(match.match_type === "ranked" ? "Ranked" : "Casual");
  const when = titleDate(match.completed_at ?? match.started_at);
  if (when) parts.push(when);
  return parts.join(" · ");
}

function deltaColor(delta: number): string {
  if (delta > 0) return FILM.win;
  if (delta < 0) return FILM.redText;
  return FILM.text2;
}

/**
 * YOU WON / YOU LOST / DRAW in Bebas, the rating change with its ▲/▼ prefix
 * and before → after on the right, and how it ended underneath. A disputed
 * result says so in amber; casual matches read "Casual, unrated".
 */
export function MatchVerdict({ view }: { view: MatchDetailView }) {
  const { match, me } = view;
  const ranked = match.match_type === "ranked";
  const verdict = (me.outcome && VERDICT[me.outcome]) || "NO RESULT";
  return (
    <View testID="match-result-header" style={{ gap: 8 }}>
      <View className="flex-row items-end justify-between" style={{ gap: 12 }}>
        <Text testID="match-verdict" className="font-display" style={{ fontSize: 52, lineHeight: 52, letterSpacing: 0.8, color: FILM.text }}>
          {verdict}
        </Text>
        {ranked ? (
          <View className="items-end" style={{ gap: 5, paddingBottom: 3 }}>
            <Text testID="match-elo-delta" className="font-mono-bold" style={[{ fontSize: 18, color: deltaColor(me.elo_delta) }, TABULAR]}>
              {deltaLabel(me.elo_delta)}
            </Text>
            {me.elo_before != null && me.elo_after != null ? (
              <Text className="font-mono-medium" style={[{ fontSize: 11, letterSpacing: 0.56, color: FILM.text2 }, TABULAR]}>
                {me.elo_before} {"→"} {me.elo_after}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="font-body" style={{ fontSize: 12, color: FILM.text2, paddingBottom: 6 }}>
            Casual, unrated
          </Text>
        )}
      </View>
      <Text testID="match-verdict-line" className="font-mono-medium uppercase" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.8, color: FILM.text2 }}>
        {verdictLine(view)}
      </Text>
      {match.status === "disputed" ? (
        <View testID="match-disputed-badge" className="self-start" style={{ borderWidth: 1, borderColor: FILM.amberRule, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 1.68, color: FILM.amber }}>
            DISPUTED · UNDER REVIEW
          </Text>
        </View>
      ) : null}
    </View>
  );
}
