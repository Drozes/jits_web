import { redirect } from "next/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EloBadge } from "@/components/domain/elo-badge";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { getLobbyData, getEloStakes } from "@/lib/api/queries";
import { getInitials, getProfilePhotoUrl } from "@/lib/utils";
import { MATCH_TYPE } from "@/lib/constants";
import { LobbyActions } from "./lobby-actions";

export async function LobbyContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id: challengeId } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const lobby = await getLobbyData(supabase, challengeId);
  if (!lobby) redirect("/match/pending");

  const isChallenger = athlete.id === lobby.challenger.id;
  const stakes =
    lobby.match_type === MATCH_TYPE.RANKED
      ? await getEloStakes(
          supabase,
          lobby.challenger.current_elo,
          lobby.opponent.current_elo,
          lobby.challenger_weight,
          lobby.opponent_weight,
        )
      : null;

  return (
    <div className="space-y-6 animate-page-in">
      <VsHeader challenger={lobby.challenger} opponent={lobby.opponent} />

      <div className="text-center">
        <Badge
          variant={
            lobby.match_type === MATCH_TYPE.RANKED ? "default" : "secondary"
          }
        >
          {lobby.match_type === MATCH_TYPE.RANKED ? "Ranked" : "Casual"} Match
        </Badge>
      </div>

      {stakes && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground text-center mb-2">
              ELO Stakes
            </p>
            <div className="flex justify-center gap-4 text-sm font-semibold">
              <span className="text-green-500">
                Win: +{isChallenger ? stakes.challenger_win : stakes.opponent_win}
              </span>
              <span className="text-amber-500">
                Draw: {isChallenger ? stakes.challenger_draw : stakes.opponent_draw}
              </span>
              <span className="text-red-500">
                Loss: {isChallenger ? stakes.challenger_loss : stakes.opponent_loss}
              </span>
            </div>
            {stakes.weight_division_gap > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                {stakes.weight_division_gap} weight class{stakes.weight_division_gap > 1 ? "es" : ""} apart
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <LobbyActions
        challengeId={challengeId}
        status={lobby.status as "pending" | "accepted"}
        isChallenger={isChallenger}
        currentWeight={isChallenger ? undefined : lobby.opponent.current_weight}
      />
    </div>
  );
}

function AthleteColumn({
  name,
  elo,
  weight,
  profilePhotoUrl,
}: {
  name: string;
  elo: number;
  weight: number | null;
  profilePhotoUrl?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <Avatar className="h-16 w-16 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md">
        {profilePhotoUrl && (
          <AvatarImage src={getProfilePhotoUrl(profilePhotoUrl)!} alt={name} className="object-cover" />
        )}
        <AvatarFallback className="bg-gradient-to-br from-primary to-red-600 text-white text-lg">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <p className="font-semibold text-sm truncate max-w-full">{name}</p>
      <EloBadge elo={elo} variant="compact" />
      {weight && (
        <p className="text-xs text-muted-foreground">{weight} lbs</p>
      )}
    </div>
  );
}

function VsHeader({
  challenger,
  opponent,
}: {
  challenger: { display_name: string; current_elo: number; current_weight: number | null; profile_photo_url?: string | null };
  opponent: { display_name: string; current_elo: number; current_weight: number | null; profile_photo_url?: string | null };
}) {
  return (
    <div className="flex items-center gap-4">
      <AthleteColumn
        name={challenger.display_name}
        elo={challenger.current_elo}
        weight={challenger.current_weight}
        profilePhotoUrl={challenger.profile_photo_url}
      />
      <span className="text-2xl font-black text-muted-foreground shrink-0">
        VS
      </span>
      <AthleteColumn
        name={opponent.display_name}
        elo={opponent.current_elo}
        weight={opponent.current_weight}
        profilePhotoUrl={opponent.profile_photo_url}
      />
    </div>
  );
}
