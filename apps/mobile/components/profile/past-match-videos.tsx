import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Play } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { matchDetailHref } from "@/lib/match-detail/href";
import type { MyMatchVideos } from "@/lib/profile/use-my-match-videos";
import { MetaTag, ParticipantRow } from "@/components/ui/elo-system";
import { formatRelativeDate } from "@jits/shared/utils";
import type { MatchVideoListItem } from "@jits/shared/api/queries";

/** Rows shown before "Show all". */
const COLLAPSED_COUNT = 5;

function subtitle(item: MatchVideoListItem): string {
  const parts: string[] = [formatRelativeDate(item.match_date ?? item.latest_video_at)];
  if (item.video_count > 1) parts.push(`${item.video_count} videos`);
  if (item.match_status === "disputed") parts.push("Disputed");
  if (item.playable_count === 0) parts.push("Processing");
  return parts.join(" · ");
}

/**
 * "Past Match Videos" on the Profile tab: one row per match (both angles
 * grouped, jits-7b7v), disputed matches and failed-status videos included.
 * A row opens the match detail screen, which explains each video's state.
 * Renders nothing while cold-loading or when there are no videos (an empty
 * plate reads as broken to a first-run user, jits-r75.7), but a failed load
 * shows a retry row rather than silently hiding the section.
 */
export function PastMatchVideos({ videos }: { videos: MyMatchVideos }) {
  const router = useRouter();
  const tokens = useThemedTokens();
  const [expanded, setExpanded] = React.useState(false);
  const { items, error, refetch } = videos;

  if (items.length === 0 && !error) return null;

  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <View className="gap-3">
      <MetaTag>Past Match Videos</MetaTag>
      {items.length === 0 ? (
        <Pressable
          testID="past-videos-error"
          onPress={refetch}
          accessibilityRole="button"
          className="bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3 active:bg-surface-4"
        >
          <Text className="font-body text-[12px] text-ink-3">Couldn't load your videos. Tap to retry.</Text>
        </Pressable>
      ) : (
        <View className="gap-[1px]">
          {shown.map((item) => {
            const name = item.opponent_name ?? "Opponent";
            return (
              <ParticipantRow
                key={item.match_id}
                testID={`past-video-row-${item.match_id}`}
                name={`vs ${name}`}
                subtitle={subtitle(item)}
                onPress={() => router.push(matchDetailHref(item.match_id))}
                accessibilityLabel={`Open match video vs ${name}`}
                action={<Play size={16} color={tokens.textSecondary} />}
              />
            );
          })}
        </View>
      )}
      {items.length > COLLAPSED_COUNT ? (
        <Pressable
          testID="past-videos-toggle"
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          className="self-start active:opacity-70"
        >
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
            {expanded ? "Show fewer" : `Show all (${items.length})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
