import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Target, Swords, Award, Crosshair } from "lucide-react";
import Link from "next/link";

interface AchievementsSectionProps {
  totalMatches: number;
  winStreak: number;
  fastestWin: number | null;
  submissionRate: number;
  eloThisMonth: number;
  isDemo?: boolean;
  hasRealData?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AchievementsSection({
  totalMatches,
  winStreak,
  fastestWin,
  submissionRate,
  eloThisMonth,
  isDemo,
  hasRealData,
}: AchievementsSectionProps) {
  if (totalMatches === 0 && !isDemo) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Award className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Achievements</h3>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <Crosshair className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium">No matches yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete your first match to start tracking achievements
            </p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <Link
                href="/arena"
                className="text-sm text-primary font-medium hover:underline"
              >
                Find a match
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link
                href="/profile?demo=true"
                className="text-sm text-muted-foreground font-medium hover:underline"
              >
                Preview with sample data
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const eloPrefix = eloThisMonth > 0 ? "+" : "";

  const achievements = [
    {
      name: "Win Streak",
      value: String(winStreak),
      icon: Trophy,
      color: "text-yellow-600",
    },
    {
      name: "Quick Finish",
      value: fastestWin !== null ? formatDuration(fastestWin) : "—",
      icon: Target,
      color: "text-blue-600",
    },
    {
      name: "Sub Rate",
      value: `${submissionRate}%`,
      icon: Swords,
      color: "text-green-600",
    },
    {
      name: "ELO This Month",
      value: `${eloPrefix}${eloThisMonth}`,
      icon: Award,
      color: "text-purple-600",
    },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Award className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Achievements</h3>
      </div>
      {isDemo && !hasRealData && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 mb-3 text-sm">
          <span className="text-muted-foreground">Viewing sample data</span>
          <Link
            href="/profile"
            className="text-primary font-medium hover:underline"
          >
            Dismiss
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {achievements.map((achievement) => {
          const Icon = achievement.icon;
          return (
            <Card key={achievement.name}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${achievement.color}`} />
                  <div>
                    <p className="text-sm font-medium">{achievement.name}</p>
                    <p className="text-lg font-bold text-primary">
                      {achievement.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
