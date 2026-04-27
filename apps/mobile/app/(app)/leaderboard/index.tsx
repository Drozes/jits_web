import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Trophy, Users } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AthleteCard } from "@/components/athlete-card";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getAthletesStatsRpc } from "@jits/shared/api/queries";
import { extractGymName } from "@jits/shared/utils";
import { toast } from "@/components/ui";
import { cn } from "@/lib/cn";

interface RankedAthlete {
  id: string;
  rank: number;
  displayName: string;
  currentElo: number;
  eloTrend: "up" | "down" | "neutral";
  gymName?: string;
  profilePhotoUrl?: string | null;
  wins: number;
  losses: number;
  isCurrentUser: boolean;
  gender: "M" | "F" | null;
}

interface RankedGym {
  id: string;
  rank: number;
  name: string;
  totalElo: number;
  averageElo: number;
  memberCount: number;
}

function useLeaderboardData(currentAthleteId: string | undefined) {
  const [athletes, setAthletes] = React.useState<RankedAthlete[] | null>(null);
  const [gyms, setGyms] = React.useState<RankedGym[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh") => {
      if (!currentAthleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const { data, error } = await supabase
          .from("athletes")
          .select(
            "id, display_name, current_elo, highest_elo, primary_gym_id, profile_photo_url, gender, gyms!fk_athletes_primary_gym(name)",
          )
          .eq("status", "active")
          .order("current_elo", { ascending: false })
          .limit(50);
        if (error) throw error;

        const athleteIds = (data ?? []).map((a) => a.id);
        const statsMap = await getAthletesStatsRpc(supabase, athleteIds);

        const ranked: RankedAthlete[] = (data ?? []).map((a, i) => {
          const stats = statsMap.get(a.id) ?? { wins: 0, losses: 0, draws: 0 };
          const eloTrend: "up" | "down" | "neutral" =
            a.current_elo === 1000 && a.highest_elo === 1000
              ? "neutral"
              : a.current_elo >= a.highest_elo
                ? "up"
                : "down";
          return {
            id: a.id,
            rank: i + 1,
            displayName: a.display_name,
            currentElo: a.current_elo,
            eloTrend,
            gymName:
              extractGymName(a.gyms as unknown as { name: string } | null) ?? undefined,
            profilePhotoUrl: a.profile_photo_url,
            gender: a.gender as "M" | "F" | null,
            wins: stats.wins,
            losses: stats.losses,
            isCurrentUser: a.id === currentAthleteId,
          };
        });

        // Aggregate gyms
        const gymMap = new Map<
          string,
          { name: string; totalElo: number; memberCount: number }
        >();
        for (const a of data ?? []) {
          if (!a.primary_gym_id) continue;
          const name =
            extractGymName(a.gyms as unknown as { name: string } | null) ?? "Unknown";
          const entry = gymMap.get(a.primary_gym_id) ?? {
            name,
            totalElo: 0,
            memberCount: 0,
          };
          entry.totalElo += a.current_elo;
          entry.memberCount++;
          gymMap.set(a.primary_gym_id, entry);
        }
        const rankedGyms: RankedGym[] = Array.from(gymMap.entries())
          .map(([id, s]) => ({
            id,
            name: s.name,
            totalElo: s.totalElo,
            memberCount: s.memberCount,
            averageElo: Math.round(s.totalElo / s.memberCount),
          }))
          .sort((a, b) => b.totalElo - a.totalElo)
          .map((g, i) => ({ ...g, rank: i + 1 }));

        setAthletes(ranked);
        setGyms(rankedGyms);
      } catch (err) {
        console.error("[leaderboard] fetch failed", err);
        toast.error("Failed to load leaderboard");
      } finally {
        if (mode === "initial") setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [currentAthleteId],
  );

  React.useEffect(() => {
    void fetchAll("initial");
  }, [fetchAll]);

  return { athletes, gyms, isLoading, isRefreshing, refresh: () => fetchAll("refresh") };
}

type GenderFilter = "all" | "male" | "female";

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

function GymRow({ gym }: { gym: RankedGym }) {
  const tokens = useThemedTokens();
  return (
    <Card className="p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-8 items-center">
            {gym.rank <= 3 ? (
              <Trophy
                size={20}
                color={
                  gym.rank === 1
                    ? tokens.gold
                    : gym.rank === 2
                      ? tokens.mutedForeground
                      : tokens.brandOrange
                }
              />
            ) : (
              <Text className="text-sm font-semibold text-muted-foreground">
                #{gym.rank}
              </Text>
            )}
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <Users size={20} color={tokens.primaryForeground} />
          </View>
          <View className="flex-1 min-w-0">
            <Text
              className="text-[15px] font-semibold text-foreground"
              numberOfLines={1}
            >
              {gym.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {gym.memberCount} {gym.memberCount === 1 ? "athlete" : "athletes"} · Avg{" "}
              {gym.averageElo}
            </Text>
          </View>
        </View>
        <Text className="text-lg font-bold tabular-nums text-foreground">
          {gym.totalElo}
        </Text>
      </View>
    </Card>
  );
}

export default function LeaderboardScreen() {
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { athletes, gyms, isLoading, isRefreshing, refresh } = useLeaderboardData(
    athlete?.id,
  );
  const [tab, setTab] = React.useState<"fighters" | "gyms">("fighters");
  const [genderFilter, setGenderFilter] = React.useState<GenderFilter>(() => {
    if (athlete?.gender === "M") return "male";
    if (athlete?.gender === "F") return "female";
    return "all";
  });

  const filteredAthletes = React.useMemo(() => {
    if (!athletes) return [];
    if (genderFilter === "all") return athletes;
    return athletes.filter((a) =>
      genderFilter === "male" ? a.gender === "M" : a.gender === "F",
    );
  }, [athletes, genderFilter]);

  if (authLoading || !athlete || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-3">Rankings</Text>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "fighters" | "gyms")}>
          <TabsList>
            <TabsTrigger value="fighters">Fighters</TabsTrigger>
            <TabsTrigger value="gyms">Gyms</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "fighters" ? (
          <View className="flex-row justify-center gap-1.5 mt-3">
            {GENDER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setGenderFilter(opt.value)}
                className={cn(
                  "rounded-full px-3.5 py-1.5",
                  genderFilter === opt.value ? "bg-primary" : "bg-muted",
                )}
              >
                <Text
                  className={cn(
                    "text-xs font-medium",
                    genderFilter === opt.value
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {tab === "fighters" ? (
        <FlatList
          data={filteredAthletes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
          renderItem={({ item }) => (
            <AthleteCard
              id={item.id}
              rank={item.rank}
              displayName={item.displayName}
              currentElo={item.currentElo}
              eloTrend={item.eloTrend}
              wins={item.wins}
              losses={item.losses}
              gymName={item.gymName}
              profilePhotoUrl={item.profilePhotoUrl}
              isCurrentUser={item.isCurrentUser}
            />
          )}
          ListEmptyComponent={
            <View className="rounded-md border border-dashed border-border p-8 items-center">
              <Text className="text-sm text-muted-foreground">No athletes found</Text>
            </View>
          }
          ListFooterComponent={
            <Text className="text-center text-xs text-muted-foreground py-3">
              Rankings based on current ELO
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={tokens.primary}
            />
          }
        />
      ) : (
        <FlatList
          data={gyms ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
          renderItem={({ item }) => <GymRow gym={item} />}
          ListEmptyComponent={
            <View className="rounded-md border border-dashed border-border p-8 items-center">
              <Text className="text-sm text-muted-foreground">No gyms found</Text>
            </View>
          }
          ListFooterComponent={
            <Text className="text-center text-xs text-muted-foreground py-3">
              Gym rankings based on total member ELO
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={tokens.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
