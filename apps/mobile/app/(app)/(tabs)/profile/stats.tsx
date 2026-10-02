import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Swords } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import {
  getEloHistory,
  getMatchHistory,
  getSubmissionBreakdownRpc,
} from "@jits/shared/api/queries";
import type { EloHistoryRow, MatchHistoryRow } from "@jits/shared/types/composites";
import type { SubmissionOutcome, SubmissionOutcomeCount } from "@jits/shared/types/analytics";
import { MatchCard } from "@/components/match-card";
import { SubmissionBreakdownSection } from "@/components/profile/submission-breakdown";
import { WeeklyActivitySection } from "@/components/profile/weekly-activity";
import { EloProgressionChart } from "@/components/profile/elo-progression";
import { AppHeader } from "@/components/layout/app-header";
import { Chip, MetaTag } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { matchDetailHref } from "@/lib/match-detail/href";
import type { MatchOutcome } from "@jits/shared/constants";
import {
  STATS_WINDOWS,
  buildEloProgression,
  buildWeeklyActivity,
  recordedEloDelta,
  statsWindowSince,
  type StatsWindow,
} from "@jits/shared/utils";

interface StatsData {
  /** The window (and its p_since) these rows were fetched for. */
  window: StatsWindow;
  since: string | null;
  matchHistory: MatchHistoryRow[];
  eloHistory: EloHistoryRow[];
}

/** Top Submissions rows tagged with the outcome and window that produced them. */
interface SubmissionsResult {
  outcome: SubmissionOutcome;
  window: StatsWindow;
  rows: SubmissionOutcomeCount[];
  error: boolean;
}

const WINDOW_A11Y: Record<StatsWindow, string> = {
  "30d": "Show the last 30 days",
  "90d": "Show the last 90 days",
  "1y": "Show the last year",
  all: "Show all time",
};

