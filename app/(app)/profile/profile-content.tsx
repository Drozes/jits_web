import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { EditableProfileHeader } from "@/components/profile/editable-profile-header";
import { LogoutButton } from "@/components/logout-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShareProfileSheet } from "@/components/domain/share-profile-sheet";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AchievementsSection } from "./achievements-section";
import { getMatchHistory } from "@/lib/api/queries";
import { Trophy, Settings, Share2, Palette, UserPen } from "lucide-react";

const DEMO_DATA = {
  wins: 18,
  losses: 6,
  winRate: 75,
  winStreak: 5,
  fastestWin: 147, // 2:27
  submissionRate: 72,
  eloThisMonth: 45,
  totalMatches: 24,
};

export async function ProfileContent({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const isDemo = demo === "true";
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Use RPC for match history (bypasses RLS, returns complete data)
  const matchHistory = await getMatchHistory(supabase, athlete.id);

  // Compute stats from match history
  const wins = matchHistory.filter((m) => m.athlete_outcome === "win").length;
  const losses = matchHistory.filter((m) => m.athlete_outcome === "loss").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Win streak (matchHistory is newest first)
  let winStreak = 0;
  for (const m of matchHistory) {
    if (m.athlete_outcome === "win") winStreak++;
    else break;
  }

  // Fetch gym name via join
  let gymName: string | null = null;
  if (athlete.primary_gym_id) {
    const { data: gym } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", athlete.primary_gym_id)
      .single();
    gymName = gym?.name ?? null;
  }

  // Submission stats
  const submissionWins = matchHistory.filter(
    (m) => m.athlete_outcome === "win" && m.result === "submission",
  ).length;
  const submissionRate =
    wins > 0 ? Math.round((submissionWins / wins) * 100) : 0;

  // Fastest win (finish_time_seconds from RPC)
  const winFinishTimes = matchHistory
    .filter((m) => m.athlete_outcome === "win" && m.finish_time_seconds > 0)
    .map((m) => m.finish_time_seconds);
  const fastestWin =
    winFinishTimes.length > 0 ? Math.min(...winFinishTimes) : null;

  // ELO change this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const eloThisMonth = matchHistory
    .filter((m) => new Date(m.completed_at) >= startOfMonth)
    .reduce((sum, m) => sum + (m.elo_delta ?? 0), 0);

  const totalMatches = wins + losses;

  // Use demo data when ?demo=true is in the URL
  const d = isDemo ? DEMO_DATA : null;
  const displayStats = d
    ? { wins: d.wins, losses: d.losses, winRate: d.winRate }
    : { wins, losses, winRate };

  return (
    <div className="flex flex-col gap-6 animate-page-in">
      <EditableProfileHeader
        athlete={athlete}
        gymName={gymName}
        stats={displayStats}
      />

      <div className="flex gap-2">
        <Button className="flex-1" variant="outline" asChild>
          <Link href="/profile/stats">
            <Trophy className="mr-2 h-4 w-4" />
            View Stats
          </Link>
        </Button>
        <ShareProfileSheet
          athlete={{
            id: athlete.id,
            displayName: athlete.display_name,
            elo: athlete.current_elo,
            wins: displayStats.wins,
            losses: displayStats.losses,
            weight: athlete.current_weight,
            gymName,
          }}
        >
          <Button variant="outline" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
        </ShareProfileSheet>
      </div>

      <AchievementsSection
        totalMatches={d?.totalMatches ?? totalMatches}
        winStreak={d?.winStreak ?? winStreak}
        fastestWin={d?.fastestWin ?? fastestWin}
        submissionRate={d?.submissionRate ?? submissionRate}
        eloThisMonth={d?.eloThisMonth ?? eloThisMonth}
        isDemo={isDemo}
        hasRealData={totalMatches > 0}
      />

      {/* Account Section */}
      <section>
        <Separator className="mb-4" />
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3">Account</h4>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between h-9 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Palette className="mr-3 h-4 w-4" />
                  <span className="text-sm font-medium">Theme</span>
                </div>
                <ThemeSwitcher />
              </div>
              <Button variant="ghost" className="w-full justify-start" asChild>
                <Link href="/profile/setup">
                  <UserPen className="mr-3 h-4 w-4" />
                  Edit Profile
                </Link>
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-3 h-4 w-4" />
                Settings & Privacy
              </Button>
              <LogoutButton />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
