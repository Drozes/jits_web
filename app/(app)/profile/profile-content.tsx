import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/domain/profile-header";
import { DisplayNameEditor } from "@/components/profile/display-name-editor";
import { LogoutButton } from "@/components/logout-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Trophy,
  Target,
  Swords,
  Award,
  Settings,
} from "lucide-react";

export async function ProfileContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch win/loss stats from match_participants
  const { data: outcomes } = await supabase
    .from("match_participants")
    .select("outcome")
    .eq("athlete_id", athlete.id)
    .not("outcome", "is", null);

  const wins = outcomes?.filter((o) => o.outcome === "win").length ?? 0;
  const losses = outcomes?.filter((o) => o.outcome === "loss").length ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

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

  const achievements = [
    { name: "Win Streak", value: "12", icon: Trophy, color: "text-yellow-600" },
    { name: "Quick Finisher", value: "< 3min", icon: Target, color: "text-blue-600" },
    { name: "Sub Master", value: "89%", icon: Swords, color: "text-green-600" },
    { name: "Rank Climber", value: "+15", icon: Award, color: "text-purple-600" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DisplayNameEditor
        athleteId={athlete.id}
        initialName={athlete.display_name}
      />

      <ProfileHeader
        athlete={athlete}
        gymName={gymName}
        stats={{ wins, losses, winRate }}
      />

      <div className="flex gap-2">
        <Button className="flex-1" variant="outline" asChild>
          <Link href="/profile/stats">
            <Trophy className="mr-2 h-4 w-4" />
            View Stats
          </Link>
        </Button>
      </div>

      {/* Achievements */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Award className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Recent Achievements</h3>
        </div>
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

      {/* Account Section */}
      <section>
        <Separator className="mb-4" />
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3">Account</h4>
            <div className="flex flex-col gap-1">
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
