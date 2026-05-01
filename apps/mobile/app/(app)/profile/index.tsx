import * as React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Settings, Share2, Trophy, UserPen } from "lucide-react-native";
import { useAuth, useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getAthleteStatsRpc, type AthleteStatsRpc } from "@jits/shared/api/queries";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileQuickStats } from "@/components/profile/profile-quick-stats";
import { ShareProfileSheet } from "@/components/share-profile-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";

export default function ProfileScreen() {
  const { athlete } = useRequireAthlete();
  const { signOut } = useAuth();
  const router = useRouter();
  const tokens = useThemedTokens();

  const [stats, setStats] = React.useState<AthleteStatsRpc | null>(null);
  const [gymName, setGymName] = React.useState<string | null>(null);
  const [eloThisMonth, setEloThisMonth] = React.useState<number>(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (!athlete) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [statsResult, gymResult] = await Promise.all([
          getAthleteStatsRpc(supabase, athlete.id),
          athlete.primary_gym_id
            ? supabase.from("gyms").select("name").eq("id", athlete.primary_gym_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;
        setStats(statsResult);
        setGymName((gymResult.data as { name: string } | null)?.name ?? null);

        // Fetch month-to-date ELO change via match history
        const { data: history } = await supabase.rpc("get_match_history", { p_athlete_id: athlete.id });
        if (cancelled) return;
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const monthly = (history ?? [])
          .filter((m: { completed_at: string }) => new Date(m.completed_at) >= startOfMonth)
          .reduce((sum: number, m: { elo_delta: number | null }) => sum + (m.elo_delta ?? 0), 0);
        setEloThisMonth(monthly);
      } catch (err) {
        console.error("[profile] fetch failed", err);
        if (!cancelled) toast.error("Could not load profile");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [athlete?.id, athlete?.primary_gym_id, refreshTick, athlete]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  if (!athlete) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} />}
    >
      <Text className="text-2xl font-bold text-foreground">Profile</Text>

      {isLoading && !stats ? (
        <View className="py-16 items-center">
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : (
        <>
          <ProfileHeader
            athlete={athlete}
            gymName={gymName}
            stats={{
              wins: stats?.wins ?? 0,
              losses: stats?.losses ?? 0,
              winRate: stats?.winRate ?? 0,
            }}
          />

          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => router.push("/(app)/profile/stats")}>
              <Trophy size={16} className="text-foreground" />
              <Text className="text-sm font-medium text-foreground ml-2">View Stats</Text>
            </Button>
            <ShareProfileSheet
              athlete={{
                id: athlete.id,
                displayName: athlete.display_name ?? "",
                elo: athlete.current_elo,
                wins: stats?.wins ?? 0,
                losses: stats?.losses ?? 0,
                weight: athlete.current_weight,
                gymName,
              }}
            >
              <Button variant="outline" size="icon">
                <Share2 size={16} className="text-foreground" />
              </Button>
            </ShareProfileSheet>
          </View>

          <ProfileQuickStats
            totalMatches={stats?.totalMatches ?? 0}
            winStreak={stats?.winStreak ?? 0}
            bestWinStreak={stats?.bestWinStreak ?? 0}
            eloThisMonth={eloThisMonth}
          />

          <View>
            <Separator className="mb-4" />
            <Card>
              <CardContent className="p-4">
                <Text className="text-base font-semibold text-foreground mb-3">Account</Text>
                <View className="gap-1">
                  <SettingsRow
                    icon={<UserPen size={16} className="text-foreground" />}
                    label="Edit Profile"
                    onPress={() => Alert.alert("Coming soon", "Profile editing coming soon.")}
                  />
                  <SettingsRow
                    icon={<Settings size={16} className="text-foreground" />}
                    label="Settings & Privacy"
                    onPress={() => router.push("/(app)/settings")}
                  />
                  <SettingsRow
                    label="Sign Out"
                    labelClassName="text-destructive"
                    onPress={async () => {
                      await signOut();
                    }}
                  />
                </View>
              </CardContent>
            </Card>
          </View>

          <Text className="text-center text-xs text-muted-foreground pb-2">JITS v0.1.0</Text>
        </>
      )}
    </ScrollView>
  );
}

function SettingsRow({ icon, label, labelClassName, onPress }: { icon?: React.ReactNode; label: string; labelClassName?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center px-3 h-10 rounded-lg active:bg-muted/60">
      {icon ? <View className="mr-3">{icon}</View> : null}
      <Text className={`text-sm font-medium ${labelClassName ?? "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}
