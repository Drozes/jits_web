import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Activity } from "lucide-react-native";
import { Card } from "../ui/card";
import { MatchCard } from "../match-card";
import {
  ActivityFeedItem,
  type ActivityItem,
  FilterPill,
  EmptyState,
} from "./activity-feed-item";
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
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Activity size={16} className="text-primary" />
          </View>
          <Text className="text-lg font-heading text-foreground">Recent Activity</Text>
        </View>
        {scope === "me" && myMatches.length > 0 ? (
          <Pressable onPress={() => router.push("/(app)/profile/stats")}>
            <Text className="text-xs font-medium text-muted-foreground">View all</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row gap-1">
        {scopeOptions.map((o) => (
          <FilterPill key={o.value} value={o.value} label={o.label} active={scope === o.value} onSelect={setScope} />
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
            message="No matches yet. Join a session to get started!"
            showLink
            onPressLink={onPressFindSession ?? (() => router.push("/(app)/gyms"))}
          />
        )
      ) : hasContent ? (
        <Card>
          {allActivity.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 ? <View className="h-px bg-border" /> : null}
              <ActivityFeedItem item={item} />
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState message="No recent activity yet. Join a session to get started!" />
      )}
    </View>
  );
}
