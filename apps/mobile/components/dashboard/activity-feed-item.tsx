import { Text, View } from "react-native";
import { formatRelativeDate } from "@jits/shared/utils";

export interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  date: string;
}

/**
 * A single row in the dashboard's "Recent Activity, All" feed.
 * Styled with ELO tokens: surface-3 background (set by parent), mono caps
 * for the timestamp, body font for the sentence, positive accent on
 * submission text.
 */
export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const isDraw = item.result === "draw";
  return (
    <View className="px-4 py-3 gap-1">
      <Text className="font-body text-[13px] text-ink">
        <Text className="font-heading-medium text-ink">{item.winnerName}</Text>
        {isDraw ? " drew with " : " defeated "}
        <Text className="font-heading-medium text-ink">{item.loserName}</Text>
        {!isDraw && item.result ? (
          <Text>
            {" by "}
            <Text className="font-mono-medium text-positive">{item.result}</Text>
          </Text>
        ) : null}
      </Text>
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        {formatRelativeDate(item.date)}
      </Text>
    </View>
  );
}
