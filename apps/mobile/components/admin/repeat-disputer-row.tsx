import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatRelativeDate } from "@jits/shared/utils";
import type { RepeatDisputerRow } from "@jits/shared/api/queries";
import { Plate } from "@/components/ui/elo-system";

/** "{lost} LOST / {total} DISPUTED · 30D", the row's count line. */
export function disputeCountsLabel(row: Pick<RepeatDisputerRow, "lost_disputes_30d" | "total_disputes_30d">): string {
  return `${row.lost_disputes_30d} LOST / ${row.total_disputes_30d} DISPUTED · 30D`;
}

/**
 * One flagged athlete: name (opens their profile), lost/total dispute counts
 * over 30 days, when they last lost one, and the short id of each lost match.
 * Read only; flagging sanctions nothing.
 *
 * The lost matches are info-only rows, not links: match detail
 * (get_match_details / getMatchDetailView) is participant-only with no admin
 * bypass, so a link would always land an admin on "You can't view this
 * match". Turn them back into links once an admin match read path ships.
 */
export function RepeatDisputerRowCard({ row }: { row: RepeatDisputerRow }) {
  const router = useRouter();
  const name = row.display_name ?? "Unknown athlete";
  return (
    <Plate testID={`disputer-row-${row.athlete_id}`} className="gap-2">
      <Pressable
        testID={`disputer-athlete-${row.athlete_id}`}
        accessibilityRole="link"
        accessibilityLabel={`Open ${name}'s profile`}
        onPress={() => router.push(`/(app)/athlete/${row.athlete_id}`)}
        className="flex-row items-center justify-between min-h-11 active:opacity-70"
      >
        <Text numberOfLines={1} className="font-heading text-[14px] text-ink flex-1 pr-3">
          {name}
        </Text>
        <Text className="font-mono text-[14px] text-ink-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {"›"}
        </Text>
      </Pressable>
      <View className="flex-row items-center justify-between">
        <Text testID="disputer-counts" className="font-mono tabular-nums text-[10px] text-ink-2 uppercase tracking-caps-l">
          {disputeCountsLabel(row)}
        </Text>
        {row.last_lost_at ? (
          <Text testID="disputer-last-lost" className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
            {`Last lost ${formatRelativeDate(row.last_lost_at)}`}
          </Text>
        ) : null}
      </View>
      {row.lost_match_ids.length > 0 ? (
        <View className="gap-1">
          {row.lost_match_ids.map((matchId, idx) => (
            <View
              key={matchId}
              testID={`disputer-match-${matchId}`}
              accessibilityLabel={`Lost dispute ${idx + 1}, match ${matchId.slice(0, 8)}`}
              className="flex-row items-center min-h-8 px-3 rounded-md border border-hairline"
            >
              <Text numberOfLines={1} className="font-mono text-[11px] text-ink-2 flex-1">
                {`Lost dispute · match ${matchId.slice(0, 8)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Plate>
  );
}
