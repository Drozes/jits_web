import { notFound } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChallengeVersusCard } from "@/components/domain/challenge-versus-card";
import { ChallengeVersusActions } from "@/components/domain/challenge-versus-actions";
import { getChallengesBetween } from "@/lib/api/queries";
import { Swords, History, Clock } from "lucide-react";
import type { ChallengeStatus, MatchType } from "@/lib/constants";

export async function ChallengesContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: competitorId } = await paramsPromise;
  const { athlete: currentAthlete } = await requireAthlete();
  const supabase = await createClient();

  const { data: competitor } = await supabase
    .from("athletes")
    .select("id, display_name")
    .eq("id", competitorId)
    .single();

  if (!competitor) notFound();

  const challenges = await getChallengesBetween(supabase, currentAthlete.id, competitorId);

  const now = new Date();
  const active = challenges.filter(
    (c) => (c.status === "pending" || c.status === "accepted") && new Date(c.expires_at) > now,
  );
  const history = challenges.filter(
    (c) => c.status !== "pending" && c.status !== "accepted" || new Date(c.expires_at) <= now,
  );

  return (
    <>
      <AppHeader title={`vs ${competitor.display_name}`} back />
      <PageContainer className="pt-6">
        <Tabs defaultValue="active">
          <TabsList className="w-full">
            <TabsTrigger value="active" className="flex-1 gap-1.5">
              <Swords className="h-4 w-4" />
              Active
              {active.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{active.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="h-4 w-4" />
              History
              {history.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{history.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {active.length > 0 ? (
              <div className="flex flex-col gap-3">
                {active.map((c) => {
                  const isSender = c.challenger.id === currentAthlete.id;
                  return (
                    <div key={c.id} className="flex flex-col gap-2">
                      <ChallengeVersusCard
                        challenger={{ id: c.challenger.id, displayName: c.challenger.display_name }}
                        opponent={{ id: c.opponent.id, displayName: c.opponent.display_name }}
                        status={c.status as ChallengeStatus}
                        matchType={c.match_type}
                        date={c.created_at}
                        currentAthleteId={currentAthlete.id}
                      />
                      <ChallengeVersusActions
                        challengeId={c.id}
                        isSender={isSender}
                        expiresAt={c.expires_at}
                        challengerName={c.challenger.display_name}
                        challengerElo={c.challenger.current_elo}
                        challengerWeight={c.challenger_weight}
                        matchType={c.match_type as MatchType}
                        currentAthleteElo={currentAthlete.current_elo}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="No active challenges" Icon={Clock} />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {history.length > 0 ? (
              <div className="flex flex-col gap-3">
                {history.map((c) => (
                  <ChallengeVersusCard
                    key={c.id}
                    challenger={{ id: c.challenger.id, displayName: c.challenger.display_name }}
                    opponent={{ id: c.opponent.id, displayName: c.opponent.display_name }}
                    status={c.status as ChallengeStatus}
                    matchType={c.match_type}
                    date={c.created_at}
                    currentAthleteId={currentAthlete.id}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message="No past challenges" Icon={History} />
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>
    </>
  );
}

function EmptyState({ message, Icon }: { message: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
