import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Chip, MetaTag } from "@/components/ui/elo-system";
import { MatchCard } from "../match-card";
import { ActivityFeedItem, type ActivityItem } from "./activity-feed-item";
import type { MatchOutcome } from "@jits/shared/constants";

export type { ActivityItem } from "./activity-feed-item";

interface MyMatch {
  id: string;
  opponentName: string;
  opponentPhotoUrl?: string | null;
  result: MatchOutcome;
  eloDelta: number;
  date: string;
}

type Scope = "me" | "all";

const scopeOptions: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Me" },
];

interface RecentActivitySectionProps {
  myMatches: MyMatch[];
  allActivity: ActivityItem[];
  onPressMatch?: (matchId: string) => void;
  onPressFindSession?: () => void;
}

function EmptyState({
  message,
  showLink,
  onPressLink,
}: {
  message: string;
  showLink?: boolean;
  onPressLink?: () => void;
}) {
  return (
    <View className="border border-dashed border-hairline-strong rounded-md p-6 items-center">
      <Text className="font-body text-[13px] text-ink-2 text-center">
        {message}
      </Text>
      {showLink ? (
        <Pressable onPress={onPressLink} accessibilityRole="button" hitSlop={6}>
          <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l mt-2">
            Find a session →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RecentActivitySection({
  myMatches,
  allActivity,
  onPressMatch,
  onPressFindSession,
}: RecentActivitySectionProps) {
  const router = useRouter();
  const [scope, setScope] = React.useState<Scope>("all");

  const hasContent = scope === "me" ? myMatches.length > 0 : allActivity.length > 0;

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between">
        <MetaTag>Recent Activity</MetaTag>
        {scope === "me" && myMatches.length > 0 ? (
          <Pressable
            onPress={() => router.push("/(app)/profile/stats")}
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
              View all
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row gap-2">
        {scopeOptions.map((o) => (
          <Chip
            key={o.value}
            active={scope === o.value}
            onPress={() => setScope(o.value)}
          >
            {o.label}
          </Chip>
        ))}
      </View>

      {scope === "me" ? (
        hasContent ? (
          <View className="gap-2">
            {myMatches.map((m) => (
              <MatchCard
                key={m.id}
                type="match"
                opponentName={m.opponentName}
                opponentPhotoUrl={m.opponentPhotoUrl}
                result={m.result}
                eloDelta={m.eloDelta}
                date={m.date}
                onPress={onPressMatch ? () => onPressMatch(m.id) : undefined}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            message="No matches yet, your first match is waiting."
            showLink
            onPressLink={onPressFindSession ?? (() => router.push("/(app)/gyms"))}
          />
        )
      ) : hasContent ? (
        <View className="bg-surface-3 border border-hairline rounded-md overflow-hidden">
          {allActivity.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 ? <View className="h-px bg-hairline-faint" /> : null}
              <ActivityFeedItem item={item} />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState message="No recent activity yet, join a session to get started." />
      )}
    </View>
  );
}
