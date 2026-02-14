import { redirect } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { MATCH_STATUS, MATCH_TYPE } from "@/lib/constants";
import { MatchLobbyClient } from "./match-lobby-client";

export async function MatchLobbyContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: challengeId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  // Fetch the challenge with both athletes
  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select(
      "id, match_type, challenger_weight, opponent_weight, status, challenger:athletes!fk_challenges_challenger(id, display_name, current_elo), opponent:athletes!fk_challenges_opponent(id, display_name, current_elo)",
    )
    .eq("id", challengeId)
    .single();

  if (challengeError || !challenge) {
    redirect("/match/pending");
  }

  // Must be accepted to enter lobby
  if (challenge.status !== "accepted") {
    redirect("/match/pending");
  }

  const challengerArr = challenge.challenger as
    | { id: string; display_name: string; current_elo: number }[]
    | null;
  const opponentArr = challenge.opponent as
    | { id: string; display_name: string; current_elo: number }[]
    | null;
  const challenger = challengerArr?.[0];
  const opponent = opponentArr?.[0];

  if (!challenger || !opponent) {
    redirect("/match/pending");
  }

  // Determine which side the current user is on
  const isChallenger = challenger.id === athlete.id;
  const currentAthlete = isChallenger ? challenger : opponent;
  const rivalAthlete = isChallenger ? opponent : challenger;

  // Check if a match already exists for this challenge
  const { data: existingMatch } = await supabase
    .from("matches")
    .select("id, status")
    .eq("challenge_id", challengeId)
    .single();

  // If match already started, redirect to live
  if (existingMatch?.status === MATCH_STATUS.IN_PROGRESS) {
    redirect(`/match/${existingMatch.id}/live`);
  }
  if (existingMatch?.status === MATCH_STATUS.COMPLETED) {
    redirect(`/match/${existingMatch.id}/results`);
  }

  // Get ELO stakes for ranked matches
  let eloStakes = null;
  if (challenge.match_type === MATCH_TYPE.RANKED) {
    const { data } = await supabase.rpc("calculate_elo_stakes", {
      challenger_elo: challenger.current_elo,
      opponent_elo: opponent.current_elo,
    });
    eloStakes = data;
  }

  return (
    <>
      <AppHeader title="Match Lobby" back />
      <PageContainer className="pt-6">
        <MatchLobbyClient
          challengeId={challengeId}
          existingMatchId={existingMatch?.id ?? null}
          matchType={challenge.match_type}
          currentAthlete={{
            id: currentAthlete.id,
            displayName: currentAthlete.display_name,
            elo: currentAthlete.current_elo,
            weight: isChallenger
              ? challenge.challenger_weight
              : challenge.opponent_weight,
          }}
          rivalAthlete={{
            id: rivalAthlete.id,
            displayName: rivalAthlete.display_name,
            elo: rivalAthlete.current_elo,
            weight: isChallenger
              ? challenge.opponent_weight
              : challenge.challenger_weight,
          }}
          eloStakes={
            eloStakes
              ? {
                  winDelta: isChallenger
                    ? eloStakes.challenger_win
                    : eloStakes.opponent_win,
                  lossDelta: isChallenger
                    ? eloStakes.challenger_loss
                    : eloStakes.opponent_loss,
                }
              : null
          }
        />
      </PageContainer>
    </>
  );
}
