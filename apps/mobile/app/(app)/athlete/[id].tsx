import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowUpRight, BarChart3 } from "lucide-react-native";
import { CompareStatsModal } from "@/components/compare-stats-modal";
import { CompetitorHeader } from "@/components/athlete/competitor-header";
import { HeadToHeadCard } from "@/components/athlete/head-to-head-card";
import { AppHeader } from "@/components/layout/app-header";
import { MetaTag, ParticipantRow } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { HistoryRowAction } from "@/components/profile/history-row-action";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAthleteProfile } from "@/lib/athlete/use-athlete-profile";
import { toast } from "@/components/ui";
import { buildShareUrl, buildShareText, formatRelativeDate } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { getMatchHistory } from "@jits/shared/api/queries";
import { matchDetailHref } from "@/lib/match-detail/href";
import type { MatchHistoryRow } from "@jits/shared/types/composites";
import { useBlockState } from "@/lib/moderation/block-store";
import { AthleteModerationSheet, type AthleteSheetMode } from "@/components/moderation/athlete-moderation-sheet";
import { BlockedAthleteState, MoreActionsButton } from "@/components/moderation/blocked-athlete-state";

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
      <View pointerEvents="none">
        <ArrowUpRight size={18} color={tokens.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useThemedTokens();
  const router = useRouter();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, isLoading, notFound } = useAthleteProfile(id, athlete?.id);
  const [compareOpen, setCompareOpen] = React.useState(false);
  // Report and block (App Review 1.2): never on your own profile.
  const [sheetMode, setSheetMode] = React.useState<AthleteSheetMode | null>(null);
  const blocks = useBlockState();
  const isSelf = !!athlete && athlete.id === id;
  const blockedByMe = !!id && blocks.mine.has(id);
  // Either direction (a deep link to someone who blocked me lands here too).
  const blocked = !!id && !isSelf && blocks.ids.has(id);

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

  // Until the block sets are read once, a deep link to a blocked profile
  // must not flash its stats (a failed read settles too, so this never sticks).
  const blocksPending = !isSelf && !blocks.settled;
  if (authLoading || isLoading || blocksPending) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athlete" back />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.textTertiary} />
        </View>
      </View>
    );
  }

  if (notFound || !data || !athlete) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athlete" back />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-heading text-callout text-ink uppercase tracking-caps">
            Athlete Not Found
          </Text>
        </View>
      </View>
    );
  }

  const competitorName = data.competitor.display_name || "this athlete";

  return (
    <View className="flex-1 bg-surface">
      <AppHeader
        title={data.competitor.display_name ?? "Athlete"}
        back
        rightAction={
          <View className="flex-row items-center gap-2">
            {blocked ? null : <ShareButton athleteId={data.competitor.id} displayName={data.competitor.display_name} />}
            {isSelf ? null : <MoreActionsButton onPress={() => setSheetMode("menu")} />}
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}
      >
        {/* A block either way hides the profile itself, not just the actions. */}
        {blocked ? (
          <BlockedAthleteState athlete={{ id: data.competitor.id, name: competitorName }} blockedByMe={blockedByMe} />
        ) : (
          <>
            <CompetitorHeader
              athlete={data.competitor}
              gymName={data.competitorGymName}
              stats={data.compStats}
            />

            {/* No Challenge button here (jits-qwn5): challenges happen in the
                Arena, and a disabled "coming soon" CTA read as broken. */}
            <View className="gap-2">
              <Button
                variant="secondary"
                label="Compare Stats"
                onPress={() => setCompareOpen(true)}
                icon={(color) => (
                  <View pointerEvents="none">
                    <BarChart3 size={16} color={color} />
                  </View>
                )}
              />
            </View>

            <HeadToHeadCard matches={data.headToHead} />

            <View className="gap-3">
              <MetaTag>
                {recent.length > 0 ? `Recent vs ${data.competitor.display_name}` : "No Matches Yet"}
              </MetaTag>
              {recent.length > 0 ? (
                <View className="gap-[1px]">
                  {recent.map((m) => {
                    const name = m.opponent_display_name ?? data.competitor.display_name;
                    // These are the VIEWER's own matches (their history filtered to
                    // this opponent), so the detail screen will let them in.
                    return (
                      <ParticipantRow
                        key={m.match_id}
                        name={`vs ${name}`}
                        subtitle={formatRelativeDate(m.completed_at)}
                        onPress={() => router.push(matchDetailHref(m.match_id))}
                        accessibilityLabel={`Open match vs ${name}`}
                        action={<HistoryRowAction eloDelta={m.elo_delta} eloAfter={m.elo_after} />}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {isSelf ? null : (
        <AthleteModerationSheet
          mode={sheetMode}
          onModeChange={setSheetMode}
          athlete={{ id: data.competitor.id, name: competitorName }}
          blockedByMe={blockedByMe}
        />
      )}

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
      />
    </View>
  );
}
