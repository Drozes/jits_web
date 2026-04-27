import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BarChart3, Swords } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompareStatsModal, type HeadToHeadMatch } from "@/components/compare-stats-modal";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import {
  getAthleteStatsRpc,
  getMatchHistory,
  getPendingChallengeBetween,
  type AthleteStatsRpc,
} from "@jits/shared/api/queries";
import { extractGymName, getInitials } from "@jits/shared/utils";
import { toast } from "@/components/ui";
import { env } from "@/lib/env";
import type { Athlete } from "@jits/shared/types/athlete";

interface ProfileData {
  competitor: Athlete;
  competitorGymName: string | null;
  compStats: AthleteStatsRpc;
  myStats: AthleteStatsRpc;
  pendingChallengeId: string | null;
  headToHead: HeadToHeadMatch[];
}

function buildPhotoUrl(profilePhotoUrl: string | null | undefined): string | null {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  try {
    return `${env.supabaseUrl}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  } catch {
    return null;
  }
}

function useProfileData(competitorId: string | undefined, currentAthleteId: string | undefined) {
  const [data, setData] = React.useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!competitorId || !currentAthleteId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [
          { data: competitorRow, error: compErr },
          compStats,
          myStats,
          pending,
          history,
        ] = await Promise.all([
          supabase
            .from("athletes")
            .select("*, gyms!fk_athletes_primary_gym(name)")
            .eq("id", competitorId)
            .maybeSingle(),
          getAthleteStatsRpc(supabase, competitorId),
          getAthleteStatsRpc(supabase, currentAthleteId),
          getPendingChallengeBetween(supabase, currentAthleteId, competitorId),
          getMatchHistory(supabase, currentAthleteId),
        ]);
        if (cancelled) return;
        if (compErr || !competitorRow) {
          setNotFound(true);
          return;
        }
        const headToHead: HeadToHeadMatch[] = history
          .filter((m) => m.opponent_id === competitorId)
          .map((m) => ({
            matchType: m.match_type as "ranked" | "casual",
            result: m.athlete_outcome as "win" | "loss" | "draw" | null,
          }));
        const gymName = extractGymName(
          competitorRow.gyms as unknown as { name: string } | null,
        );
        setData({
          competitor: competitorRow as unknown as Athlete,
          competitorGymName: gymName,
          compStats,
          myStats,
          pendingChallengeId: pending?.id ?? null,
          headToHead,
        });
      } catch (err) {
        console.error("[athlete-profile] fetch failed", err);
        if (!cancelled) toast.error("Failed to load profile");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [competitorId, currentAthleteId]);

  return { data, isLoading, notFound };
}

function ProfileHeader({
  athlete,
  gymName,
  stats,
}: {
  athlete: Athlete;
  gymName: string | null;
  stats: AthleteStatsRpc;
}) {
  const photoUri = buildPhotoUrl(athlete.profile_photo_url);
  return (
    <Card className="p-5 items-center gap-3">
      <View className="h-24 w-24 rounded-full bg-primary items-center justify-center overflow-hidden">
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Text className="text-2xl font-bold text-primary-foreground">
            {getInitials(athlete.display_name)}
          </Text>
        )}
      </View>
      <View className="items-center">
        <Text className="text-xl font-bold text-foreground">{athlete.display_name}</Text>
        {gymName ? (
          <Text className="text-sm text-muted-foreground">{gymName}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-6 mt-2">
        <View className="items-center">
          <Text className="text-2xl font-bold tabular-nums text-foreground">
            {athlete.current_elo}
          </Text>
          <Text className="text-xs text-muted-foreground">ELO</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold tabular-nums text-success">{stats.wins}</Text>
          <Text className="text-xs text-muted-foreground">Wins</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold tabular-nums text-destructive">{stats.losses}</Text>
          <Text className="text-xs text-muted-foreground">Losses</Text>
        </View>
        <View className="items-center">
          <Text className="text-2xl font-bold tabular-nums text-amber-500">{stats.draws}</Text>
          <Text className="text-xs text-muted-foreground">Draws</Text>
        </View>
      </View>
      <View className="flex-row gap-2 mt-2">
        {athlete.looking_for_ranked ? (
          <Badge variant="default">
            <Text className="text-[10px] font-semibold text-primary-foreground">Ranked</Text>
          </Badge>
        ) : null}
        {athlete.looking_for_casual ? (
          <Badge variant="secondary">
            <Text className="text-[10px] font-semibold text-secondary-foreground">Casual</Text>
          </Badge>
        ) : null}
      </View>
    </Card>
  );
}

function HeadToHeadCard({ matches }: { matches: HeadToHeadMatch[] }) {
  const tokens = useThemedTokens();
  const wins = matches.filter((m) => m.result === "win").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const draws = matches.filter((m) => m.result === "draw").length;

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Swords size={18} color={tokens.primary} />
        <Text className="text-base font-semibold text-foreground">Head-to-Head</Text>
      </View>
      {matches.length === 0 ? (
        <View className="items-center py-2">
          <Text className="text-sm text-muted-foreground">No history yet</Text>
          <Text className="text-xs text-muted-foreground mt-1">
            Challenge them to your first match!
          </Text>
        </View>
      ) : (
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-xl font-bold tabular-nums text-success">{wins}</Text>
            <Text className="text-[11px] text-muted-foreground">Wins</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-bold tabular-nums text-destructive">{losses}</Text>
            <Text className="text-[11px] text-muted-foreground">Losses</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-bold tabular-nums text-amber-500">{draws}</Text>
            <Text className="text-[11px] text-muted-foreground">Draws</Text>
          </View>
          <View className="items-center">
            <Text className="text-xl font-bold tabular-nums text-foreground">
              {matches.length}
            </Text>
            <Text className="text-[11px] text-muted-foreground">Total</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, isLoading, notFound } = useProfileData(id, athlete?.id);
  const [compareOpen, setCompareOpen] = React.useState(false);

  if (authLoading || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  if (notFound || !data || !athlete) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={20} color={tokens.foreground} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-foreground">Athlete not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ArrowLeft size={20} color={tokens.foreground} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <ProfileHeader
          athlete={data.competitor}
          gymName={data.competitorGymName}
          stats={data.compStats}
        />

        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            leftIcon={<BarChart3 size={16} color={tokens.foreground} />}
            onPress={() => setCompareOpen(true)}
          >
            Compare Stats
          </Button>
          <Button
            className="flex-1"
            leftIcon={<Swords size={16} color={tokens.primaryForeground} />}
            onPress={() => toast.info("Challenges coming soon")}
            disabled={!!data.pendingChallengeId}
          >
            {data.pendingChallengeId ? "Pending" : "Challenge"}
          </Button>
        </View>

        <HeadToHeadCard matches={data.headToHead} />
      </ScrollView>

      <CompareStatsModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        currentAthlete={{
          displayName: athlete.display_name,
          elo: athlete.current_elo,
          ...data.myStats,
          weight: athlete.current_weight,
        }}
        competitor={{
          displayName: data.competitor.display_name,
          elo: data.competitor.current_elo,
          ...data.compStats,
          weight: data.competitor.current_weight,
        }}
        headToHead={data.headToHead}
      />
    </SafeAreaView>
  );
}
