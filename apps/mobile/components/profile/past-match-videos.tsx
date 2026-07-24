import { View } from "react-native";
import { useRouter } from "expo-router";
import { Play } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAthleteVideos } from "@/lib/profile/use-athlete-videos";
import { MetaTag, ParticipantRow } from "@/components/ui/elo-system";
import { formatRelativeDate } from "@jits/shared/utils";
import type { AthleteVideoRow } from "@jits/shared/api/queries";

function subtitle(v: AthleteVideoRow): string {
  const parts: string[] = [];
  if (v.match_date) parts.push(formatRelativeDate(v.match_date));
  if (v.duration_seconds != null && v.duration_seconds > 0) {
    const m = Math.floor(v.duration_seconds / 60);
    const s = Math.round(v.duration_seconds % 60)
      .toString()
      .padStart(2, "0");
    parts.push(`${m}:${s}`);
  }
  if (v.has_analysis) parts.push("Analyzed");
  return parts.join(" · ");
}

/**
 * "Past Match Videos" section on the Profile tab. Renders nothing until the
 * athlete has at least one recorded video: an empty plate here would read as
 * a broken surface to a first-run user (jits-r75.7 concern).
 */
export function PastMatchVideos({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { videos } = useAthleteVideos(athleteId);

  if (videos.length === 0) return null;

  return (
    <View className="gap-3">
      <MetaTag>Past Match Videos</MetaTag>
      <View className="gap-[1px]">
        {videos.map((v) => (
          <ParticipantRow
            key={v.video_id}
            name={`vs ${v.opponent_name ?? "Opponent"}`}
            subtitle={subtitle(v)}
            onPress={() => router.push(`/(app)/video/${v.video_id}`)}
            accessibilityLabel={`Play match video vs ${v.opponent_name ?? "opponent"}`}
            action={<Play size={16} color={tokens.textSecondary} />}
          />
        ))}
      </View>
    </View>
  );
}
