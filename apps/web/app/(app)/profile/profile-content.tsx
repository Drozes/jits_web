import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getAthleteStatsRpc, getMatchHistory } from "@jits/shared/api/queries";
import { formatRelativeDate } from "@jits/shared/utils";
import { ProfileHero } from "./profile-hero";
import { ProfileStatsGrid } from "./profile-stats-grid";
import { ProfileHistoryList } from "./profile-history-list";
import { ProfileFooterActions } from "./profile-footer-actions";
import { HeaderShareButton } from "./header-share-button";

export async function ProfileContent({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  await searchParams;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const [stats, matchHistory] = await Promise.all([
    getAthleteStatsRpc(supabase, athlete.id),
    getMatchHistory(supabase, athlete.id),
  ]);

  // Gym name
  let gymName: string | null = null;
  if (athlete.primary_gym_id) {
    const { data: gym } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", athlete.primary_gym_id)
      .single();
    gymName = gym?.name ?? null;
  }

  // Rank via count of active athletes with higher ELO. Best-effort placeholder.
  const { count: higherCount } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("current_elo", athlete.current_elo);
  const rank = (higherCount ?? 0) + 1;

  let winStreak = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") winStreak++;
    else break;
  }

  const totalMatches = stats.wins + stats.losses + stats.draws;
  const recent = matchHistory.slice(0, 6).map((m) => ({
    matchId: m.match_id,
    opponentName: m.opponent_display_name ?? "Opponent",
    gymName: null as string | null,
    outcome: (m.athlete_outcome ?? "draw") as "win" | "loss" | "draw",
    when: formatRelativeDate(m.completed_at),
    delta: m.elo_delta ?? 0,
  }));

  const shareAthlete = {
    id: athlete.id,
    displayName: athlete.display_name,
    elo: athlete.current_elo,
    wins: stats.wins,
    losses: stats.losses,
    weight: athlete.current_weight,
    gymName,
  };

  return (
    <>
      <AppHeader
        title="Profile"
        rightAction={<HeaderShareButton athlete={shareAthlete} />}
      />
      <div className="flex flex-col animate-page-in">
        <ProfileHero
          name={athlete.display_name}
          gymName={gymName}
          weightKg={athlete.current_weight}
          photoUrl={athlete.profile_photo_url}
          elo={athlete.current_elo}
          rank={rank}
        />
        <ProfileStatsGrid
          totalMatches={totalMatches}
          winRate={stats.winRate}
          peak={athlete.highest_elo}
          streak={winStreak}
        />
        <SectionLabel label="Recent Matches" meta="Last 6" />
        <ProfileHistoryList rows={recent} />
        <div className="px-3 pb-2">
          <Link
            href="/profile/stats"
            className="block text-center font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
              padding: "var(--space-3)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-xs)",
              textDecoration: "none",
            }}
          >
            View Detailed Stats →
          </Link>
        </div>
        <ProfileFooterActions athlete={shareAthlete} />
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
