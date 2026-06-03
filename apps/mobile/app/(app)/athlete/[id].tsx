import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArrowUpRight, BarChart3, Swords } from "lucide-react-native";
import { CompareStatsModal } from "@/components/compare-stats-modal";
import { CompetitorHeader } from "@/components/athlete/competitor-header";
import { HeadToHeadCard } from "@/components/athlete/head-to-head-card";
import { AppHeader } from "@/components/layout/app-header";
import { MetaTag, ParticipantRow, DeltaNumber } from "@/components/ui/elo-system";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAthleteProfile } from "@/lib/athlete/use-athlete-profile";
import { toast } from "@/components/ui";
import { buildShareUrl, buildShareText, formatRelativeDate } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { getMatchHistory } from "@jits/shared/api/queries";
import type { MatchHistoryRow } from "@jits/shared/types/composites";

function ShareButton({
  athleteId,
  displayName,
}: {
  athleteId: string;
  displayName: string;
}) {
  const tokens = useThemedTokens();
  async function handleShare() {
    try {
      const url = buildShareUrl("athlete", athleteId);
      const text = buildShareText({ type: "athlete", data: { displayName } });
      await Share.share({ title: `${displayName} on ELO RATED`, message: `${text}: ${url}`, url });
    } catch (err) {
      console.warn("[athlete] share failed", err);
      toast.error("Could not share");
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share"
      onPress={handleShare}
      hitSlop={10}
      className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
    >
      <ArrowUpRight size={18} color={tokens.textSecondary} />
    </Pressable>
  );
}

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, isLoading, notFound } = useAthleteProfile(id, athlete?.id);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const [recent, setRecent] = React.useState<MatchHistoryRow[]>([]);
  React.useEffect(() => {
    if (!athlete?.id || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const history = await getMatchHistory(supabase, athlete.id);
        if (!cancelled) {
          const h2h = history.filter((m) => m.opponent_id === id).slice(0, 6);
          setRecent(h2h);
        }
      } catch (err) {
        console.warn("[athlete] recent fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athlete?.id, id]);

  if (authLoading || isLoading) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athlete" back />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (notFound || !data || !athlete) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athlete" back />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps">
            Athlete Not Found
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader
        title={data.competitor.display_name ?? "Athlete"}
        back
        rightAction={<ShareButton athleteId={data.competitor.id} displayName={data.competitor.display_name} />}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      >
        <CompetitorHeader
          athlete={data.competitor}
          gymName={data.competitorGymName}
          stats={data.compStats}
        />

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => toast.info("Challenges coming soon")}
            disabled
            className="flex-row items-center justify-center gap-2 bg-cta rounded-sm px-5 py-4 opacity-60"
          >
            <Swords size={16} color={tokens.textOnAccent} />
            <Text className="font-heading text-[12px] text-ink-on-cta uppercase tracking-caps">
              Challenge
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCompareOpen(true)}
            className="flex-row items-center justify-center gap-2 bg-surface-3 border border-hairline-strong rounded-sm px-5 py-4 active:bg-surface-4"
          >
            <BarChart3 size={16} color={tokens.textPrimary} />
            <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
              Compare Stats
            </Text>
          </Pressable>
        </View>

        <HeadToHeadCard matches={data.headToHead} />

        <View className="gap-3">
          <MetaTag>
            {recent.length > 0 ? `Recent vs ${data.competitor.display_name}` : "No Matches Yet"}
          </MetaTag>
          {recent.length > 0 ? (
            <View className="gap-[1px]">
              {recent.map((m) => (
                <ParticipantRow
                  key={m.match_id}
                  name={`vs ${m.opponent_display_name ?? data.competitor.display_name}`}
                  subtitle={formatRelativeDate(m.completed_at)}
                  action={
                    m.match_type === "ranked" && m.elo_delta != null ? (
                      <DeltaNumber value={m.elo_delta} size="m" showSign />
                    ) : undefined
                  }
                />
              ))}
            </View>
          ) : null}
        </View>
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
    </View>
  );
}
