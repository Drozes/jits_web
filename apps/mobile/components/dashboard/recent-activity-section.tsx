import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Activity, Swords } from "lucide-react-native";
import { Card } from "../ui/card";
import { MatchCard } from "../match-card";
import { cn } from "../../lib/cn";
import { formatRelativeDate } from "@jits/shared/utils";
import type { MatchOutcome } from "@jits/shared/constants";

interface MyMatch {
  id: string;
  opponentName: string;
  opponentPhotoUrl?: string | null;
  result: MatchOutcome;
  eloDelta: number;
  date: string;
}

interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  date: string;
}

type Scope = "me" | "all";

const scopeOptions: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Me" },
];

function FilterPill<T extends string>({ value, label, active, onSelect }: { value: T; label: string; active: boolean; onSelect: (v: T) => void }) {
  return (
    <Pressable
      onPress={() => onSelect(value)}
      className={cn(
        "rounded-full px-3.5 py-1.5",
        active ? "bg-primary" : "bg-muted",
      )}
      accessibilityRole="button"
    >
      <Text className={cn("text-xs font-medium", active ? "text-primary-foreground" : "text-muted-foreground")}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ message, showLink, onPressLink }: { message: string; showLink?: boolean; onPressLink?: () => void }) {
  return (
    <View className="rounded-2xl border border-dashed border-border p-8 items-center">
      <Text className="text-sm text-muted-foreground text-center">{message}</Text>
      {showLink ? (
        <Pressable onPress={onPressLink} className="mt-2">
          <Text className="text-xs font-medium text-primary">Find a session</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const isDraw = item.result === "draw";
  return (
    <View className="flex-row items-start gap-3 p-4">
      <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
        <Swords size={16} className="text-primary" />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-foreground">
          <Text className="font-medium">{item.winnerName}</Text>
          {isDraw ? " drew with " : " defeated "}
          <Text className="font-medium">{item.loserName}</Text>
          {!isDraw && item.result ? (
            <Text>
              {" by "}
              <Text className="font-medium text-success">{item.result}</Text>
            </Text>
          ) : null}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {formatRelativeDate(item.date)}
        </Text>
      </View>
    </View>
  );
}

interface RecentActivitySectionProps {
  myMatches: MyMatch[];
  allActivity: ActivityItem[];
  onPressMatch?: (matchId: string) => void;
  onPressFindSession?: () => void;
}

export function RecentActivitySection({ myMatches, allActivity, onPressMatch, onPressFindSession }: RecentActivitySectionProps) {
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
          <Text className="text-lg font-semibold text-foreground">Recent Activity</Text>
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