export default function ProfileStatsScreen() {
  const { athlete } = useRequireAthlete();
  const tokens = useThemedTokens();
  const router = useRouter();
  const [data, setData] = React.useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  // The timeline window drives the whole page (jits-02vo.4); default ALL.
  const [timeWindow, setTimeWindow] = React.useState<StatsWindow>("all");
  const [outcome, setOutcome] = React.useState<SubmissionOutcome>("wins");
  const [submissions, setSubmissions] = React.useState<SubmissionsResult | null>(null);

  React.useEffect(() => {
    if (!athlete) return;
    let cancelled = false;
    setIsLoading(true);
    const since = statsWindowSince(timeWindow);
    (async () => {
      try {
        const [matchHistory, eloHistory] = await Promise.all([
          getMatchHistory(supabase, athlete.id, since),
          getEloHistory(supabase, athlete.id, since),
        ]);
        if (!cancelled) setData({ window: timeWindow, since, matchHistory, eloHistory });
      } catch (err) {
        console.error("[stats] fetch failed", err);
        if (!cancelled) toast.error("Could not load stats");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [athlete?.id, timeWindow, refreshTick]);

  // Top Submissions refetches on its own when only the Wins/Losses toggle
  // changes, so flipping it does not reload the rest of the page.
  React.useEffect(() => {
    if (!athlete) return;
    let cancelled = false;
    const since = statsWindowSince(timeWindow);
    (async () => {
      try {
        const rows = await getSubmissionBreakdownRpc(supabase, athlete.id, { since, outcome });
        if (!cancelled) setSubmissions({ outcome, window: timeWindow, rows, error: false });
      } catch (err) {
        console.error("[stats] submissions fetch failed", err);
        if (!cancelled) setSubmissions({ outcome, window: timeWindow, rows: [], error: true });
      }
    })();
    return () => { cancelled = true; };
  }, [athlete?.id, timeWindow, outcome, refreshTick]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Rows from a previous window stay on screen (dimmed) until the new
  // window's fetch lands; the match list shows the loading spinner instead.
  const stale = data !== null && data.window !== timeWindow;
  // Only show submissions fetched for the current outcome and window, so a
  // toggle never labels the previous outcome's rows with the new W/L suffix.
  const currentSubmissions =
    submissions && submissions.outcome === outcome && submissions.window === timeWindow
      ? submissions
      : null;
  const matchHistory = data?.matchHistory ?? [];
  // Every match is ranked: the record covers all completed matches (no filter).
  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const draws = matchHistory.filter((m) => m.athlete_outcome === "draw").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const weeklyActivity = React.useMemo(
    () => (data ? buildWeeklyActivity(data.matchHistory) : null),
    [data],
  );

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.textTertiary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Stats" back />

      <FlatList
        data={stale ? [] : matchHistory}
        keyExtractor={(m) => m.match_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.textTertiary} />}
        ListHeaderComponent={
          <StatsHeader
            athlete={athlete}
            data={data}
            stale={stale}
            isLoading={isLoading}
            timeWindow={timeWindow}
            onWindowChange={setTimeWindow}
            weeklyActivity={weeklyActivity}
            submissions={currentSubmissions?.rows ?? null}
            submissionsError={currentSubmissions?.error ?? false}
            outcome={outcome}
            onOutcomeChange={setOutcome}
            wins={wins}
            losses={losses}
            draws={draws}
            winRate={winRate}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="py-12 items-center"><ActivityIndicator color={tokens.textTertiary} /></View>
          ) : (
            <View className="py-12 items-center gap-2">
              <Swords size={28} color={tokens.textTertiary} />
              <Text className="font-heading text-callout text-ink uppercase tracking-caps">
                {timeWindow === "all" ? "No matches yet" : "No matches in this window"}
              </Text>
              <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
                {timeWindow === "all" ? "Complete a match to see your history" : "Pick a longer window to see more"}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MatchCard
            type="match"
            opponentName={item.opponent_display_name}
            result={item.athlete_outcome as MatchOutcome}
            eloDelta={recordedEloDelta(item) ?? undefined}
            date={item.completed_at}
            onPress={() => router.push(matchDetailHref(item.match_id))}
          />
        )}
      />
    </View>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  valueClassName?: string;
}

function StatTile({ label, value, valueClassName }: StatTileProps) {
  return (
    <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-3 py-3 items-center">
      <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className={`font-mono-bold tabular-nums text-title-xl mt-1 ${valueClassName ?? "text-ink"}`}
      >
        {value}
      </Text>
    </View>
  );
}

function StatsHeader({
  athlete,
  data,
  stale,
  isLoading,
  timeWindow,
  onWindowChange,
  weeklyActivity,
  submissions,
  submissionsError,
  outcome,
  onOutcomeChange,
  wins,
  losses,
  draws,
  winRate,
}: {
  athlete: { current_elo: number };
  data: StatsData | null;
  stale: boolean;
  isLoading: boolean;
  timeWindow: StatsWindow;
  onWindowChange: (w: StatsWindow) => void;
  weeklyActivity: ReturnType<typeof buildWeeklyActivity> | null;
  submissions: SubmissionOutcomeCount[] | null;
  submissionsError: boolean;
  outcome: SubmissionOutcome;
  onOutcomeChange: (o: SubmissionOutcome) => void;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}) {
  const tokens = useThemedTokens();
  return (
    <View className="gap-4 mb-2">
      <View className="flex-row gap-2" accessibilityLabel="Timeline">
        {STATS_WINDOWS.map((w) => (
          <Chip
            key={w.value}
            active={timeWindow === w.value}
            onPress={() => onWindowChange(w.value)}
            accessibilityLabel={WINDOW_A11Y[w.value]}
          >
            {w.label}
          </Chip>
        ))}
        {isLoading && data && (
          <View testID="stats-window-loading" className="justify-center">
            <ActivityIndicator size="small" color={tokens.textTertiary} />
          </View>
        )}
      </View>

      <View
        testID="stats-window-body"
        className="gap-4"
        style={{ opacity: stale ? 0.4 : 1 }}
        accessibilityState={{ busy: stale }}
      >
        <View className="flex-row gap-3">
          <StatTile label="ELO" value={athlete.current_elo} />
          <StatTile label="Wins" value={wins} />
          <StatTile label="Win Rate" value={`${winRate}%`} />
        </View>

        {data && (
          <EloProgressionChart
            progression={buildEloProgression(data.eloHistory, athlete.current_elo, {
              since: data.since,
            })}
          />
        )}

        {weeklyActivity && <WeeklyActivitySection weeks={weeklyActivity} />}
      </View>

      <SubmissionBreakdownSection
        submissions={submissions}
        error={submissionsError}
        outcome={outcome}
        onOutcomeChange={onOutcomeChange}
      />

      <View
        className="flex-row items-center justify-between"
        style={{ opacity: stale ? 0.4 : 1 }}
      >
        <MetaTag>Record</MetaTag>
        <View className="flex-row items-center gap-2">
          <Text className="font-mono-bold text-caption text-ink tabular-nums">{wins}W</Text>
          <Text className="font-mono tabular-nums text-caption text-ink-3">·</Text>
          <Text className="font-mono-bold text-caption text-negative tabular-nums">{losses}L</Text>
          <Text className="font-mono tabular-nums text-caption text-ink-3">·</Text>
          <Text className="font-mono text-caption text-ink-3 tabular-nums">{draws}D</Text>
        </View>
      </View>

      <MetaTag>Match History</MetaTag>
    </View>
  );
}
