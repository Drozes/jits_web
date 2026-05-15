import { notFound } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import {
  getPendingChallengeBetween,
  getAthleteStatsRpc,
  getMatchHistory,
} from "@jits/shared/api/queries";
import { extractGymName, formatRelativeDate } from "@jits/shared/utils";
import { ProfileHero } from "../../profile/profile-hero";
import { ProfileStatsGrid } from "../../profile/profile-stats-grid";
import { ProfileHistoryList } from "../../profile/profile-history-list";
import { AthleteProfileActions } from "./athlete-profile-actions";

export async function AthleteProfileContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: athleteId } = await paramsPromise;
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  const [
    { data: competitor },
    compStats,
    myStats,
    pendingChallenge,
    matchHistory,
  ] = await Promise.all([
    supabase
      .from("athletes")
      .select("*, gyms!fk_athletes_primary_gym(name)")
      .eq("id", athleteId)
      .single(),
    getAthleteStatsRpc(supabase, athleteId),
    getAthleteStatsRpc(supabase, currentAthlete.id),
    getPendingChallengeBetween(supabase, currentAthlete.id, athleteId),
    getMatchHistory(supabase, currentAthlete.id),
  ]);

  if (!competitor) notFound();

  const gymsData = competitor.gyms as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const competitorGymName = extractGymName(gymsData);

  // Rank for competitor
  const { count: higherCount } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("current_elo", competitor.current_elo);
  const rank = (higherCount ?? 0) + 1;

  // Head-to-head from current athlete's history
  const headToHead = matchHistory.filter((m) => m.opponent_id === competitor.id);
  const headToHeadCompact = headToHead.map((m) => ({
    matchType: m.match_type as "ranked" | "casual",
    result: m.athlete_outcome as "win" | "loss" | "draw" | null,
  }));

  const recent = headToHead.slice(0, 6).map((m) => ({
    matchId: m.match_id,
    opponentName: m.opponent_display_name ?? competitor.display_name,
    gymName: null as string | null,
    outcome: (m.athlete_outcome ?? "draw") as "win" | "loss" | "draw",
    when: formatRelativeDate(m.completed_at),
    delta: m.elo_delta ?? 0,
  }));

  // Competitor's own win streak (computed only from H2H; best-effort)
  const compStreak = compStats.winStreak ?? 0;
  const compTotal = compStats.wins + compStats.losses + compStats.draws;

  return (
    <>
      <AppHeader title="Athlete" back />
      <div className="flex flex-col animate-page-in">
        <ProfileHero
          name={competitor.display_name}
          gymName={competitorGymName}
          weightKg={competitor.current_weight}
          photoUrl={competitor.profile_photo_url}
          elo={competitor.current_elo}
          rank={rank}
        />
        <ProfileStatsGrid
          totalMatches={compTotal}
          winRate={compStats.winRate}
          peak={competitor.highest_elo}
          streak={compStreak}
        />

        <div
          style={{
            padding: "var(--space-4) var(--space-4) var(--space-2)",
            background: "var(--bg-primary)",
          }}
        >
          <AthleteProfileActions
            competitorId={competitor.id}
            currentAthleteId={currentAthlete.id}
            currentAthlete={{
              displayName: currentAthlete.display_name,
              elo: currentAthlete.current_elo,
              ...myStats,
              weight: currentAthlete.current_weight,
            }}
            competitor={{
              displayName: competitor.display_name,
              elo: competitor.current_elo,
              ...compStats,
              weight: competitor.current_weight,
            }}
            headToHead={headToHeadCompact}
            pendingChallengeId={pendingChallenge?.id ?? null}
          />
        </div>

        <SectionLabel
          label={recent.length > 0 ? "Head-to-Head" : "No Matches Yet"}
          meta={recent.length > 0 ? `Last ${recent.length}` : undefined}
        />
        <ProfileHistoryList rows={recent} />
      </div>
    </>
  );
}

function SectionLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center"
      style={{
        padding: "var(--space-5) var(--space-5) var(--space-3)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-xl)",
      }}
    >
      <span>{label}</span>
      {meta && (
        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
          {meta}
        </span>
      )}
    </div>
  );
}
