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
  matchType: "ranked" | "casual";
  eloDelta: number;
  date: string;
}

interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  matchType: string;
  date: string;
}

type Scope = "me" | "all";
type TypeFilter = "all" | "ranked" | "casual";

const scopeOptions: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Me" },
];

const typeOptions: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ranked", label: "Ranked" },
  { value: "casual", label: "Casual" },
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
          {item.matchType ? ` · ${item.matchType === "ranked" ? "Ranked" : "Casual"}` : ""}
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
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");

  const filteredMatches = typeFilter === "all" ? myMatches : myMatches.filter((m) => m.matchType === typeFilter);
  const filteredActivity = typeFilter === "all" ? allActivity : allActivity.filter((a) => a.matchType === typeFilter);

  const hasContent = scope === "me" ? filteredMatches.length > 0 : filteredActivity.length > 0;

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

      <View className="flex-row items-center gap-2.5">
        <View className="flex-row gap-1">
          {scopeOptions.map((o) => (
            <FilterPill key={o.value} value={o.value} label={o.label} active={scope === o.value} onSelect={setScope} />
          ))}
        </View>
        <View className="h-4 w-px bg-border" />
        <View className="flex-row gap-1">
          {typeOptions.map((o) => (
            <FilterPill key={o.value} value={o.value} label={o.label} active={typeFilter === o.value} onSelect={setTypeFilter} />
          ))}
        </View>
      </View>

      {scope === "me" ? (
        hasContent ? (
          <View className="gap-2">
            {filteredMatches.map((m) => (
              <MatchCard
                key={m.id}
                type="match"
                opponentName={m.opponentName}
                opponentPhotoUrl={m.opponentPhotoUrl}
                result={m.result}
                matchType={m.matchType}
                eloDelta={m.matchType === "ranked" ? m.eloDelta : undefined}
                date={m.date}
                onPress={onPressMatch ? () => onPressMatch(m.id) : undefined}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            message={typeFilter === "all" ? "No matches yet. Join a session to get started!" : `No ${typeFilter} matches yet. Join a session to get started!`}
            showLink
            onPressLink={onPressFindSession ?? (() => router.push("/(app)/gyms"))}
          />
        )
      ) : hasContent ? (
        <Card>
          {filteredActivity.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 ? <View className="h-px bg-border" /> : null}
              <ActivityFeedItem item={item} />
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState message={typeFilter === "all" ? "No recent activity yet. Join a session to get started!" : `No recent ${typeFilter} activity yet`} />
      )}
    </View>
  );
}
