import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MatchCard } from "@/components/domain/match-card";
import { ReceivedChallengesList } from "./received-challenges-list";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Inbox, Send, Info, Search } from "lucide-react";

export async function PendingChallengesContent() {
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch received challenges
  const { data: received } = await supabase
    .from("challenges")
    .select(
      "id, created_at, match_type, status, challenger_weight, challenger:athletes!fk_challenges_challenger(id, display_name, current_elo)",
    )
    .eq("opponent_id", athlete.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Fetch sent challenges
  const { data: sent } = await supabase
    .from("challenges")
    .select(
      "id, created_at, match_type, status, opponent:athletes!fk_challenges_opponent(id, display_name)",
    )
    .eq("challenger_id", athlete.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const receivedChallenges =
    received?.map((c) => {
      const challenger = (
        c.challenger as unknown as Array<{
          id: string;
          display_name: string;
          current_elo: number;
        }>
      )?.[0];
      return {
        id: c.id,
        challengerName: challenger?.display_name ?? "Unknown",
        challengerId: challenger?.id,
        challengerElo: challenger?.current_elo ?? 1000,
        challengerWeight: c.challenger_weight,
        matchType: c.match_type,
        date: c.created_at,
      };
    }) ?? [];

  const sentChallenges =
    sent?.map((c) => {
      const opponent = (
        c.opponent as unknown as Array<{
          id: string;
          display_name: string;
        }>
      )?.[0];
      return {
        id: c.id,
        opponentName: opponent?.display_name ?? "Unknown",
        opponentId: opponent?.id,
        matchType: c.match_type,
        date: c.created_at,
      };
    }) ?? [];

  return (
    <>
      <AppHeader title="Pending Challenges" back />
      <PageContainer className="pt-6">
        <div className="flex flex-col gap-6">
          <Tabs defaultValue="received">
            <TabsList className="w-full">
              <TabsTrigger value="received" className="flex-1 gap-1.5">
                <Inbox className="h-4 w-4" />
                Received
                {receivedChallenges.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {receivedChallenges.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 gap-1.5">
                <Send className="h-4 w-4" />
                Sent
                {sentChallenges.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {sentChallenges.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="received" className="mt-4">
              {receivedChallenges.length > 0 ? (
                <ReceivedChallengesList
                  challenges={receivedChallenges}
                  currentAthleteElo={athlete.current_elo}
                />
              ) : (
                <EmptyState message="No challenges received yet" />
              )}
            </TabsContent>

            <TabsContent value="sent" className="mt-4">
              {sentChallenges.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {sentChallenges.map((challenge) => (
                    <MatchCard
                      key={challenge.id}
                      type="challenge"
                      opponentName={challenge.opponentName}
                      status="Pending"
                      date={challenge.date}
                      href={
                        challenge.opponentId
                          ? `/athlete/${challenge.opponentId}`
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No challenges sent yet" />
              )}
            </TabsContent>
          </Tabs>

          {/* Info card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">
                    How challenges work
                  </p>
                  <p>
                    Send a challenge from an athlete&apos;s profile. Once
                    accepted, you&apos;ll both enter a match lobby to confirm
                    details and start.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      <Button variant="outline" size="sm" asChild>
        <Link href="/arena">
          <Search className="mr-2 h-4 w-4" />
          Find opponents
        </Link>
      </Button>
    </div>
  );
}
