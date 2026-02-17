import Link from "next/link";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { ReceivedChallengesList } from "./received-challenges-list";
import { SentChallengesList } from "./sent-challenges-list";
import { ActiveMatchesList } from "./active-matches-list";
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

  // Parallelize all independent queries
  const [
    { data: received },
    { data: sent },
    { data: accepted },
    { data: participations },
  ] = await Promise.all([
    // Fetch received challenges
    supabase
      .from("challenges")
      .select(
        "id, created_at, expires_at, match_type, status, challenger_weight, challenger:athletes!fk_challenges_challenger(id, display_name, current_elo)",
      )
      .eq("opponent_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // Fetch sent challenges
    supabase
      .from("challenges")
      .select(
        "id, created_at, expires_at, match_type, status, opponent:athletes!fk_challenges_opponent(id, display_name)",
      )
      .eq("challenger_id", athlete.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // Fetch accepted challenges (waiting in lobby)
    supabase
      .from("challenges")
      .select(
        "id, match_type, challenger_id, challenger:athletes!fk_challenges_challenger(display_name), opponent:athletes!fk_challenges_opponent(display_name)",
      )
      .or(`challenger_id.eq.${athlete.id},opponent_id.eq.${athlete.id}`)
      .eq("status", "accepted")
      .order("created_at", { ascending: false }),
    // Find active matches: first get match IDs where this athlete participates
    supabase
      .from("match_participants")
      .select("match_id")
      .eq("athlete_id", athlete.id),
  ]);

  const myMatchIds = participations?.map((p) => p.match_id) ?? [];

  // Then get those matches that are still active, with all participants
  const { data: matchRows } = myMatchIds.length > 0
    ? await supabase
        .from("matches")
        .select(
          "id, status, match_type, match_participants(athlete_id, athletes!fk_participants_athlete(display_name))",
        )
        .in("id", myMatchIds)
        .in("status", ["pending", "in_progress"])
    : { data: null };

  const now = new Date();

  const receivedChallenges =
    received
      ?.filter((c) => new Date(c.expires_at) > now)
      .map((c) => {
        const challenger = c.challenger as unknown as
          | { id: string; display_name: string; current_elo: number }
          | null;
        return {
          id: c.id,
          challengerName: challenger?.display_name ?? "Unknown",
          challengerId: challenger?.id,
          challengerElo: challenger?.current_elo ?? 1000,
          challengerWeight: c.challenger_weight,
          matchType: c.match_type,
          expiresAt: c.expires_at,
          date: c.created_at,
        };
      }) ?? [];

  const sentChallenges =
    sent
      ?.filter((c) => new Date(c.expires_at) > now)
      .map((c) => {
        const opponent = c.opponent as unknown as
          | { id: string; display_name: string }
          | null;
        return {
          id: c.id,
          opponentName: opponent?.display_name ?? "Unknown",
          opponentId: opponent?.id,
          matchType: c.match_type,
          expiresAt: c.expires_at,
          date: c.created_at,
        };
      }) ?? [];

  // Map accepted challenges to lobby entries
  const lobbies = (accepted ?? []).map((c) => {
    const isChallenger = c.challenger_id === athlete.id;
    const challenger = c.challenger as unknown as { display_name: string } | null;
    const opponent = c.opponent as unknown as { display_name: string } | null;
    const opponentName = isChallenger
      ? (opponent?.display_name ?? "Unknown")
      : (challenger?.display_name ?? "Unknown");
    return {
      challengeId: c.id,
      opponentName,
      matchType: c.match_type,
    };
  });

  // Map active matches with opponent names
  type ParticipantRow = {
    athlete_id: string;
    athletes: { display_name: string }[] | null;
  };
  const activeMatches = (matchRows ?? []).map((m) => {
    const participants = m.match_participants as unknown as ParticipantRow[];
    const opponent = participants?.find((p) => p.athlete_id !== athlete.id);
    const opponentName = opponent?.athletes?.[0]?.display_name ?? "Opponent";
    return {
      matchId: m.id,
      opponentName,
      matchType: m.match_type,
      status: m.status,
    };
  });

  return (
    <>
      <AppHeader title="Matches" back />
      <PageContainer className="pt-6">
        <div className="flex flex-col gap-6">
          <ActiveMatchesList lobbies={lobbies} matches={activeMatches} />
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
                <SentChallengesList challenges={sentChallenges} />
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
